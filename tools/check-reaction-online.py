"""Two-client smoke test for the online reaction match (requires pip install websockets)."""
import json
import sys
import time
from urllib.request import Request, urlopen

from websockets.sync.client import connect

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18080").rstrip("/")
socket_base = base.replace("https://", "wss://").replace("http://", "ws://")


def post(path, data):
    request = Request(
        base + path,
        json.dumps(data).encode(),
        {"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=15) as response:
        return response.status, json.load(response)


def until(socket, predicate, timeout=12):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        state = json.loads(socket.recv(timeout=max(0.1, end - time.monotonic())))
        if predicate(state):
            return state
    raise AssertionError("Timed out waiting for a match state")


def authenticate(socket, credentials):
    socket.send(json.dumps({"type": "auth", "room": credentials["room"], "token": credentials["token"]}))
    return until(socket, lambda s: s.get("type") == "state")


status, host = post("/api/reaction/rooms", {})
assert status == 201 and len(host["room"]) == 6
status, guest = post("/api/reaction/join", {"room": host["room"]})
assert status == 200 and guest["side"] == 1
with connect(socket_base + "/ws/reaction", origin=base, open_timeout=15) as left:
    authenticate(left, host)
    with connect(socket_base + "/ws/reaction", origin=base, open_timeout=15) as right:
        authenticate(right, guest)

        # A tap during the countdown forfeits the match.
        left.send('{"type":"ready"}')
        right.send('{"type":"ready"}')
        until(left, lambda s: s.get("phase") == "countdown")
        left.send('{"type":"tap"}')
        ended = until(left, lambda s: s.get("phase") == "finished")
        assert (ended["winner"], ended["falseStart"], ended["leftMs"]) == (1, 0, -1)
        assert until(right, lambda s: s.get("phase") == "finished")["winner"] == 1

        # Both players must ready again. The server announces GO, then records each tap.
        left.send('{"type":"ready"}')
        right.send('{"type":"ready"}')
        until(left, lambda s: s.get("phase") == "go")
        until(right, lambda s: s.get("phase") == "go")
        left.send('{"type":"tap"}')
        until(left, lambda s: s.get("leftMs", -1) >= 0)
        time.sleep(0.04)
        right.send('{"type":"tap"}')
        ended = until(left, lambda s: s.get("phase") == "finished")
        assert ended["winner"] == 0 and ended["leftMs"] <= ended["rightMs"], ended

        # A disconnect during a match returns the room to waiting.
        left.send('{"type":"ready"}')
        right.send('{"type":"ready"}')
        until(left, lambda s: s.get("phase") == "countdown")
        right.close()
        interrupted = until(left, lambda s: s.get("phase") == "waiting")
        assert not interrupted["rightConnected"]

    with connect(socket_base + "/ws/reaction", origin=base, open_timeout=15) as resumed:
        assert authenticate(resumed, guest)["self"] == 1
        assert until(left, lambda s: s.get("rightConnected"))["phase"] == "waiting"
        resumed.send('{"type":"leave"}')
        until(left, lambda s: not s.get("rightConnected"))
    status, replacement = post("/api/reaction/join", {"room": host["room"]})
    assert status == 200 and replacement["token"] != guest["token"]
    left.send('{"type":"leave"}')

print("PASS: room, early start, shared GO, scores, rematch, interrupted round, reconnect, replacement")
