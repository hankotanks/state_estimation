// instantiate the zig-js bridge
const BRIDGE = new Zjb();

const CONFIG = {
    'w': 160,
    'h': 160,
};

class Grid {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.bounds = [[]];
        this.dataView = new Float32Array(this.w * this.h);
    }

    updateMemory(memory) {
        const BUFFER_OFFSET = Float32Array.BYTES_PER_ELEMENT;
        const BUFFER_ELEM_COUNT = this.w * this.h
        // create centered view on grid in WASM memory
        const view = new Float32Array(memory.buffer, BUFFER_OFFSET, BUFFER_ELEM_COUNT);
        // copy current grid into this view
        view.set(this.dataView);
        // replace grid source with WASM memory buffer
        this.dataView = view;
    }

    addToCurrentPolyline(x, y) {
        const polyline = this.bounds[this.bounds.length - 1];

        const points = polyline.length;
        if (points > 1) {
            if (Math.abs(polyline[0][0] - x) < 0.01 && Math.abs(polyline[0][1] - y) < 0.01) {
                polyline.push(polyline[0])
                this.bounds.push([]);
            } else if (Math.abs(polyline[points - 1][0] - x) < 0.01 && Math.abs(polyline[points - 1][1] - y) < 0.01) {
                this.bounds.push([]);
            } else {
                polyline.push([x, y]);
            }
        } else { polyline.push([x, y]); }
    }

    popFromCurrentPolyline() {
        if (this.bounds.length > 0) {
            const polyline = this.bounds[this.bounds.length - 1];
            if (polyline.length > 0) {
                polyline.pop();
            } else if (this.bounds.length > 1) {
                this.bounds.pop();
                this.popFromCurrentPolyline();
            }
        }
    }

    popSegments() {
        const segments = [];
        for (const polyline of this.bounds) {
            for (let i = 0; i < polyline.length - 1; i++) {
                const x0 = Math.round(polyline[i][0] * this.w);
                const y0 = Math.round(polyline[i][1] * this.h);
                const x1 = Math.round(polyline[i + 1][0] * this.w);
                const y1 = Math.round(polyline[i + 1][1] * this.h);

                segments.push([x0, y0, x1, y1]);
            }
        }

        this.bounds = [[]];

        return segments;
    }

    draw(canvas) {
        const ctx = canvas.getContext('2d');
        // clear the canvas
        ctx.fillStyle = 'black';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // determine cell size
        const cellWidth = canvas.width / this.w;
        const cellHeight = canvas.height / this.h;
        // color each cell according to its value
        for (let i = 0; i < this.h; i++) {
            for (let j = 0; j < this.w; j++) {
                const cell = this.dataView[i * this.w + j];
                // placeholder
                if (cell > 0.5) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(cellWidth * j, cellHeight * i, cellWidth + 1, cellHeight + 1);
                }
            }
        }       

        ctx.lineWidth = Math.sqrt(cellWidth * cellHeight) * 0.5;

        for (let i = 0; i < this.bounds.length; i++) {
            const polyline = this.bounds[i];

            if (polyline.length > 0) {
                const x0 = polyline[0][0] * canvas.width;
                const y0 = polyline[0][1] * canvas.height;
                if (i + 1 == this.bounds.length) {
                    ctx.fillStyle = 'red';
                    ctx.beginPath();
                    ctx.arc(x0, y0, 0.005 * Math.sqrt(canvas.width * canvas.height), 0.0, 2.0 * Math.PI);
                    ctx.fill();
                }

                if (polyline.length > 1) {
                    ctx.strokeStyle = 'lightgray';
                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    for (let i = 1; i < polyline.length; i++) {
                        const x = polyline[i][0] * canvas.width;
                        const y = polyline[i][1] * canvas.height;
                        ctx.lineTo(x, y);
                    }
                    
                    ctx.stroke();

                    if (i + 1 == this.bounds.length) {
                        const xf = polyline[polyline.length - 1][0] * canvas.width;
                        const yf = polyline[polyline.length - 1][1] * canvas.height;
                        ctx.fillStyle = 'green';
                        ctx.beginPath();
                        ctx.arc(xf, yf, 0.005 * Math.sqrt(canvas.width * canvas.height), 0.0, 2.0 * Math.PI);
                        ctx.fill();
                    }
                }
            }
        }
    }
}

class Module {
    constructor(module) {
        this.memory = module.instance.exports.memory;
        this.exports = BRIDGE.exports;
    }

    static async build(bin, grid, aux) {
        let bytes = 0;
        bytes += grid.h * grid.w * Float32Array.BYTES_PER_ELEMENT; // grid
        bytes += Float32Array.BYTES_PER_ELEMENT; // 4 byte offset
        bytes += aux; // extra space
        // number of pages required
        const initial = Math.ceil(bytes) / Math.pow(2, 16);
        // configure WASM memory
        const params = {
            zjb: BRIDGE.imports,
            env: {
                memory: new WebAssembly.Memory({ initial: initial }),
                __stack_pointer: 0,
            },
        };
        // request the module
        const request = fetch(bin);
        // init WASM
        const module = await WebAssembly.instantiateStreaming(request, params);
        // configure ZJB
        BRIDGE.setInstance(module.instance);
        // write MAP into WASM memory
        const memory = module.instance.exports.memory;
        grid.updateMemory(memory);
        // return pared-down module
        return new Module(module);
    }
}

const init = async _ => {
    // this is the overlay layer for widgets
    const overlay = document.getElementById('overlay');
    // initialize the grid
    const grid = new Grid(CONFIG.w, CONFIG.h);
    // instantiate WASM module
    const setupModule = await Module.build('setup.wasm', grid, 0);
    // get handle to canvas and its context
    const canvas = document.querySelector('body > canvas');
    // populate relevant widgets to overlay
    const configureSetupModuleOverlay = _ => {
        let temp = document.createElement('button');
        // append it to the DOM
        overlay.appendChild(temp);
        // add label
        temp.appendChild(document.createTextNode('Place Boundaries'));
        temp.onclick = _ => {
            for (const [x0, y0, x1, y1] of grid.popSegments()) {
                setupModule.exports.placeBoundaryLine(x0, y0, x1, y1, Number(grid.w));
            }

            grid.draw(canvas);
        };
    }

    configureSetupModuleOverlay();

    canvas.onclick = event => {
        const r = canvas.getBoundingClientRect();
        const x = (event.clientX - r.left) / canvas.width;
        const y = (event.clientY - r.top) / canvas.height;
        grid.addToCurrentPolyline(x, y);
        grid.draw(canvas);
    };

    canvas.oncontextmenu = _ => {
        grid.popFromCurrentPolyline();
        grid.draw(canvas);
        return false;
    }

    // helper function to resize canvas
    const resizeCanvas = _ => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        grid.draw(canvas);
    };

    // resize once on load
    resizeCanvas();

    // resize canvas whenever the viewport dimensions change
    let sinceLastResize;
    window.onresize = _ => {
        clearTimeout(sinceLastResize);
        sinceLastResize = setTimeout(resizeCanvas, 250);
    };
};

init();

