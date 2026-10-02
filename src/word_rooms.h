#pragma once
#include <crow.h>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <mutex>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

// Turn-based yes/no word deduction. Both players get the same target but separate histories.
inline constexpr std::uint32_t wordBit(int question) { return std::uint32_t{1} << question; }
class WordRooms {
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    using Socket = crow::websocket::connection;
    struct Word { const char* label; std::uint32_t yes; };
    inline static constexpr std::array<const char*, 19> questions_{{
        "它是动物吗？", "它通常被当作食物吗？", "它通常会在水里活动吗？", "它属于鸟类吗？",
        "它能飞吗？", "它是哺乳动物吗？", "它有坚硬的壳吗？", "它是昆虫吗？",
        "它属于水果吗？", "它通常是甜的吗？", "它通常是酸的吗？", "它是液体吗？",
        "它是烘烤制成的吗？", "它需要电才能发挥主要用途吗？", "它能发光吗？", "它有屏幕吗？",
        "它主要用来挡雨吗？", "它有轮子吗？", "它主要用来吹风吗？"
    }};
    inline static constexpr std::array<Word, 16> words_{{
        {"企鹅", wordBit(0)|wordBit(2)|wordBit(3)}, {"麻雀", wordBit(0)|wordBit(3)|wordBit(4)},
        {"海豚", wordBit(0)|wordBit(2)|wordBit(5)}, {"乌龟", wordBit(0)|wordBit(2)|wordBit(6)},
        {"猫", wordBit(0)|wordBit(5)}, {"蜜蜂", wordBit(0)|wordBit(4)|wordBit(7)},
        {"苹果", wordBit(1)|wordBit(8)|wordBit(9)}, {"柠檬", wordBit(1)|wordBit(8)|wordBit(10)},
        {"面包", wordBit(1)|wordBit(12)}, {"鸡蛋", wordBit(1)|wordBit(6)}, {"牛奶", wordBit(1)|wordBit(11)},
        {"台灯", wordBit(13)|wordBit(14)}, {"风扇", wordBit(13)|wordBit(18)},
        {"手机", wordBit(13)|wordBit(14)|wordBit(15)}, {"雨伞", wordBit(16)}, {"自行车", wordBit(17)}
    }};
    struct Step { bool question; int id; bool yes; };
    struct Room {
        std::string code;
        std::array<std::string, 2> tokens;
        std::array<Socket*, 2> clients{{nullptr, nullptr}};
        std::array<Time, 2> disconnectedAt{};
        std::array<std::vector<Step>, 2> histories;
        std::array<bool, 2> solved{{false, false}}, ready{{false, false}};
        std::string phase = "waiting", notice;
        int target = -1, starter = 0, moves = 0, winner = -2, run = 0;
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
    void newCase(Room& room) {
        room.target = room.target < 0 ? static_cast<int>(entropy_() % words_.size())
            : (room.target + 1 + static_cast<int>(entropy_() % (words_.size() - 1))) % words_.size();
        room.phase = "waiting";
        room.histories = {};
        room.solved = {{false, false}};
        room.ready = {{false, false}};
        room.moves = 0;
        room.winner = -2;
        room.notice.clear();
        room.touched = Clock::now();
        ++room.run;
    }
    static crow::json::wvalue state(const Room& room, int side) {
        crow::json::wvalue value;
        value["type"] = "state";
        value["room"] = room.code;
        value["self"] = side;
        value["phase"] = room.phase;
        value["run"] = room.run;
        value["move"] = room.moves;
        value["turn"] = room.starter ^ (room.moves % 2);
        value["winner"] = room.winner;
        value["leftConnected"] = room.clients[0] != nullptr;
        value["rightConnected"] = room.clients[1] != nullptr;
        value["leftSolved"] = room.solved[0];
        value["rightSolved"] = room.solved[1];
        value["leftReady"] = room.ready[0];
        value["rightReady"] = room.ready[1];
        value["leftCount"] = static_cast<int>(room.histories[0].size());
        value["rightCount"] = static_cast<int>(room.histories[1].size());
        value["notice"] = room.notice;
        value["questions"] = crow::json::wvalue::list();
        value["words"] = crow::json::wvalue::list();
        value["history"] = crow::json::wvalue::list();
        for (std::size_t i = 0; i < questions_.size(); ++i) value["questions"][i] = questions_[i];
        for (std::size_t i = 0; i < words_.size(); ++i) value["words"][i] = words_[i].label;
        for (std::size_t i = 0; i < room.histories[side].size(); ++i) {
            const auto& step = room.histories[side][i];
            value["history"][i]["kind"] = step.question ? "ask" : "guess";
            value["history"][i]["id"] = step.id;
            value["history"][i]["yes"] = step.yes;
        }
        if (room.phase == "finished") value["answer"] = words_[room.target].label;
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
        newCase(room);
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
        room.touched = Clock::now();
        room.disconnectedAt[1] = room.touched;
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
            room.clients[side] = &socket;
            room.disconnectedAt[side] = Time{};
            sessions_[&socket] = {room.code, side};
            room.touched = Clock::now();
            room.notice.clear();
            if (room.phase == "waiting" && room.clients[0] && room.clients[1]) room.phase = "playing";
            send(room);
            return;
        }
        auto it = rooms_.find(session->second.room);
        if (it == rooms_.end()) { socket.close(std::string("\x03\xf0", 2) + "Expired room"); return; }
        auto& room = it->second;
        const int side = session->second.side;
        const auto now = Clock::now();
        room.touched = now;
        if (type == "ask" || type == "guess") {
            if (room.phase != "playing" || !room.clients[0] || !room.clients[1] || side != (room.starter ^ (room.moves % 2))) {
                error(socket, "还没轮到你，或对方暂时离线。"); return;
            }
            if (!value.has("move") || value["move"].t() != crow::json::type::Number || value["move"].d() != room.moves
                || !value.has("run") || value["run"].t() != crow::json::type::Number || value["run"].d() != room.run) {
                error(socket, "回合已更新，请重新选择。"); return;
            }
            if (!value.has("id") || value["id"].t() != crow::json::type::Number) {
                error(socket, "请选择一个问题或词语。"); return;
            }
            const double number = value["id"].d();
            if (!std::isfinite(number) || number < 0 || number >= static_cast<double>(type == "ask" ? questions_.size() : words_.size())
                || number != static_cast<int>(number)) { error(socket, "这个选项无效。"); return; }
            const int id = static_cast<int>(number);
            for (const auto& step : room.histories[side]) if (step.question == (type == "ask") && step.id == id) {
                error(socket, "这项已经用过了，请换一个。"); return;
            }
            const bool yes = type == "ask" ? (words_[room.target].yes & wordBit(id)) != 0 : id == room.target;
            room.histories[side].push_back({type == "ask", id, yes});
            if (type == "guess" && yes) room.solved[side] = true;
            ++room.moves;
            if (room.moves % 2 == 0 && (room.solved[0] || room.solved[1] || room.moves >= 20)) {
                room.phase = "finished";
                room.winner = room.solved[0] == room.solved[1] ? -1 : room.solved[0] ? 0 : 1;
                room.ready = {{false, false}};
            }
            send(room);
        } else if (type == "ready" && room.phase == "finished") {
            room.ready[side] = true;
            if (room.ready[0] && room.ready[1]) {
                room.starter = 1 - room.starter;
                newCase(room);
                if (room.clients[0] && room.clients[1]) room.phase = "playing";
            }
            send(room);
        } else if (type == "leave") {
            room.clients[side] = nullptr;
            sessions_.erase(session);
            if (side == 0) {
                if (room.clients[1]) room.clients[1]->close(std::string("\x03\xe8", 2) + "Room closed");
                rooms_.erase(it);
            } else {
                room.tokens[1].clear();
                newCase(room);
                room.notice = "队友离开了，已换新词，可以邀请新朋友。";
                send(room);
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
            room.notice = "队友暂时离线，进度保留，等他重新连接。";
            send(room);
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
                newCase(room);
                room.notice = "队友离线超过两分钟，可以邀请新朋友，已换新词。";
                send(room);
            }
            ++it;
        }
    }
};
