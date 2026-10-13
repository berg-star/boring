#include "../src/light_engine.h"
#include <cassert>
#include <iostream>

static LightArena fixture(LightArena::Point a, LightArena::Point b, int da, int db) {
    LightArena arena; arena.heads = {{a, b}}; arena.directions = {{da, db}};
    for (int i = 0; i < 2; ++i) arena.trail[arena.heads[i].y * arena.Width + arena.heads[i].x] = char('0' + i);
    return arena;
}
int main() {
    LightArena arena; arena.reset(false);
    assert(arena.heads[0].x == 4 && arena.heads[1].x == 13 && arena.trail[12 * 18 + 4] == '0');
    arena.advance({{0, 0}});
    assert(arena.heads[0].y == 11 && arena.heads[1].y == 12 && arena.winner == -2);
    arena.advance({{-1, 1}});
    assert(arena.heads[0].x == 3 && arena.heads[1].x == 12 && arena.directions[0] == 3 && arena.directions[1] == 3);
    arena.reset(true);
    assert(arena.heads[0].x == 13 && arena.heads[0].y == 11 && arena.directions[0] == 2);
    assert(arena.heads[1].x == 4 && arena.directions[1] == 0 && arena.step == 0);
    // Entering a single empty cell together must be a draw, with neither trail written there.
    arena = fixture({4, 5}, {6, 5}, 1, 3); arena.advance({{0, 0}});
    assert(arena.winner == -1 && arena.reasons[0] == "head-on" && arena.reasons[1] == "head-on");
    assert(arena.trail[5 * 18 + 5] == '.' && arena.heads[0].x == 4);
    // Swapping heads is also a collision: the previous occupied cells remain solid.
    arena = fixture({4, 5}, {5, 5}, 1, 3); arena.advance({{0, 0}});
    assert(arena.winner == -1 && arena.reasons[0] == "trail" && arena.reasons[1] == "trail");
    arena = fixture({0, 2}, {17, 20}, 3, 1); arena.advance({{0, 0}});
    assert(arena.winner == -1 && arena.reasons[0] == "wall" && arena.reasons[1] == "wall");
    arena = fixture({0, 2}, {10, 20}, 3, 0); arena.advance({{0, 0}});
    assert(arena.winner == 1 && arena.heads[1].y == 19 && arena.trail[19 * 18 + 10] == '1');
    const auto saved = arena.trail; const auto step = arena.step; arena.advance({{1, -1}});
    assert(arena.trail == saved && arena.step == step);
    for (const char owner : {'0', '1'}) {
        arena = fixture({4, 5}, {10, 20}, 1, 0); arena.trail[5 * 18 + 5] = owner;
        arena.advance({{0, 0}}); assert(arena.winner == 1 && arena.reasons[0] == "trail");
    }
    // Four right turns close a small loop into one's initial trail.
    arena = fixture({4, 5}, {10, 20}, 0, 0);
    for (int i = 0; i < 4; ++i) arena.advance({{1, 0}});
    assert(arena.winner == 1 && arena.reasons[0] == "trail" && arena.step == 4);
    arena.reset(false);
    for (int i = 0; i < 13; ++i) arena.advance({{0, 0}});
    assert(arena.winner == -1 && arena.step == 13);
    std::cout << "PASS: relative turns, swapped starts, walls, own/opponent trails, head-on and head-swap draws, simultaneous updates and immutable results\n";
}
