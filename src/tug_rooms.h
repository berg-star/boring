#pragma once
#include <crow.h>
#include <array>
#include <chrono>
#include <mutex>
#include <random>
#include <string>
#include <unordered_map>

// 进程内双人房间。每次部署会清空房间；不保存个人资料或战绩。
class TugRooms {
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    using Socket = crow::websocket::connection;
    struct Room {
        std::string code;
        std::array<std::string, 2> tokens;
        std::array<Socket*, 2> clients{{nullptr, nullptr}};
        std::array<bool, 2> ready{{false, false}};
        std::array<int, 2> score{{0, 0}};
        std::array<Time, 2> lastPull{};
        std::array<Time, 2> disconnectedAt{};
        std::string phase = "waiting";
        std::string notice;
        int winner = -2;  // -2: undecided; -1: tie; 0/1: winner
        Time phaseAt = Clock::now();
        Time touched = Clock::now();
    };
    struct Session { std::string room; int side; };
    std::mutex mutex_;
    std::unordered_map<std::string, Room> rooms_;
    std::unordered_map<Socket*, Session> sessions_;
    std::random_device entropy_;
    static constexpr int limit_ = 40;
    static constexpr int durationMs_ = 20000;
    static long long elapsed(Time since, Time now) {
        return std::chrono::duration_cast<std::chrono::milliseconds>(now - since).count();
    }
    std::string randomText(std::size_t count, const std::string& alphabet) {
        std::string result;
        // random_device uses the platform random source; room codes also have an independent secret token.
        for (std::size_t i = 0; i < count; ++i) result += alphabet[entropy_() % alphabet.size()];
        return result;
    }
    static crow::json::wvalue state(const Room& room, int side, Time now) {
        crow::json::wvalue value;
        value["type"] = "state";
        value["room"] = room.code;
        value["self"] = side;
        value["phase"] = room.phase;
        value["left"] = room.score[0];
        value["right"] = room.score[1];
        value["leftConnected"] = room.clients[0] != nullptr;
        value["rightConnected"] = room.clients[1] != nullptr;
        value["leftReady"] = room.ready[0];
        value["rightReady"] = room.ready[1];
        value["winner"] = room.winner;
        value["notice"] = room.notice;
        value["remainingMs"] = room.phase == "countdown" ? std::max(0LL, 3000 - elapsed(room.phaseAt, now))
            : room.phase == "running" ? std::max(0LL, durationMs_ - elapsed(room.phaseAt, now))
            : room.phase == "finished" ? 0LL : durationMs_;
        return value;
    }
    static void send(const Room& room, Time now) {
        for (int side = 0; side < 2; ++side)
            if (room.clients[side]) room.clients[side]->send_text(state(room, side, now).dump());
    }
    static void finish(Room& room, Time now) {
        room.phase = "finished";
        room.winner = room.score[0] == room.score[1] ? -1 : room.score[0] > room.score[1] ? 0 : 1;
        room.ready = {{false, false}};
        room.touched = now;
        room.notice.clear();
    }
    static void interrupt(Room& room, Time now) {
        room.phase = "waiting";
        room.ready = {{false, false}};
        room.score = {{0, 0}};
        room.winner = -2;
        room.touched = now;
        room.notice = "对方离线，本局结束。等双方重新准备。";
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
        // Joining reserves the guest seat before WebSocket auth; start its grace period now.
        room.disconnectedAt[1] = room.touched;
        return {code, room.tokens[1], {}, 1};
    }
    void message(Socket& socket, const std::string& text, bool binary) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (binary || text.size() > 512) { socket.close("Invalid message"); return; }
        auto value = crow::json::load(text);
        if (!value || value.t() != crow::json::type::Object || !value.has("type") || value["type"].t() != crow::json::type::String) {
            socket.close("Invalid message"); return;
        }
        const std::string type = value["type"].s();
        auto session = sessions_.find(&socket);
        if (session == sessions_.end()) {
            if (type != "auth" || !value.has("room") || !value.has("token") || value["room"].t() != crow::json::type::String || value["token"].t() != crow::json::type::String) {
                socket.close("Unauthorized"); return;
            }
            auto it = rooms_.find(std::string(value["room"].s()));
            if (it == rooms_.end()) { socket.close("Expired room"); return; }
            auto& room = it->second;
            const std::string token = value["token"].s();
            int side = room.tokens[0] == token ? 0 : room.tokens[1] == token && !room.tokens[1].empty() ? 1 : -1;
            if (side < 0) { socket.close("Unauthorized"); return; }
            // Reloads can connect before the previous socket's close callback arrives.
            if (room.clients[side]) {
                auto* previous = room.clients[side];
                sessions_.erase(previous);
                previous->close("Reconnected elsewhere");
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
        if (it == rooms_.end()) { socket.close("Expired room"); return; }
        auto& room = it->second;
        const int side = session->second.side;
        const auto now = Clock::now();
        room.touched = now;
        if (type == "ready" && (room.phase == "waiting" || room.phase == "finished")) {
            if (room.phase == "finished") { room.phase = "waiting"; room.score = {{0, 0}}; room.winner = -2; room.ready = {{false, false}}; }
            room.ready[side] = true;
            room.notice.clear();
            if (room.clients[0] && room.clients[1] && room.ready[0] && room.ready[1]) {
                room.phase = "countdown";
                room.phaseAt = now;
            }
            send(room, now);
        } else if (type == "pull" && room.phase == "running" && room.clients[0] && room.clients[1]) {
            if (elapsed(room.phaseAt, now) >= durationMs_) { finish(room, now); send(room, now); return; }
            if (elapsed(room.lastPull[side], now) < 70) return;
            room.lastPull[side] = now;
            room.score[side] += 1;
            if (std::abs(room.score[0] - room.score[1]) >= limit_) finish(room, now);
            send(room, now);
        } else if (type == "leave") {
            room.clients[side] = nullptr;
            sessions_.erase(session);
            if (side == 0) {
                if (room.clients[1]) {
                    crow::json::wvalue closed; closed["type"] = "closed"; closed["message"] = "房主已离开，房间关闭。";
                    room.clients[1]->send_text(closed.dump());
                    room.clients[1]->close("Room closed");
                }
                rooms_.erase(it);
            } else {
                room.tokens[1].clear();
                interrupt(room, now);
                send(room, now);
            }
            socket.close("Left room");
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
            if (room.phase == "running" || room.phase == "countdown") interrupt(room, Clock::now());
            else room.ready = {{false, false}};
            room.notice = "对方已离线，可以等他返回。";
            send(room, Clock::now());
        }
        sessions_.erase(session);
    }
    void tick() {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto now = Clock::now();
        for (auto it = rooms_.begin(); it != rooms_.end();) {
            auto& room = it->second;
            if (!room.clients[0] && !room.clients[1] && elapsed(room.touched, now) > 15 * 60 * 1000) { it = rooms_.erase(it); continue; }
            if (!room.clients[1] && !room.tokens[1].empty() && room.disconnectedAt[1] != Time{} && elapsed(room.disconnectedAt[1], now) > 2 * 60 * 1000) {
                room.tokens[1].clear();
                room.disconnectedAt[1] = Time{};
            }
            if (room.phase == "countdown" && elapsed(room.phaseAt, now) >= 3000) {
                room.phase = "running"; room.phaseAt += std::chrono::milliseconds(3000);
                room.lastPull = {{Time{}, Time{}}};
            }
            if (room.phase == "running" && elapsed(room.phaseAt, now) >= durationMs_) finish(room, now);
            if (room.clients[0] || room.clients[1]) send(room, now);
            ++it;
        }
    }
};
