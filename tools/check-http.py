"""检查真实服务，支持本地地址或 Docker 映射地址；只用 Python 标准库。"""
import json
import sys
from urllib.error import HTTPError
from urllib.request import urlopen

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18080").rstrip("/")


def get(path, content_type):
    with urlopen(base + path, timeout=10) as response:
        assert response.status == 200, path
        assert response.headers.get_content_type() == content_type, path
        body = response.read().decode("utf-8")
        assert body, path
        return body


assert json.loads(get("/healthz", "application/json")) == {"status": "ok"}
assert json.loads(get("/api/hello", "application/json")) == {"message": "Hello from C++"}
for page in ("/", "/reaction.html", "/wheel.html", "/card.html", "/question.html", "/fun.html", "/truth.html", "/pet.html", "/planet.html", "/book.html", "/doodle.html", "/smash.html", "/achievements.html"):
    assert "无聊研究所" in get(page, "text/html")
get("/static/style.css", "text/css")
get("/static/pet.css", "text/css")
get("/static/planet.css", "text/css")
get("/static/fun.css", "text/css")
get("/static/book.css", "text/css")
get("/static/achievements.css", "text/css")
get("/static/cards.css", "text/css")
for script in ("main.js", "reaction.js", "wheel.js", "random.js", "truth.js", "pet.js", "planet.js", "fun.js", "book.js", "achievements.js", "cards.js", "doodle.js", "smash.js"):
    get("/static/" + script, "text/javascript")
for endpoint, fields in (
    ("random-card", ("id", "series", "rarity", "keyword", "tagline", "message", "skill", "skillText", "good", "avoid", "luckyItem", "bonusLabel", "bonus", "luck")),
    ("random-question", ("question",)),
    ("random-fun", ("kind", "title", "intro", "label1", "value1", "label2", "value2", "label3", "value3", "footer")),
):
    data = json.loads(get("/api/" + endpoint, "application/json"))
    assert all(field in data for field in fields), endpoint
cards = json.loads(get("/api/cards", "application/json"))
assert len(cards) == 36 and len({row["id"] for row in cards}) == 36
for series in ("relax", "courage", "idea", "luck", "company", "funny"):
    assert sum(row["series"] == series for row in cards) == 6
answers = json.loads(get("/api/book-answers", "application/json"))
assert len(answers) == 200 and len({row["answer"] for row in answers}) == 200
assert all(isinstance(row["answer"], str) and row["answer"].strip() for row in answers)
truths = json.loads(get("/api/truth-questions", "application/json"))
assert {row["category"] for row in truths} == {"light", "deep"}
assert len(truths) == 40 and all(isinstance(row["question"], str) and row["question"] for row in truths)
for path in ("/missing", "/data/cards.json", "/static/main.cpp"):
    try:
        urlopen(base + path, timeout=10)
        raise AssertionError("Expected 404: " + path)
    except HTTPError as error:
        assert error.code == 404, path
print("PASS: health, pages, assets, JSON APIs and 404 responses at " + base)

get("/static/doodle.css", "text/css")

get("/static/smash.css", "text/css")
