"""Two-client smoke test for the online password match (requires pip install websockets)."""
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


def send(ws, **data):
    ws.send(json.dumps(data))


def state(ws, predicate=lambda s: True):
    return until(ws, lambda s: s.get("type") == "state" and predicate(s))


status, host = post("/api/password/rooms", {})
assert status == 201
_, guest = post("/api/password/join", {"room": host["room"]})
with connect(socket_base + "/ws/password", origin=base) as left, connect(socket_base + "/ws/password", origin=base) as right:
    authenticate(left, host)
    authenticate(right, guest)
    send(left, type="secret", digits="1123")
    assert until(left, lambda s: s.get("type") == "error")
    send(left, type="secret", digits="0123")
    locked = state(left, lambda s: s["leftReady"])
    assert "leftSecret" not in locked and "0123" not in json.dumps(locked)
    send(left, type="secret", digits="4567")
    until(left, lambda s: s.get("type") == "error")
    send(right, type="secret", digits="4271")
    current = state(left, lambda s: s["phase"] == "playing")
    round_id = current["round"]
    assert current["turn"] == 0 and "rightSecret" not in current

    def guess(ws, digits, move, rid=None):
        send(ws, type="guess", digits=digits, move=move, round=round_id if rid is None else rid)

    guess(right, "0123", 0)
    until(right, lambda s: s.get("type") == "error")
    guess(left, "1234", 0)
    current = state(left, lambda s: s["move"] == 1)
    assert current["history"][0] == {"side": 0, "digits": "1234", "exact": 1, "misplaced": 2}
    assert "rightSecret" not in current
    guess(right, "4567", 1)
    state(left, lambda s: s["move"] == 2)
    guess(left, "1234", 2)
    until(left, lambda s: s.get("type") == "error")
    guess(left, "4271", 0)  # stale move must not count
    until(left, lambda s: s.get("type") == "error")
    right.close()
    current = state(left, lambda s: not s["rightConnected"])
    assert current["move"] == 2 and current["phase"] == "playing"
    guess(left, "4271", 2)
    until(left, lambda s: s.get("type") == "error")
    with connect(socket_base + "/ws/password", origin=base) as resumed:
        assert authenticate(resumed, guest)["move"] == 2
        state(left, lambda s: s["rightConnected"])
        guess(left, "4271", 2)
        current = state(left, lambda s: s["move"] == 3)
        assert current["firstSolved"] and current["phase"] == "playing"
        assert "rightSecret" not in current
        guess(resumed, "0123", 3)
        ended = state(left, lambda s: s["phase"] == "finished")
        assert ended["winner"] == -1 and ended["leftSecret"] == "0123" and ended["rightSecret"] == "4271"
        send(left, type="ready")
        assert state(left, lambda s: s["leftReady"])["phase"] == "finished"
        send(resumed, type="ready")
        current = state(left, lambda s: s["phase"] == "waiting")
        assert current["turn"] == 1 and current["history"] == [] and "leftSecret" not in current
        old_round = round_id
        round_id = current["round"]
        send(left, type="secret", digits="0123")
        send(resumed, type="secret", digits="4271")
        state(left, lambda s: s["phase"] == "playing")
        guess(resumed, "0123", 0, old_round)
        until(resumed, lambda s: s.get("type") == "error")
        guess(resumed, "0123", 0)
        state(left, lambda s: s["move"] == 1)
        guess(left, "5678", 1)
        assert state(left, lambda s: s["phase"] == "finished")["winner"] == 1
        send(left, type="ready")
        send(resumed, type="ready")
        current = state(left, lambda s: s["phase"] == "waiting")
        round_id = current["round"]
        send(left, type="secret", digits="0123")
        send(resumed, type="secret", digits="4271")
        state(left, lambda s: s["phase"] == "playing")
        import itertools
        options = [''.join(p) for p in itertools.islice(itertools.permutations("56789", 4), 20)]
        for i, digits in enumerate(options):
            guess(left, digits, i*2)
            state(left, lambda s: s["move"] == i*2+1)
            guess(resumed, digits, i*2+1)
            current = state(left, lambda s: s["move"] == i*2+2)
        assert current["phase"] == "finished" and current["winner"] == -1
        send(resumed, type="leave")
        current = state(left, lambda s: s["phase"] == "waiting")
        assert not current["rightReady"] and not current["leftReady"] and current["move"] == 0
    _, replacement = post("/api/password/join", {"room": host["room"]})
    assert replacement["token"] != guest["token"]
    with connect(socket_base + "/ws/password", origin=base) as newcomer:
        authenticate(newcomer, replacement)
        send(left, type="leave")
        from websockets.exceptions import ConnectionClosedOK
        try:
            while True:
                newcomer.recv(timeout=5)
        except ConnectionClosedOK as ended:
            assert ended.rcvd.code == 1000 and ended.rcvd.reason == "Room closed"
print("PASS: secret privacy, validation, hints, turns, stale actions, reconnect, fair draw, winner, rematch, 20-turn limit, leave/replacement")
