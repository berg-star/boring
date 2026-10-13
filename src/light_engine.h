#pragma once
#include <array>
#include <string>
#include <utility>

// Independent deterministic simulation, shared by live rooms and the rules test.
struct LightArena {
    static constexpr int Width = 18, Height = 24;
    struct Point { int x = 0, y = 0; };
    std::string trail = std::string(Width * Height, '.');
    std::array<Point, 2> heads{}, hits{};
    std::array<int, 2> directions{{0, 2}}; // north, east, south, west
    std::array<std::string, 2> reasons{};
    int step = 0, winner = -2;
    static bool inside(Point p) { return p.x >= 0 && p.x < Width && p.y >= 0 && p.y < Height; }
    void reset(bool swapped) {
        trail.assign(Width * Height, '.'); heads = {{{4, 12}, {13, 11}}};
        directions = {{0, 2}};
        if (swapped) { std::swap(heads[0], heads[1]); std::swap(directions[0], directions[1]); }
        hits = heads; reasons = {{"", ""}}; step = 0; winner = -2;
        for (int side = 0; side < 2; ++side) trail[heads[side].y * Width + heads[side].x] = char('0' + side);
    }
    void advance(const std::array<int, 2>& turns) {
        if (winner != -2) return;
        static constexpr std::array<Point, 4> delta{{{0, -1}, {1, 0}, {0, 1}, {-1, 0}}};
        for (int side = 0; side < 2; ++side) {
            directions[side] = (directions[side] + turns[side] + 4) % 4;
            const auto d = delta[directions[side]];
            hits[side] = {heads[side].x + d.x, heads[side].y + d.y};
            reasons[side] = !inside(hits[side]) ? "wall"
                : trail[hits[side].y * Width + hits[side].x] != '.' ? "trail" : "";
        }
        if (hits[0].x == hits[1].x && hits[0].y == hits[1].y) reasons = {{"head-on", "head-on"}};
        // Both destinations are checked before either trail is extended.
        for (int side = 0; side < 2; ++side) {
            if (!reasons[side].empty()) continue;
            heads[side] = hits[side]; trail[heads[side].y * Width + heads[side].x] = char('0' + side);
        }
        ++step;
        const bool left = !reasons[0].empty(), right = !reasons[1].empty();
        if (left || right) winner = left && right ? -1 : left ? 1 : 0;
    }
};
