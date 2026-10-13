#pragma once
#include <crow.h>
#include <array>
#include <chrono>
#include <cmath>
#include <mutex>
#include <random>
#include <string>
#include <unordered_map>

// 4x4 dots, 24 edges, 9 boxes. The server owns every turn, edge and score.
class LandRooms {
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    using Socket = crow::websocket::connection;
    struct Room {
        std::string code, notice, phase = "waiting";
        std::array<std::string, 2> tokens;
        std::array<Socket*, 2> clients{{nullptr, nullptr}};
        std::array<Time, 2> disconnectedAt{};
        std::array<bool, 2> ready{{false, false}};
        std::array<int, 24> edges{};
        std::array<int, 9> boxes{};
        std::array<int, 2> scores{{0, 0}};
        int run = 0, ply = 0, first = 0, turn = 0, lastEdge = -1, lastSide = -1;
        Time touched = Clock::now();
    };
    struct Session { std::string room; int side; };
    std::mutex mutex_;
    std::unordered_map<std::string, Room> rooms_;
    std::unordered_map<Socket*, Session> sessions_;
    std::random_device entropy_;
    static long long elapsed(Time start, Time now) {
        return std::chrono::duration_cast<std::chrono::milliseconds>(now - start).count();
    }
    std::string randomText(std::size_t size, const std::string& alphabet) {
        std::string value;
        for (std::size_t i = 0; i < size; ++i) value += alphabet[entropy_() % alphabet.size()];
        return value;
    }
    static void resetBoard(Room& room, int first) {
        room.edges.fill(-1); room.boxes.fill(-1); room.scores = {{0, 0}};
        room.ready = {{false, false}}; room.phase = "waiting";
        room.first = room.turn = first; room.ply = 0;
        room.lastEdge = room.lastSide = -1;
        room.notice.clear(); room.touched = Clock::now(); ++room.run;
    }
    static bool numberIs(const crow::json::rvalue& value, const char* key, int expected) {
        return value.has(key) && value[key].t() == crow::json::type::Number
            && std::isfinite(value[key].d()) && value[key].d() == expected;
    }
    static crow::json::wvalue state(const Room& room, int side) {
        crow::json::wvalue value;
        value["type"] = "state"; value["room"] = room.code; value["self"] = side;
        value["phase"] = room.phase; value["run"] = room.run; value["ply"] = room.ply;
        value["first"] = room.first; value["turn"] = room.turn;
        value["lastEdge"] = room.lastEdge; value["lastSide"] = room.lastSide;
        value["leftConnected"] = room.clients[0] != nullptr; value["rightConnected"] = room.clients[1] != nullptr;
        value["leftReady"] = room.ready[0]; value["rightReady"] = room.ready[1];
        value["edges"] = crow::json::wvalue::list(); value["boxes"] = crow::json::wvalue::list();
        for (int i = 0; i < 24; ++i) value["edges"][i] = room.edges[i];
        for (int i = 0; i < 9; ++i) value["boxes"][i] = room.boxes[i];
        value["scores"] = crow::json::wvalue::list();
        value["scores"][0] = room.scores[0]; value["scores"][1] = room.scores[1];
        value["winner"] = room.phase == "finished" ? (room.scores[0] > room.scores[1] ? 0 : 1) : -1;
        value["notice"] = room.notice;
        return value;
    }
    static void send(const Room& room) {
        for (int side = 0; side < 2; ++side)
            if (room.clients[side]) room.clients[side]->send_text(state(room, side).dump());
    }
    static void error(Socket& socket, const std::string& message) {
        crow::json::wvalue value; value["type"] = "error"; value["message"] = message;
        socket.send_text(value.dump());
    }
public:
    struct Result { std::string code, token, error; int side = 0; };
    Result create() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (rooms_.size() >= 200) return {{}, {}, "房间暂时已满，稍后再试。", 0};
        Room room;
        do { room.code = randomText(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"); }
        while (rooms_.count(room.code));
        room.tokens[0] = randomText(32, "0123456789abcdef");
        resetBoard(room, 0);
        const auto result = Result{room.code, room.tokens[0], {}, 0};
        rooms_.emplace(room.code, std::move(room));
        return result;
    }
    Result join(const std::string& code) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = rooms_.find(code);
        if (it == rooms_.end()) return {{}, {}, "房间不存在或已过期。", 0};
        auto& room = it->second;
        if (!room.tokens[1].empty()) return {{}, {}, "这个房间已经有两位玩家了。", 0};
        room.tokens[1] = randomText(32, "0123456789abcdef");
        room.touched = Clock::now(); room.disconnectedAt[1] = room.touched;
        return {code, room.tokens[1], {}, 1};
    }
    void message(Socket& socket, const std::string& text, bool binary) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (binary || text.size() > 512) { socket.close(std::string("\x03\xf0", 2) + "Invalid message"); return; }
        const auto value = crow::json::load(text);
        if (!value || value.t() != crow::json::type::Object || !value.has("type") || value["type"].t() != crow::json::type::String) {
            socket.close(std::string("\x03\xf0", 2) + "Invalid message"); return;
        }
        const std::string type = value["type"].s();
        auto session = sessions_.find(&socket);
        if (session == sessions_.end()) {
            if (type != "auth" || !value.has("room") || !value.has("token")
                || value["room"].t() != crow::json::type::String || value["token"].t() != crow::json::type::String) {
                socket.close(std::string("\x03\xf0", 2) + "Unauthorized"); return;
            }
            auto it = rooms_.find(std::string(value["room"].s()));
            if (it == rooms_.end()) { socket.close(std::string("\x03\xf0", 2) + "Expired room"); return; }
            auto& room = it->second;
            const std::string token = value["token"].s();
            const int side = token == room.tokens[0] ? 0 : !room.tokens[1].empty() && token == room.tokens[1] ? 1 : -1;
            if (side < 0) { socket.close(std::string("\x03\xf0", 2) + "Unauthorized"); return; }
            if (room.clients[side]) {
                auto* previous = room.clients[side];
                sessions_.erase(previous);
                previous->close(std::string("\x03\xe8", 2) + "Reconnected elsewhere");
            }
            room.clients[side] = &socket; room.disconnectedAt[side] = Time{};
            sessions_[&socket] = {room.code, side}; room.touched = Clock::now(); room.notice.clear();
            send(room); return;
        }
        auto it = rooms_.find(session->second.room);
        if (it == rooms_.end()) { socket.close(std::string("\x03\xf0", 2) + "Expired room"); return; }
        auto& room = it->second;
        const int side = session->second.side;
        room.touched = Clock::now();
        if (type == "move") {
            if (room.phase != "playing" || !room.clients[0] || !room.clients[1]) {
                error(socket, "先等双方准备并连接，再继续连线。"); return;
            }
            if (!numberIs(value, "run", room.run) || !numberIs(value, "ply", room.ply)) {
                error(socket, "棋盘已更新，请按当前局面操作。"); return;
            }
            if (room.turn != side) { error(socket, "还没轮到你，等朋友画完这一条。"); return; }
            if (!value.has("edge") || value["edge"].t() != crow::json::type::Number
                || !std::isfinite(value["edge"].d()) || value["edge"].d() < 0 || value["edge"].d() > 23
                || value["edge"].d() != static_cast<int>(value["edge"].d())) {
                error(socket, "请选择两个相邻圆点之间的空线。"); return;
            }
            const int edge = static_cast<int>(value["edge"].d());
            if (room.edges[edge] != -1) { error(socket, "这条线已经画过，换一条空线。"); return; }
            room.edges[edge] = side; room.lastEdge = edge; room.lastSide = side; ++room.ply;
            int gained = 0;
            for (int box = 0; box < 9; ++box) {
                if (room.boxes[box] != -1) continue;
                const int row = box / 3, col = box % 3;
                if (room.edges[row * 3 + col] >= 0 && room.edges[(row + 1) * 3 + col] >= 0
                    && room.edges[12 + row * 4 + col] >= 0 && room.edges[12 + row * 4 + col + 1] >= 0) {
                    room.boxes[box] = side; ++room.scores[side]; ++gained;
                }
            }
            room.notice.clear();
            if (room.scores[0] + room.scores[1] == 9) {
                room.phase = "finished"; room.ready = {{false, false}};
            } else if (gained == 0) room.turn = 1 - side;
            send(room);
        } else if (type == "ready") {
            if ((room.phase != "waiting" && room.phase != "finished") || !room.clients[0] || !room.clients[1]) {
                error(socket, "等朋友连接后，再一起准备。"); return;
            }
            if (!numberIs(value, "run", room.run)) { error(socket, "对局已更新，请重新准备。"); return; }
            if (room.ready[side]) { error(socket, "你已经准备好了，等朋友确认。"); return; }
            room.ready[side] = true;
            if (room.ready[0] && room.ready[1]) {
                if (room.phase == "finished") resetBoard(room, 1 - room.first);
                room.phase = "playing";
                room.ready = {{false, false}}; room.notice.clear();
            }
            send(room);
        } else if (type == "leave") {
            room.clients[side] = nullptr; sessions_.erase(session);
            if (side == 0) {
                if (room.clients[1]) room.clients[1]->close(std::string("\x03\xe8", 2) + "Room closed");
                rooms_.erase(it);
            } else {
                room.tokens[1].clear(); resetBoard(room, 0);
                room.notice = "朋友离开了，棋盘已清空，可以邀请新朋友。"; send(room);
            }
            socket.close(std::string("\x03\xe8", 2) + "Left room");
        } else error(socket, "现在不能执行这个操作。");
    }
    void close(Socket& socket) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto session = sessions_.find(&socket);
        if (session == sessions_.end()) return;
        auto it = rooms_.find(session->second.room);
        if (it != rooms_.end()) {
            auto& room = it->second;
            room.clients[session->second.side] = nullptr;
            room.disconnectedAt[session->second.side] = Clock::now();
            room.notice = "朋友暂时离线，棋盘保留，等他重连后继续。"; send(room);
        }
        sessions_.erase(session);
    }
    void tick() {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto now = Clock::now();
        for (auto it = rooms_.begin(); it != rooms_.end();) {
            auto& room = it->second;
            if (!room.clients[0] && !room.clients[1] && elapsed(room.touched, now) > 15 * 60 * 1000) {
                it = rooms_.erase(it); continue;
            }
            if (!room.clients[1] && !room.tokens[1].empty() && room.disconnectedAt[1] != Time{}
                && elapsed(room.disconnectedAt[1], now) > 2 * 60 * 1000) {
                room.tokens[1].clear(); room.disconnectedAt[1] = Time{}; resetBoard(room, 0);
                room.notice = "朋友离线超过两分钟，棋盘已清空，可以邀请新朋友。"; send(room);
            }
            ++it;
        }
    }
};
