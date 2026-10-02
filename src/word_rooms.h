#pragma once
#include <crow.h>
#include <array>
#include <chrono>
#include <cstdint>
#include <mutex>
#include <random>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

// Two human-authored word rounds. A word is disclosed only to its setter until the round ends.
class WordRooms {
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    using Socket = crow::websocket::connection;
    struct Step { std::string kind, text, reply; };
    struct Room {
        std::string code, phase = "setting", word, category, question, previousWord, previousCategory;
        std::string rejectedQuestion, rejectionReason, notice;
        std::array<std::string, 2> tokens;
        std::array<Socket*, 2> clients{{nullptr, nullptr}};
        std::array<Time, 2> disconnectedAt{};
        std::array<int, 2> scores{{-1, -1}};
        std::array<bool, 2> ready{{false, false}};
        std::vector<Step> history, previousHistory;
        int firstSetter = 0, stage = 0, move = 0, winner = -2, run = 0;
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
    static int setter(const Room& room) { return room.firstSetter ^ room.stage; }
    static int guesser(const Room& room) { return 1 - setter(room); }
    static bool validWord(const std::string& word) {
        if (word.size() < 6 || word.size() > 36 || word.size() % 3) return false;
        for (std::size_t i = 0; i < word.size(); i += 3) {
            const auto a = static_cast<unsigned char>(word[i]);
            const auto b = static_cast<unsigned char>(word[i + 1]);
            const auto c = static_cast<unsigned char>(word[i + 2]);
            // U+4E00..U+9FFF, ordinary Han characters only.
            if (a < 0xe4 || a > 0xe9 || b < 0x80 || b > 0xbf || c < 0x80 || c > 0xbf
                || (a == 0xe4 && b < 0xb8) || (a == 0xe9 && b > 0xbf)) return false;
        }
        return true;
    }
    static bool validQuestion(const std::string& question) {
        if (question.empty() || question.size() > 180) return false;
        for (unsigned char c : question) if (c < 32 || c == 127) return false;
        return true;
    }
    static bool validCategory(const std::string& category) {
        return category == "动物" || category == "植物" || category == "食物饮品"
            || category == "日常物品" || category == "人物" || category == "地点"
            || category == "歌曲" || category == "电影电视剧" || category == "动漫"
            || category == "游戏" || category == "书籍" || category == "其他";
    }
    static bool validRejection(const std::string& reason) {
        return reason == "不是是非题" || reason == "问题含糊"
            || reason == "一次问了多个问题" || reason == "其他原因";
    }
    static bool positionMatches(const crow::json::rvalue& value, const Room& room) {
        return value.has("run") && value["run"].t() == crow::json::type::Number && value["run"].d() == room.run
            && value.has("stage") && value["stage"].t() == crow::json::type::Number && value["stage"].d() == room.stage
            && value.has("move") && value["move"].t() == crow::json::type::Number && value["move"].d() == room.move;
    }
    void newMatch(Room& room) {
        room.phase = "setting";
        room.word.clear(); room.category.clear(); room.question.clear(); room.previousWord.clear();
        room.previousCategory.clear(); room.rejectedQuestion.clear(); room.rejectionReason.clear(); room.notice.clear();
        room.history.clear(); room.previousHistory.clear(); room.scores = {{-1, -1}}; room.ready = {{false, false}};
        room.stage = 0; room.move = 0; room.winner = -2; room.touched = Clock::now();
        ++room.run;
    }
    static void endStage(Room& room, bool solved) {
        room.scores[guesser(room)] = solved ? room.move : 11;
        if (room.stage == 0) {
            room.previousWord = room.word;
            room.previousCategory = room.category;
            room.previousHistory = std::move(room.history);
            room.stage = 1; room.phase = "setting"; room.word.clear(); room.category.clear();
            room.question.clear(); room.history.clear(); room.rejectedQuestion.clear(); room.rejectionReason.clear(); room.move = 0;
        } else {
            room.phase = "finished";
            room.winner = room.scores[0] == room.scores[1] ? -1 : room.scores[0] < room.scores[1] ? 0 : 1;
            room.ready = {{false, false}};
        }
    }
    static crow::json::wvalue state(const Room& room, int side) {
        crow::json::wvalue value;
        value["type"] = "state"; value["room"] = room.code; value["self"] = side;
        value["phase"] = room.phase; value["run"] = room.run; value["stage"] = room.stage;
        value["move"] = room.move; value["setter"] = setter(room); value["guesser"] = guesser(room);
        value["winner"] = room.winner; value["category"] = room.category;
        value["length"] = static_cast<int>(room.word.size() / 3);
        value["previousWord"] = room.previousWord;
        value["previousCategory"] = room.previousCategory;
        value["rejectedQuestion"] = room.rejectedQuestion;
        value["rejectionReason"] = room.rejectionReason;
        value["leftConnected"] = room.clients[0] != nullptr; value["rightConnected"] = room.clients[1] != nullptr;
        value["leftScore"] = room.scores[0]; value["rightScore"] = room.scores[1];
        value["leftReady"] = room.ready[0]; value["rightReady"] = room.ready[1];
        value["notice"] = room.notice; value["pendingQuestion"] = room.question;
        value["history"] = crow::json::wvalue::list();
        for (std::size_t i = 0; i < room.history.size(); ++i) {
            value["history"][i]["kind"] = room.history[i].kind;
            value["history"][i]["text"] = room.history[i].text;
            value["history"][i]["reply"] = room.history[i].reply;
        }
        value["previousHistory"] = crow::json::wvalue::list();
        for (std::size_t i = 0; i < room.previousHistory.size(); ++i) {
            value["previousHistory"][i]["kind"] = room.previousHistory[i].kind;
            value["previousHistory"][i]["text"] = room.previousHistory[i].text;
            value["previousHistory"][i]["reply"] = room.previousHistory[i].reply;
        }
        if (side == setter(room) || room.phase == "finished") value["answer"] = room.word;
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
        newMatch(room);
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
        if (type == "set" || type == "ask" || type == "guess" || type == "reply") {
            if (!positionMatches(value, room)) { error(socket, "回合已更新，请刷新状态再试。"); return; }
            if (!room.clients[0] || !room.clients[1]) { error(socket, "请等对方重新连接。"); return; }
            if (type == "set") {
                if (room.phase != "setting" || side != setter(room) || !value.has("word") || !value.has("category")
                    || value["word"].t() != crow::json::type::String || value["category"].t() != crow::json::type::String) {
                    error(socket, "现在不能出题。"); return;
                }
                const std::string word = value["word"].s(), category = value["category"].s();
                if (!validWord(word) || !validCategory(category)) { error(socket, "词语须是 2～12 个汉字，并选择分类。"); return; }
                room.word = word; room.category = category; room.phase = "playing";
                send(room); return;
            }
            if (type == "ask" || type == "guess") {
                if (room.phase != "playing" || side != guesser(room) || !value.has("text")
                    || value["text"].t() != crow::json::type::String) {
                    error(socket, "现在不能提问或猜词。"); return;
                }
                const std::string entry = value["text"].s();
                if (type == "ask") {
                    if (!validQuestion(entry)) { error(socket, "请输入 1～60 字的清楚问题。"); return; }
                    room.rejectedQuestion.clear(); room.rejectionReason.clear();
                    room.question = entry; room.phase = "reply";
                } else {
                    if (!validWord(entry)) { error(socket, "请猜 2～12 个汉字的词语。"); return; }
                    room.rejectedQuestion.clear(); room.rejectionReason.clear();
                    const bool yes = entry == room.word;
                    room.history.push_back({"guess", entry, yes ? "猜中了" : "猜错了"});
                    ++room.move;
                    if (yes || room.move == 10) endStage(room, yes);
                }
                send(room); return;
            }
            if (room.phase != "reply" || side != setter(room) || !value.has("answer")
                || value["answer"].t() != crow::json::type::String) {
                error(socket, "现在不能回答。"); return;
            }
            const std::string answer = value["answer"].s();
            if (answer != "是" && answer != "否" && answer != "说不准" && answer != "重问") {
                error(socket, "请选择一个回答。"); return;
            }
            if (answer == "重问") {
                if (!value.has("reason") || value["reason"].t() != crow::json::type::String
                    || !value.has("note") || value["note"].t() != crow::json::type::String) {
                    error(socket, "请选择退回原因。"); return;
                }
                const std::string reason = value["reason"].s(), note = value["note"].s();
                if (!validRejection(reason) || note.size() > 90 || (!note.empty() && !validQuestion(note))) {
                    error(socket, "退回原因或补充说明无效。"); return;
                }
                room.rejectedQuestion = room.question;
                room.rejectionReason = reason + (note.empty() ? "" : "：" + note);
            } else { room.history.push_back({"ask", room.question, answer}); ++room.move; }
            room.question.clear(); room.phase = "playing";
            if (room.move == 10) endStage(room, false);
            send(room);
        } else if (type == "ready" && room.phase == "finished") {
            room.ready[side] = true;
            if (room.ready[0] && room.ready[1]) { room.firstSetter = 1 - room.firstSetter; newMatch(room); }
            send(room);
        } else if (type == "leave") {
            room.clients[side] = nullptr; sessions_.erase(session);
            if (side == 0) {
                if (room.clients[1]) room.clients[1]->close(std::string("\x03\xe8", 2) + "Room closed");
                rooms_.erase(it);
            } else {
                room.tokens[1].clear(); newMatch(room);
                room.notice = "队友离开了，可以邀请新朋友。"; send(room);
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
            room.notice = "队友暂时离线，进度保留，等他重新连接。"; send(room);
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
                room.tokens[1].clear(); room.disconnectedAt[1] = Time{}; newMatch(room);
                room.notice = "队友离线超过两分钟，可以邀请新朋友。"; send(room);
            }
            ++it;
        }
    }
};
