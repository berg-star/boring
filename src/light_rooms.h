#pragma once
#include <crow.h>
#include "light_engine.h"
#include <chrono>
#include <cmath>
#include <mutex>
#include <random>
#include <string>
#include <unordered_map>

class LightRooms {
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    using Socket = crow::websocket::connection;
    static constexpr int TickMs = 250;
    struct Room {
        std::string code, notice, phase = "waiting";
        std::array<std::string, 2> tokens;
        std::array<Socket*, 2> clients{{nullptr, nullptr}};
        std::array<Time, 2> disconnectedAt{};
        std::array<bool, 2> ready{{false, false}};
        std::array<int, 2> queued{{0, 0}}, sequences{{0, 0}};
        LightArena arena;
        int run = 0, epoch = 0;
        bool swapped = false;
        Time touched = Clock::now(), phaseAt = Clock::now(), nextStep = Clock::now();
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
    static void resetMatch(Room& room, bool swapped) {
        room.arena.reset(swapped); room.swapped = swapped; ++room.run; room.epoch = 0;
        room.phase = "waiting"; room.ready = {{false, false}};
        room.queued = room.sequences = {{0, 0}}; room.notice.clear(); room.touched = Clock::now();
    }
    static void countdown(Room& room) {
        room.phase = "countdown"; room.phaseAt = Clock::now(); ++room.epoch;
        room.queued = room.sequences = {{0, 0}}; room.ready = {{false, false}};
        room.notice.clear();
    }
    static bool integer(const crow::json::rvalue& value, const char* key, int low, int high) {
        if (!value.has(key) || value[key].t() != crow::json::type::Number) return false;
        const double number = value[key].d();
        return std::isfinite(number) && number >= low && number <= high && number == std::floor(number);
    }
    static bool numberIs(const crow::json::rvalue& value, const char* key, int expected) {
        return integer(value, key, expected, expected);
    }
    static crow::json::wvalue state(const Room& room, int side) {
        crow::json::wvalue value;
        value["type"] = "state"; value["room"] = room.code; value["self"] = side;
        value["phase"] = room.phase; value["run"] = room.run; value["epoch"] = room.epoch;
        value["step"] = room.arena.step; value["tickMs"] = TickMs;
        value["width"] = LightArena::Width; value["height"] = LightArena::Height;
        value["trail"] = room.arena.trail; value["winner"] = room.arena.winner;
        value["swapped"] = room.swapped; value["myTurn"] = room.queued[side]; value["ack"] = room.sequences[side];
        value["leftConnected"] = room.clients[0] != nullptr; value["rightConnected"] = room.clients[1] != nullptr;
        value["leftReady"] = room.ready[0]; value["rightReady"] = room.ready[1];
        value["heads"] = crow::json::wvalue::list(); value["hits"] = crow::json::wvalue::list();
        value["reasons"] = crow::json::wvalue::list(); value["directions"] = crow::json::wvalue::list();
        for (int i = 0; i < 2; ++i) {
            value["heads"][i]["x"] = room.arena.heads[i].x; value["heads"][i]["y"] = room.arena.heads[i].y;
            value["hits"][i]["x"] = room.arena.hits[i].x; value["hits"][i]["y"] = room.arena.hits[i].y;
            value["reasons"][i] = room.arena.reasons[i]; value["directions"][i] = room.arena.directions[i];
        }
        value["remainingMs"] = room.phase == "countdown" ? std::max(0LL, 3000 - elapsed(room.phaseAt, Clock::now())) : 0LL;
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
        resetMatch(room, false);
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
            if (room.phase == "paused" && room.clients[0] && room.clients[1]) countdown(room);
            send(room); return;
        }
        auto it = rooms_.find(session->second.room);
        if (it == rooms_.end()) { socket.close(std::string("\x03\xf0", 2) + "Expired room"); return; }
        auto& room = it->second;
        const int side = session->second.side;
        room.touched = Clock::now();
        if (type == "turn") {
            if (room.phase != "running" || !room.clients[0] || !room.clients[1]) {
                error(socket, "等倒数结束、双方在线后再转弯。"); return;
            }
            if (!numberIs(value, "run", room.run) || !numberIs(value, "epoch", room.epoch)
                || !integer(value, "step", std::max(0, room.arena.step - 4), room.arena.step)) {
                error(socket, "状态已更新或网络有点慢，请再点一次。"); return;
            }
            if (!integer(value, "seq", room.sequences[side] + 1, 1000000000)
                || !integer(value, "direction", -1, 1) || value["direction"].i() == 0) {
                error(socket, "请选择一次左转或右转。"); return;
            }
            if (room.queued[side] != 0) { error(socket, "这次转向已排好，等车头转过来再点。"); return; }
            room.queued[side] = int(value["direction"].i()); room.sequences[side] = int(value["seq"].i());
            send(room);
        } else if (type == "ready") {
            if ((room.phase != "waiting" && room.phase != "finished") || !room.clients[0] || !room.clients[1]) {
                error(socket, "等朋友连接后，再一起准备。"); return;
            }
            if (!numberIs(value, "run", room.run) || room.ready[side]) {
                error(socket, "对局已更新，或你已经准备好了。"); return;
            }
            room.ready[side] = true;
            if (room.ready[0] && room.ready[1]) {
                if (room.phase == "finished") resetMatch(room, !room.swapped);
                countdown(room);
            }
            send(room);
        } else if (type == "leave") {
            room.clients[side] = nullptr; sessions_.erase(session);
            if (side == 0) {
                if (room.clients[1]) room.clients[1]->close(std::string("\x03\xe8", 2) + "Room closed");
                rooms_.erase(it);
            } else {
                room.tokens[1].clear(); resetMatch(room, false);
                room.notice = "朋友离开了，光轨已清空，可以邀请新朋友。"; send(room);
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
            if (room.phase == "running" || room.phase == "countdown") {
                room.phase = "paused"; room.queued = {{0, 0}};
            }
            room.notice = room.phase == "paused" ? "朋友暂时离线，比赛已暂停，重连后倒数继续。" : "朋友暂时离线，等他重连后继续。"; send(room);
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
                room.tokens[1].clear(); room.disconnectedAt[1] = Time{}; resetMatch(room, false);
                room.notice = "朋友离线超过两分钟，光轨已清空，可以邀请新朋友。"; send(room);
            }
            if (room.phase == "countdown" && room.clients[0] && room.clients[1]) {
                if (elapsed(room.phaseAt, now) >= 3000) {
                    room.phase = "running"; room.nextStep = now + std::chrono::milliseconds(TickMs);
                }
                send(room);
            } else if (room.phase == "running" && now >= room.nextStep) {
                room.arena.advance(room.queued); room.queued = {{0, 0}};
                room.nextStep = elapsed(room.nextStep, now) > TickMs ? now + std::chrono::milliseconds(TickMs)
                    : room.nextStep + std::chrono::milliseconds(TickMs);
                room.touched = now;
                if (room.arena.winner != -2) { room.phase = "finished"; room.ready = {{false, false}}; }
                send(room);
            }
            ++it;
        }
    }
};
