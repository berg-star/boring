#include <crow.h>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <random>
#include <set>
#include <sstream>
#include <stdexcept>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#endif

namespace fs = std::filesystem;

// 本地默认只允许本机访问；Docker 通过环境变量开放给 Render 的代理。
unsigned short server_port() {
    const char* value = std::getenv("PORT");
    if (!value) return 18080;
    const std::string text(value);
    if (text.empty() || text.size() > 5 || text.find_first_not_of("0123456789") != std::string::npos)
        throw std::runtime_error("PORT must be an integer between 1 and 65535");
    const auto port = std::stoul(text);
    if (port == 0 || port > 65535)
        throw std::runtime_error("PORT must be an integer between 1 and 65535");
    return static_cast<unsigned short>(port);
}

// 根据可执行文件定位资源；也可用命令行参数指定资源目录。
fs::path executable_directory(const char* argument) {
#ifdef _WIN32
    std::vector<wchar_t> buffer(32768);
    const auto length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (length == 0 || length >= buffer.size()) throw std::runtime_error("Cannot locate executable");
    return fs::path(std::wstring(buffer.data(), length)).parent_path();
#elif defined(__linux__)
    return fs::read_symlink("/proc/self/exe").parent_path();
#else
    return fs::absolute(argument).parent_path();
#endif
}

std::string read_file(const fs::path& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("Cannot open file: " + path.string());
    std::ostringstream contents;
    contents << file.rdbuf();
    if (file.bad()) throw std::runtime_error("Cannot read file: " + path.string());
    return contents.str();
}

// 启动时检查数据，存成不可变 JSON 字符串，多个请求之间不共享可变状态。
std::vector<std::string> load_records(const fs::path& path,
                                    const std::vector<std::string>& text_fields,
                                    const std::vector<std::string>& number_fields = {}) {
    const auto parsed = crow::json::load(read_file(path));
    if (!parsed || parsed.t() != crow::json::type::List || parsed.size() == 0)
        throw std::runtime_error("Expected a nonempty JSON array: " + path.string());
    std::vector<std::string> records;
    for (const auto& row : parsed) {
        if (row.t() != crow::json::type::Object)
            throw std::runtime_error("Expected JSON objects: " + path.string());
        for (const auto& field : text_fields) {
            if (!row.has(field) || row[field].t() != crow::json::type::String || row[field].s().size() == 0)
                throw std::runtime_error("Invalid text field " + field + " in " + path.string());
        }
        for (const auto& field : number_fields) {
            if (!row.has(field) || row[field].t() != crow::json::type::Number || row[field].d() < 0 || row[field].d() > 100)
                throw std::runtime_error("Expected number 0..100 for " + field + " in " + path.string());
        }
        records.push_back(crow::json::wvalue(row).dump());
    }
    return records;
}

crow::response random_record(const std::vector<std::string>& records) {
    // 每个处理线程都有自己的引擎，避免多线程竞争同一个随机数生成器。
    thread_local std::mt19937 generator(std::random_device{}());
    std::uniform_int_distribution<std::size_t> choose(0, records.size() - 1);
    crow::response response(records[choose(generator)]);
    response.set_header("Content-Type", "application/json; charset=utf-8");
    response.set_header("Cache-Control", "no-store");
    return response;
}

crow::response serve_file(const fs::path& path) {
    try {
        crow::response response(read_file(path));
        const auto extension = path.extension().string();
        if (extension == ".html") response.set_header("Content-Type", "text/html; charset=utf-8");
        else if (extension == ".css") response.set_header("Content-Type", "text/css; charset=utf-8");
        else if (extension == ".js") response.set_header("Content-Type", "text/javascript; charset=utf-8");
        response.set_header("X-Content-Type-Options", "nosniff");
        response.set_header("Cache-Control", "no-cache");
        return response;
    } catch (const std::exception&) {
        return crow::response(404, "File not found");
    }
}

int main(int argc, char* argv[]) try {
    const auto port = server_port();
    const char* configured_host = std::getenv("HOST");
    const std::string host = configured_host ? configured_host : "127.0.0.1";
    if (host != "127.0.0.1" && host != "0.0.0.0")
        throw std::runtime_error("HOST must be 127.0.0.1 or 0.0.0.0");
    const fs::path root = argc > 1 ? fs::absolute(argv[1]) : executable_directory(argv[0]);
    const auto cards = load_records(root / "data/cards.json", {"id", "series", "rarity", "keyword", "tagline", "message", "skill", "skillText", "good", "avoid", "luckyItem", "bonusLabel", "bonus"}, {"luck"});
    crow::json::wvalue card_list = crow::json::wvalue::list();
    std::set<std::string> card_ids;
    const std::set<std::string> card_series = {"relax", "courage", "idea", "luck", "company", "funny"};
    for (std::size_t i = 0; i < cards.size(); ++i) {
        const auto row = crow::json::load(cards[i]);
        const std::string id = row["id"].s(), series = row["series"].s(), rarity = row["rarity"].s();
        if (!card_ids.insert(id).second || !card_series.count(series) || (rarity != "R" && rarity != "SR" && rarity != "SSR"))
            throw std::runtime_error("Invalid card identity or series");
        card_list[i] = crow::json::wvalue(row);
    }
    const auto card_json = card_list.dump();
    const auto questions = load_records(root / "data/questions.json", {"question"});
    const auto activities = load_records(root / "data/activities.json", {"kind", "title", "intro", "label1", "value1", "label2", "value2", "label3", "value3", "footer"});
    const auto answers = load_records(root / "data/answers.json", {"answer"});
    crow::json::wvalue answer_list = crow::json::wvalue::list();
    for (std::size_t i = 0; i < answers.size(); ++i)
        answer_list[i] = crow::json::wvalue(crow::json::load(answers[i]));
    const auto answer_json = answer_list.dump();
    const auto truths = load_records(root / "data/truths.json", {"category", "question"});
    crow::json::wvalue truth_list = crow::json::wvalue::list();
    std::set<std::string> truth_categories;
    for (std::size_t i = 0; i < truths.size(); ++i) {
        const auto row = crow::json::load(truths[i]);
        const std::string category = row["category"].s();
        if (category != "light" && category != "deep") throw std::runtime_error("Invalid truth category");
        truth_categories.insert(category);
        truth_list[i] = crow::json::wvalue(row);
    }
    if (truth_categories.size() != 2) throw std::runtime_error("Both truth categories are required");
    const auto truth_json = truth_list.dump();
    if (!fs::is_regular_file(root / "static/index.html")) throw std::runtime_error("static/index.html is missing");
    crow::SimpleApp app;
    // 固定路径先注册，避免被下面的通用 /<string> 页面路由匹配。
    // 数据通过启动校验且 HTTP 服务正常接收请求，才会返回健康状态。
    CROW_ROUTE(app, "/healthz")([] {
        crow::json::wvalue result;
        result["status"] = "ok";
        crow::response response(result);
        response.set_header("Cache-Control", "no-store");
        return response;
    });
    // 只公开列出的网页和资源，不把任意用户路径拼到磁盘路径里。
    const std::set<std::string> pages = {"index.html", "reaction.html", "wheel.html", "card.html", "question.html", "fun.html", "truth.html", "pet.html", "planet.html", "book.html", "doodle.html", "smash.html", "achievements.html"};
    const std::set<std::string> assets = {"style.css", "main.js", "reaction.js", "wheel.js", "wheel-presets.js", "wheel.css", "random.js", "truth.js", "pet.js", "pet.css", "planet.js", "planet.css", "fun.js", "fun.css", "book.js", "book.css", "achievements.js", "achievements.css", "cards.js", "cards.css", "doodle.js", "doodle.css", "smash.js", "smash.css"};
    CROW_ROUTE(app, "/")([&] { return serve_file(root / "static/index.html"); });
    CROW_ROUTE(app, "/<string>")([&](const std::string& name) {
        if (!pages.count(name)) return crow::response(404, "Page not found");
        return serve_file(root / "static" / name);
    });
    CROW_ROUTE(app, "/static/<string>")([&](const std::string& name) {
        if (!assets.count(name) && !pages.count(name)) return crow::response(404, "File not found");
        return serve_file(root / "static" / name);
    });
    CROW_ROUTE(app, "/api/truth-questions")([&] {
        crow::response response(truth_json);
        response.set_header("Content-Type", "application/json; charset=utf-8");
        response.set_header("Cache-Control", "no-store");
        return response;
    });
    CROW_ROUTE(app, "/api/hello")([] {
        crow::json::wvalue result;
        result["message"] = "Hello from C++";
        return result;
    });
    CROW_ROUTE(app, "/api/cards")([&] {
        crow::response response(card_json);
        response.set_header("Content-Type", "application/json; charset=utf-8");
        response.set_header("Cache-Control", "no-store");
        return response;
    });
    CROW_ROUTE(app, "/api/random-card")([&] { return random_record(cards); });
    CROW_ROUTE(app, "/api/random-question")([&] { return random_record(questions); });
    CROW_ROUTE(app, "/api/book-answers")([&] {
        crow::response response(answer_json);
        response.set_header("Content-Type", "application/json; charset=utf-8");
        response.set_header("Cache-Control", "no-store");
        return response;
    });
    CROW_ROUTE(app, "/api/random-fun")([&] { return random_record(activities); });
    std::cout << "Boring Lab listening on " << host << ':' << port
              << "\nResources: " << root.string() << std::endl;
    // 小站两个工作线程足够，避免共享宿主机核数导致过多线程。
    app.bindaddr(host).port(port).concurrency(2).run();
} catch (const std::exception& error) {
    std::cerr << "Boring Lab could not start: " << error.what() << '\n';
    return 1;
}
