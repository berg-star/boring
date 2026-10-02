#pragma once
#include <crow.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <mutex>
#include <numeric>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

// Three cooperative locks. Each socket receives only its own half of a clue.
class PuzzleRooms {
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    using Socket = crow::websocket::connection;
    struct Room {
        std::string code;
        std::array<std::string, 2> tokens;
        std::array<Socket*, 2> clients{{nullptr, nullptr}};
        std::array<Time, 2> disconnectedAt{};
        std::array<std::array<std::string, 2>, 3> clues;
        std::array<std::string, 3> answers;
        std::array<bool, 2> approved{{false, false}};
        std::array<int, 2> attempts{{0, 0}};
        std::string phase = "waiting", notice;
        int stage = 0, run = 1;
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
    template <std::size_t N> void shuffle(std::array<int, N>& values) {
        for (std::size_t i = N - 1; i > 0; --i) std::swap(values[i], values[entropy_() % (i + 1)]);
    }
    void newCase(Room& room) {
        room.phase = "waiting";
        room.stage = 0;
        room.approved = {{false, false}};
        room.attempts = {{0, 0}};
        room.notice.clear();
        room.touched = Clock::now();
        ++room.run;

        const std::array<std::string, 4> symbols{{"星", "月", "云", "风"}};
        std::array<int, 10> digits{{0,1,2,3,4,5,6,7,8,9}};
        std::array<int, 4> order{{0,1,2,3}};
        shuffle(digits); shuffle(order);
        std::string key = "符号手册（数字可包含 0）：\n", sequence = "门上的四个符号，从左到右：\n", answer;
        for (int i = 0; i < 4; ++i) {
            key += symbols[i] + " → " + std::to_string(digits[i]) + "\n";
            sequence += symbols[order[i]] + (i == 3 ? "" : "  /  ");
            answer += char('0' + digits[order[i]]);
        }
        room.clues[0] = {{key, sequence + "\n请把符号译成四位数字。"}};
        room.answers[0] = answer;

        const std::string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        std::array<int, 24> letters{};
        std::iota(letters.begin(), letters.end(), 0);
        std::array<int, 9> cells{{0,1,2,3,4,5,6,7,8}};
        shuffle(letters); shuffle(cells);
        std::string grid = "档案柜索引（行 A–C，列 1–3）：\n       1    2    3\n", route = "取字母顺序：\n", word;
        for (int row = 0; row < 3; ++row) {
            grid += std::string(1, char('A' + row)) + "    ";
            for (int col = 0; col < 3; ++col)
                grid += std::string(1, alphabet[letters[row * 3 + col]]) + (col == 2 ? "\n" : "    ");
        }
        for (int i = 0; i < 4; ++i) {
            const int cell = cells[i];
            route += std::string(1, char('A' + cell / 3)) + char('1' + cell % 3) + (i == 3 ? "" : "  →  ");
            word += alphabet[letters[cell]];
        }
        room.clues[1] = {{grid, route + "\n按索引找到四个英文字母。"}};
        room.answers[1] = word;

        std::array<int, 4> gears{{1 + int(entropy_() % 9), 1 + int(entropy_() % 9),
                                   1 + int(entropy_() % 9), 1 + int(entropy_() % 9)}};
        std::string gauges = "控制台读数：\n";
        for (int i = 0; i < 4; ++i) gauges += std::string(1, char('A' + i)) + " = " + std::to_string(gears[i]) + "\n";
        const int result = ((gears[0] + gears[2]) * gears[1] - gears[3] + 100) % 100;
        room.clues[2] = {{gauges, "最终门的规则：\n(A + C) × B − D\n取结果的末两位，不足两位在前面补 0。"}};
        room.answers[2] = std::string(result < 10 ? "0" : "") + std::to_string(result);
    }
    static crow::json::wvalue state(const Room& room, int side) {
        crow::json::wvalue value;
        value["type"] = "state";
        value["room"] = room.code;
        value["self"] = side;
        value["phase"] = room.phase;
        value["stage"] = room.stage;
        value["run"] = room.run;
        value["clue"] = room.stage < 3 ? room.clues[room.stage][side] : "";
        value["leftConnected"] = room.clients[0] != nullptr;
        value["rightConnected"] = room.clients[1] != nullptr;
        value["leftApproved"] = room.approved[0];
        value["rightApproved"] = room.approved[1];
        value["leftAttempts"] = room.attempts[0];
        value["rightAttempts"] = room.attempts[1];
        value["notice"] = room.notice;
        return value;
    }
    static void send(const Room& room) {
        for (int side = 0; side < 2; ++side)
            if (room.clients[side]) room.clients[side]->send_text(state(room, side).dump());
    }
    static void error(Socket& socket, const std::string& message) {
        crow::json::wvalue value;
        value["type"] = "error";
        value["message"] = message;
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
            if (type != "auth" || !value.has("room") || !value.has("token") || value["room"].t() != crow::json::type::String || value["token"].t() != crow::json::type::String) {
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
        if (type == "solve") {
            if (room.phase != "playing" || !room.clients[0] || !room.clients[1]) {
                error(socket, "对方暂时离线，等待重新连接。 "); return;
            }
            if (!value.has("stage") || value["stage"].t() != crow::json::type::Number || value["stage"].d() != room.stage
                || !value.has("run") || value["run"].t() != crow::json::type::Number || value["run"].d() != room.run) {
                error(socket, "已经进入新的关卡，请查看当前线索。"); return;
            }
            if (room.approved[side]) { error(socket, "你已解开这把锁，等队友提交即可。"); return; }
            if (!value.has("answer") || value["answer"].t() != crow::json::type::String) {
                error(socket, "请输入答案。"); return;
            }
            std::string answer = value["answer"].s();
            if (answer.size() != (room.stage == 2 ? 2u : 4u)) { error(socket, "答案长度不对，请查看题目提示。"); return; }
            for (char& c : answer) {
                if (room.stage == 1) {
                    if (c >= 'a' && c <= 'z') c = char(c - 'a' + 'A');
                    if (c < 'A' || c > 'Z') { error(socket, "请输入四个英文字母。"); return; }
                } else if (c < '0' || c > '9') { error(socket, "请输入数字答案。"); return; }
            }
            if (answer != room.answers[room.stage]) {
                ++room.attempts[side];
                error(socket, "还没对上，再和队友核对两份线索。");
                send(room);
                return;
            }
            room.approved[side] = true;
            room.notice.clear();
            if (room.approved[0] && room.approved[1]) {
                ++room.stage;
                room.approved = {{false, false}};
                room.attempts = {{0, 0}};
                if (room.stage == 3) room.phase = "finished";
            }
            send(room);
        } else if (type == "ready" && room.phase == "finished") {
            room.approved[side] = true;
            if (room.approved[0] && room.approved[1]) {
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
                room.notice = "队友离开了，已重置谜题，可以邀请新朋友。";
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
                room.notice = "队友离线超过两分钟，可以邀请新朋友，谜题已重置。";
                send(room);
            }
            ++it;
        }
    }
};
