"""Regression: joining without WebSocket auth must release a guest seat after two minutes."""
import json
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18080").rstrip("/")


def post(path, data):
    request = Request(base + path, json.dumps(data).encode(), {"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=15) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


rooms = []
for game in ("tug", "reaction"):
    status, host = post("/api/" + game + "/rooms", {})
    assert status == 201 and len(host["room"]) == 6, (game, host)
    status, first = post("/api/" + game + "/join", {"room": host["room"]})
    assert status == 200 and first["side"] == 1, (game, first)
    status, occupied = post("/api/" + game + "/join", {"room": host["room"]})
    assert status == 409, (game, status, occupied)
    rooms.append((game, host["room"], first["token"]))

# Both games wait concurrently. Server tick runs every 100 ms; leave a little scheduling margin.
time.sleep(123)
for game, code, old_token in rooms:
    status, replacement = post("/api/" + game + "/join", {"room": code})
    assert status == 200 and replacement["side"] == 1, (game, status, replacement)
    assert replacement["token"] != old_token, game

print("PASS: tug and reaction release guest seats that never authenticated by WebSocket")