const std = @import("std");
const zjb = @import("zjb");
// const log = @import("log.zig");
// const alloc = std.heap.wasm_allocator;

const GRID_MAP_PTR_OFFSET: usize = @sizeOf(f32);
const GRID_MAP_PTR: [*]f32 = @ptrFromInt(GRID_MAP_PTR_OFFSET);

fn set(x: f32, y: f32, w: i32, v: f32) void {
    const row: usize = @intFromFloat(@round(y));
    const col: usize = @intFromFloat(@round(x));
    const idx: usize = @as(usize, @intCast(w)) * row + col;
    // log.logInfo(alloc, "{d}, {d} ({d}): {d}", .{ x, y, w, idx });

    GRID_MAP_PTR[idx] = v;
}

export fn placeBoundaryLine(x0: f32, y0: f32, x1: f32, y1: f32, w: i32) void {
    var x0m = x0;
    var y0m = y0;
    const dx: f32 = @abs(x1 - x0m);
    const sx: f32 = if (x0m < x1) 1.0 else -1.0;
    const dy: f32 = @abs(y1 - y0m) * -1.0;
    const sy: f32 = if (y0m < y1) 1.0 else -1.0;
    var err = dx + dy;
    while (true) {
        set(x0m, y0m, w, 1.0);
        // log.logInfo(alloc, "{d}, {d}", .{ x0m, y0m });
        if (x0m == x1 and y0m == y1) break;
        const err_double = err * 2.0;
        if (err_double >= dy) {
            err += dy;
            x0m += sx;
        }
        if (err_double <= dx) {
            err += dx;
            y0m += sy;
        }
    }
}
comptime {
    zjb.exportFn("placeBoundaryLine", placeBoundaryLine);
}
