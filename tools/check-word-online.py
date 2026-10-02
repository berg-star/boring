"""Two-client integration checks for the human-authored two-round word game."""
import json
import sys
import time
from urllib.request import Request, urlopen
from websockets.sync.client import connect
from websockets.exceptions import ConnectionClosedOK

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18091").rstrip("/")
ws_base = base.replace("https://", "wss://").replace("http://", "ws://")


def post(path, data):
    with urlopen(Request(base + path, json.dumps(data).encode(), {"Content-Type": "application/json"}, method="POST"), timeout=15) as response:
        return response.status, json.load(response)


def until(socket, predicate, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        msg = json.loads(socket.recv(timeout=max(.1, end - time.monotonic())))
        if predicate(msg):
            return msg
    raise AssertionError("Timed out waiting for word state")


def state(socket, predicate=lambda s: True):
    return until(socket, lambda s: s.get("type") == "state" and predicate(s))


def send(socket, **data):
    socket.send(json.dumps(data, ensure_ascii=False))


def auth(socket, credentials):
    send(socket, type="auth", room=credentials["room"], token=credentials["token"])
    return state(socket)


status, host = post("/api/word/rooms", {})
assert status == 201 and host["side"] == 0
_, guest = post("/api/word/join", {"room": host["room"]})
assert guest["side"] == 1
with connect(ws_base + "/ws/word", origin=base) as left:
    initial = auth(left, host)
    assert initial["phase"] == "setting" and initial["stage"] == 0
    with connect(ws_base + "/ws/word", origin=base) as right:
        joined = auth(right, guest)
        states = [state(left, lambda s: s["rightConnected"]), joined]
        sockets = [left, right]

        def action(side, kind, **extra):
            previous = states[side]
            send(sockets[side], type=kind, run=previous["run"], stage=previous["stage"], move=previous["move"], **extra)
            for index in range(2):
                states[index] = state(sockets[index], lambda s: s["phase"] != previous["phase"] or s["move"] != previous["move"] or s["stage"] != previous["stage"])
            return states

        def rejected(side, kind, **extra):
            previous = states[side]
            send(sockets[side], type=kind, run=previous["run"], stage=previous["stage"], move=previous["move"], **extra)
            assert until(sockets[side], lambda s: s.get("type") == "error")

        rejected(1, "set", word="小熊猫", category="动物")
        rejected(0, "set", word="猫", category="动物")
        rejected(0, "set", word="abc", category="动物")
        action(0, "set", word="小熊猫", category="动物")
        assert states[0]["answer"] == "小熊猫"
        assert "answer" not in states[1] and states[1]["length"] == 3 and states[1]["category"] == "动物"
        rejected(0, "ask", text="它是动物吗？")
        action(1, "ask", text="它是动物吗？")
        assert states[0]["pendingQuestion"] == states[1]["pendingQuestion"] == "它是动物吗？"
        assert states[1]["move"] == 0 and "answer" not in states[1]
        rejected(1, "reply", answer="是")
        # Reconnection during a pending question resumes exactly the same stage.
        right.close()
        states[0] = state(left, lambda s: not s["rightConnected"])
        rejected(0, "reply", answer="是")
        with connect(ws_base + "/ws/word", origin=base) as resumed:
            sockets[1] = resumed
            states[1] = auth(resumed, guest)
            states[0] = state(left, lambda s: s["rightConnected"])
            assert states[1]["phase"] == "reply" and "answer" not in states[1]
            action(0, "reply", answer="重问")
            assert states[1]["move"] == 0 and states[1]["history"] == []
            action(1, "ask", text="它住在竹林吗？")
            action(0, "reply", answer="说不准")
            assert states[1]["move"] == 1 and states[1]["history"][0]["reply"] == "说不准"
            rejected(1, "guess", text="x")
            action(1, "guess", text="大熊猫")
            assert states[1]["move"] == 2 and states[1]["history"][-1]["reply"] == "猜错了"
            # Stale request must not use a new stage's action slot.
            send(resumed, type="guess", text="小熊猫", run=states[1]["run"], stage=0, move=0)
            assert until(resumed, lambda s: s.get("type") == "error")
            action(1, "guess", text="小熊猫")
            assert states[1]["stage"] == 1 and states[1]["phase"] == "setting"
            assert states[0]["rightScore"] == states[1]["rightScore"] == 3
            assert states[1]["previousWord"] == "小熊猫"
            assert "answer" not in states[0] or states[0]["answer"] == ""
            action(1, "set", word="橘子", category="食物")
            assert "answer" not in states[0] and states[0]["category"] == "食物"
            action(0, "guess", text="橘子")
            assert states[0]["phase"] == states[1]["phase"] == "finished"
            assert states[0]["leftScore"] == 1 and states[1]["rightScore"] == 3
            assert states[0]["winner"] == 0 and states[0]["answer"] == "橘子"
            send(left, type="ready")
            states[0] = state(left, lambda s: s["leftReady"])
            send(resumed, type="ready")
            states[0] = state(left, lambda s: s["phase"] == "setting" and s["run"] != initial["run"])
            states[1] = state(resumed, lambda s: s["run"] == states[0]["run"])
            assert states[0]["setter"] == 1 and states[0]["previousWord"] == "" and states[0]["leftScore"] == -1
            # Ten valid actions without solving earn the 11-point penalty; second round swaps roles.
            action(1, "set", word="苹果", category="食物")
            for i in range(10):
                action(0, "guess", text=f"大熊猫" if i % 2 == 0 else "小熊猫")
            assert states[0]["stage"] == 1 and states[0]["leftScore"] == 11
            action(0, "set", word="海豚", category="动物")
            for i in range(10):
                action(1, "guess", text="大熊猫" if i % 2 == 0 else "小熊猫")
            assert states[0]["phase"] == "finished" and states[0]["winner"] == -1
            assert states[0]["leftScore"] == states[1]["rightScore"] == 11
            send(resumed, type="leave")
            states[0] = state(left, lambda s: s["phase"] == "setting" and not s["rightConnected"])
            assert states[0]["move"] == 0 and states[0]["leftScore"] == -1
    _, replacement = post("/api/word/join", {"room": host["room"]})
    assert replacement["token"] != guest["token"]
    with connect(ws_base + "/ws/word", origin=base) as newcomer:
        auth(newcomer, replacement)
        send(left, type="leave")
        try:
            while True:
                newcomer.recv(timeout=5)
        except ConnectionClosedOK as closed:
            assert closed.rcvd.code == 1000 and closed.rcvd.reason == "Room closed"
print("PASS: private word, free questions, human replies, invalid re-ask, exact guess, two rounds, scores, limit, rematch, reconnect and replacement")
