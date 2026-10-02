#pragma once
#include <crow.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <mutex>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

// Turn-based code breaking. Opponent secrets stay on the server until the game ends.
class PasswordRooms {
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    using Socket = crow::websocket::connection;
    struct Room {
        std::string code;
        std::array<std::string, 2> tokens;
        std::array<Socket*, 2> clients{{nullptr, nullptr}};
        std::array<bool, 2> ready{{false, false}};
        std::array<std::string, 2> secrets;
        struct Guess { int side; std::string digits; int exact, misplaced; };
        std::vector<Guess> guesses;
        std::array<Time, 2> disconnectedAt{};
        std::string phase = "waiting", notice;
        int winner = -2, starter = 0, turn = 0, round = 1;
        bool firstSolved = false;
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
    static crow::json::wvalue state(const Room& room, int side, Time now) {
        crow::json::wvalue value;
        value["type"] = "state";
        value["room"] = room.code;
        value["self"] = side;
        value["phase"] = room.phase;
        value["leftConnected"] = room.clients[0] != nullptr;
        value["rightConnected"] = room.clients[1] != nullptr;
        value["leftReady"] = room.ready[0];
        value["rightReady"] = room.ready[1];
        value["winner"] = room.winner;
        value["notice"] = room.notice;
        value["turn"] = room.turn;
        value["round"] = room.round;
        value["move"] = static_cast<int>(room.guesses.size());
        value["firstSolved"] = room.firstSolved;
        value["history"] = crow::json::wvalue::list();
        for (std::size_t i = 0; i < room.guesses.size(); ++i) {
            const auto& g = room.guesses[i];
            value["history"][i]["side"] = g.side;
            value["history"][i]["digits"] = g.digits;
            value["history"][i]["exact"] = g.exact;
            value["history"][i]["misplaced"] = g.misplaced;
        }
        if (room.phase == "finished") {
            value["leftSecret"] = room.secrets[0];
            value["rightSecret"] = room.secrets[1];
        }
        return value;
    }
    static void send(const Room& room, Time now) {
        for (int side = 0; side < 2; ++side)
            if (room.clients[side]) room.clients[side]->send_text(state(room, side, now).dump());
    }
    static void reset(Room& room, Time now, const std::string& notice = {}) {
        room.phase = "waiting";
        room.ready = {{false, false}};
        room.secrets = {};
        room.guesses.clear();
        room.firstSolved = false;
        room.turn = room.starter;
        room.winner = -2;
        room.notice = notice;
        room.touched = now;
        ++room.round;
    }
    static bool validDigits(const std::string& digits) {
        if (digits.size() != 4) return false;
        std::string seen;
        for (char c : digits) {
            if (c < '0' || c > '9' || seen.find(c) != std::string::npos) return false;
            seen += c;
        }
        return true;
    }
    static void error(Socket& socket, const std::string& message) {
        crow::json::wvalue v; v["type"] = "error"; v["message"] = message;
        socket.send_text(v.dump());
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
        auto result = Result{room.code, room.tokens[0], {}, 0};
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
        room.touched = Clock::now();
        room.disconnectedAt[1] = room.touched;
        return {code, room.tokens[1], {}, 1};
    }
    void message(Socket& socket, const std::string& text, bool binary) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (binary || text.size() > 512) { socket.close(std::string("\x03\xf0", 2) + "Invalid message"); return; }
        auto value = crow::json::load(text);
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
            const int side = room.tokens[0] == token ? 0
                : room.tokens[1] == token && !room.tokens[1].empty() ? 1 : -1;
            if (side < 0) { socket.close(std::string("\x03\xf0", 2) + "Unauthorized"); return; }
            if (room.clients[side]) {
                auto* previous = room.clients[side];
                sessions_.erase(previous);
                previous->close(std::string("\x03\xe8", 2) + "Reconnected elsewhere");
            }
            room.clients[side] = &socket;
            room.disconnectedAt[side] = Time{};
            sessions_[&socket] = {room.code, side};
            room.touched = Clock::now();
            room.notice.clear();
            send(room, room.touched);
            return;
        }
        auto it = rooms_.find(session->second.room);
        if (it == rooms_.end()) { socket.close(std::string("\x03\xf0", 2) + "Expired room"); return; }
        auto& room = it->second;
        const int side = session->second.side;
        const auto now = Clock::now();
        room.touched = now;
        if (type == "secret") {
            if (room.phase != "waiting" || room.ready[side]) { error(socket, "密码已经锁定。"); return; }
            if (!value.has("digits") || value["digits"].t() != crow::json::type::String
                || !validDigits(std::string(value["digits"].s()))) {
                error(socket, "请输入四个不重复的数字，可以以 0 开头。"); return;
            }
            room.secrets[side] = std::string(value["digits"].s());
            room.ready[side] = true;
            room.notice.clear();
            if (room.ready[0] && room.ready[1]) room.phase = "playing";
            send(room, now);
        } else if (type == "guess") {
            if (room.phase != "playing" || room.turn != side || !room.clients[0] || !room.clients[1]) {
                error(socket, "还没轮到你，或对方暂时离线。"); return;
            }
            if (!value.has("round") || value["round"].t() != crow::json::type::Number
                || value["round"].d() != room.round || !value.has("move")
                || value["move"].t() != crow::json::type::Number || value["move"].d() != room.guesses.size()) {
                error(socket, "回合已更新，请重新提交。"); return;
            }
            if (!value.has("digits") || value["digits"].t() != crow::json::type::String
                || !validDigits(std::string(value["digits"].s()))) {
                error(socket, "请输入四个不重复的数字。"); return;
            }
            const std::string digits = value["digits"].s();
            for (const auto& g : room.guesses) if (g.side == side && g.digits == digits) {
                error(socket, "这个组合已经猜过了，看看之前的提示吧。"); return;
            }
            int exact = 0, total = 0;
            for (int i = 0; i < 4; ++i) {
                exact += digits[i] == room.secrets[1-side][i];
                total += room.secrets[1-side].find(digits[i]) != std::string::npos;
            }
            room.guesses.push_back({side, digits, exact, total-exact});
            if (side == room.starter) {
                room.firstSolved = exact == 4;
            } else if (room.firstSolved || exact == 4 || room.guesses.size() >= 40) {
                room.phase = "finished";
                room.winner = room.firstSolved && exact == 4 ? -1 : room.firstSolved ? room.starter : exact == 4 ? side : -1;
                room.ready = {{false, false}};
            }
            room.turn = 1-side;
            send(room, now);
        } else if (type == "ready" && room.phase == "finished") {
            room.ready[side] = true;
            if (room.ready[0] && room.ready[1]) {
                room.starter = 1-room.starter;
                reset(room, now, "新的一局，请重新设定密码。");
            }
            send(room, now);
        } else if (type == "leave") {
            room.clients[side] = nullptr;
            sessions_.erase(session);
            if (side == 0) {
                if (room.clients[1]) {
                    room.clients[1]->close(std::string("\x03\xe8", 2) + "Room closed");
                }
                rooms_.erase(it);
            } else {
                room.tokens[1].clear();
                reset(room, now, "朋友离开了，可以再邀请一位。");
                send(room, now);
            }
            socket.close(std::string("\x03\xe8", 2) + "Left room");
        }
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
            room.notice = "对方已离线，对局已保留，等待重新连接。";
            send(room, Clock::now());
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
                room.tokens[1].clear();
                room.disconnectedAt[1] = Time{};
                reset(room, now, "朋友离线超过两分钟，可以邀请新朋友。");
                send(room, now);
            }
            ++it;
        }
    }
};
