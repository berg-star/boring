#pragma once
#include <crow.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <mutex>
#include <numeric>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

// Three rounds of privately ranked choices. Reveal happens only after both have submitted.
class HarmonyRooms {
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    using Socket = crow::websocket::connection;
    struct Prompt { const char* title; std::array<const char*, 5> options; };
    inline static constexpr std::array<Prompt, 18> prompts_{{
        {"周末突然空出一整天，你最想做什么？", {{"睡个懒觉", "和朋友见面", "打一整天游戏", "找家店吃饭", "去陌生地方逛逛"}}},
        {"和朋友去旅行，你最在意什么？", {{"路上的风景", "当地美食", "住得舒服", "花多少钱", "行程有多自由"}}},
        {"如果得到一项日常超能力，你最想要哪项？", {{"随时瞬移", "读懂动物", "暂停时间", "不用睡觉", "过目不忘"}}},
        {"一周太累了，你最想怎样放松？", {{"听歌发呆", "睡到自然醒", "出去散步", "找人聊聊天", "看一部电影"}}},
        {"一起开一家小店，你最想负责哪部分？", {{"设计店面", "研发产品", "和顾客聊天", "算账运营", "拍照宣传"}}},
        {"朋友约你临时出门，哪种活动最有吸引力？", {{"探一家新店", "看展览", "逛公园", "打桌游", "看场电影"}}},
        {"手机只剩百分之一电，你会优先做什么？", {{"发消息报平安", "找充电宝", "查回家的路线", "保存重要信息", "拍最后一张照片"}}},
        {"假如搬到一个新城市，你会先探索哪里？", {{"街边小吃", "附近公园", "书店和咖啡馆", "博物馆", "菜市场"}}},
        {"收到一笔意外奖金，你会最先怎么安排？", {{"存起来", "请朋友吃饭", "去旅行", "买一直想要的东西", "学一项新技能"}}},
        {"一起租房，哪一点对你最重要？", {{"离工作或学校近", "采光好", "房租便宜", "隔音好", "附近吃饭方便"}}},
        {"只能给假期保留一项活动，你会选什么？", {{"赖床", "出门旅游", "和朋友聚会", "打游戏", "做一顿好吃的"}}},
        {"一个普通的雨天，什么最能让你开心？", {{"不用出门", "热腾腾的饭", "听雨声", "看喜欢的剧", "有人带来奶茶"}}},
        {"两个人组队参加比赛，你想负责什么？", {{"制定策略", "搜集线索", "临场沟通", "解决难题", "鼓励队友"}}},
        {"如果能免费上任意一门课，你最想学什么？", {{"做饭", "摄影", "弹乐器", "外语", "编程"}}},
        {"突然有两小时空闲，你最可能先做什么？", {{"补觉", "刷视频", "读点东西", "收拾房间", "给朋友打电话"}}},
        {"朋友送你礼物，你最看重哪一点？", {{"实用", "有纪念意义", "出乎意料", "亲手制作", "很懂我的喜好"}}},
        {"出门忘带一样东西，哪件最让你难受？", {{"手机", "钥匙", "耳机", "水杯", "钱包"}}},
        {"理想的周五晚上，你最想怎么过？", {{"早早睡觉", "去吃夜宵", "追剧", "出门散步", "和朋友聊天"}}}
    }};
    struct Room {
        std::string code, notice, phase = "ranking";
        std::array<std::string, 2> tokens;
        std::array<Socket*, 2> clients{{nullptr, nullptr}};
        std::array<Time, 2> disconnectedAt{};
        std::array<int, 3> promptIds{{0, 0, 0}}, roundScores{{-1, -1, -1}};
        std::array<std::array<int, 5>, 2> initial{}, orders{};
        std::array<bool, 2> submitted{{false, false}}, ready{{false, false}};
        int round = 0, run = 0, total = 0;
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
    void startRound(Room& room) {
        room.phase = "ranking";
        room.submitted = {{false, false}}; room.ready = {{false, false}};
        std::mt19937 generator(entropy_());
        for (auto& order : room.initial) {
            std::iota(order.begin(), order.end(), 0);
            std::shuffle(order.begin(), order.end(), generator);
        }
        while (room.initial[1] == room.initial[0]) std::shuffle(room.initial[1].begin(), room.initial[1].end(), generator);
    }
    void newMatch(Room& room) {
        std::array<int, prompts_.size()> candidates{};
        std::iota(candidates.begin(), candidates.end(), 0);
        std::mt19937 generator(entropy_());
        std::shuffle(candidates.begin(), candidates.end(), generator);
        for (int i = 0; i < 3; ++i) room.promptIds[i] = candidates[i];
        room.round = 0; room.total = 0; room.roundScores = {{-1, -1, -1}};
        room.notice.clear(); room.touched = Clock::now(); ++room.run;
        startRound(room);
    }
    static int agreement(const std::array<int, 5>& left, const std::array<int, 5>& right) {
        std::array<int, 5> posLeft{}, posRight{};
        for (int i = 0; i < 5; ++i) { posLeft[left[i]] = i; posRight[right[i]] = i; }
        int score = 0;
        for (int a = 0; a < 5; ++a)
            for (int b = a + 1; b < 5; ++b)
                if ((posLeft[a] < posLeft[b]) == (posRight[a] < posRight[b])) ++score;
        return score;
    }
    static crow::json::wvalue state(const Room& room, int side) {
        crow::json::wvalue value;
        value["type"] = "state"; value["room"] = room.code; value["self"] = side;
        value["phase"] = room.phase; value["round"] = room.round; value["run"] = room.run;
        value["title"] = prompts_[room.promptIds[room.round]].title;
        value["options"] = crow::json::wvalue::list();
        for (int i = 0; i < 5; ++i) value["options"][i] = prompts_[room.promptIds[room.round]].options[i];
        value["myOrder"] = crow::json::wvalue::list();
        const auto& mine = room.submitted[side] ? room.orders[side] : room.initial[side];
        for (int i = 0; i < 5; ++i) value["myOrder"][i] = mine[i];
        value["leftSubmitted"] = room.submitted[0]; value["rightSubmitted"] = room.submitted[1];
        value["leftConnected"] = room.clients[0] != nullptr; value["rightConnected"] = room.clients[1] != nullptr;
        value["leftReady"] = room.ready[0]; value["rightReady"] = room.ready[1];
        value["roundScores"] = crow::json::wvalue::list();
        for (int i = 0; i < 3; ++i) value["roundScores"][i] = room.roundScores[i];
        value["total"] = room.total; value["notice"] = room.notice;
        if (room.phase != "ranking") {
            value["leftOrder"] = crow::json::wvalue::list(); value["rightOrder"] = crow::json::wvalue::list();
            for (int i = 0; i < 5; ++i) {
                value["leftOrder"][i] = room.orders[0][i]; value["rightOrder"][i] = room.orders[1][i];
            }
        }
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
    static bool positionMatches(const crow::json::rvalue& value, const Room& room) {
        return value.has("run") && value["run"].t() == crow::json::type::Number && value["run"].d() == room.run
            && value.has("round") && value["round"].t() == crow::json::type::Number && value["round"].d() == room.round;
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
        if (type == "submit") {
            if (room.phase != "ranking" || !room.clients[0] || !room.clients[1] || room.submitted[side]) {
                error(socket, "现在不能提交排序，请等对方连接或进入下一轮。"); return;
            }
            if (!positionMatches(value, room)) { error(socket, "轮次已更新，请重新排序。"); return; }
            if (!value.has("order") || value["order"].t() != crow::json::type::List || value["order"].size() != 5) {
                error(socket, "请把五个选项都排好。"); return;
            }
            std::array<int, 5> order{};
            std::array<bool, 5> used{};
            for (int i = 0; i < 5; ++i) {
                const auto& item = value["order"][i];
                if (item.t() != crow::json::type::Number || !std::isfinite(item.d())
                    || item.d() < 0 || item.d() > 4 || item.d() != static_cast<int>(item.d())
                    || used[static_cast<int>(item.d())]) {
                    error(socket, "排序里有重复或无效选项。"); return;
                }
                order[i] = static_cast<int>(item.d()); used[order[i]] = true;
            }
            room.orders[side] = order; room.submitted[side] = true;
            if (room.submitted[0] && room.submitted[1]) {
                const int score = agreement(room.orders[0], room.orders[1]);
                room.roundScores[room.round] = score; room.total += score;
                room.phase = room.round == 2 ? "finished" : "reveal";
                room.ready = {{false, false}};
            }
            send(room);
        } else if ((type == "next" && room.phase == "reveal") || (type == "ready" && room.phase == "finished")) {
            if (!positionMatches(value, room)) { error(socket, "轮次已更新，请刷新状态。"); return; }
            room.ready[side] = true;
            if (room.ready[0] && room.ready[1]) {
                if (type == "next") { ++room.round; startRound(room); }
                else newMatch(room);
            }
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
