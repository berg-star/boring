"""Two-client integration test for the online yes/no deduction duel."""
import json
import sys
import time
from urllib.request import Request, urlopen

from websockets.sync.client import connect
from websockets.exceptions import ConnectionClosedOK

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18091").rstrip("/")
socket_base = base.replace("https://", "wss://").replace("http://", "ws://")
profiles = {
    "企鹅": (0, 2, 3), "麻雀": (0, 3, 4), "海豚": (0, 2, 5), "乌龟": (0, 2, 6),
    "猫": (0, 5), "蜜蜂": (0, 4, 7), "苹果": (1, 8, 9), "柠檬": (1, 8, 10),
    "面包": (1, 12), "鸡蛋": (1, 6), "牛奶": (1, 11), "台灯": (13, 14),
    "风扇": (13, 18), "手机": (13, 14, 15), "雨伞": (16,), "自行车": (17,)
}


def post(path, data):
    with urlopen(Request(base + path, json.dumps(data).encode(), {"Content-Type": "application/json"}, method="POST"), timeout=15) as response:
        return response.status, json.load(response)


def until(socket, predicate, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        msg = json.loads(socket.recv(timeout=max(.1, end - time.monotonic())))
        if predicate(msg):
            return msg
    raise AssertionError("Timed out waiting for word match state")


def state(socket, predicate=lambda s: True):
    return until(socket, lambda s: s.get("type") == "state" and predicate(s))


def send(socket, **data):
    socket.send(json.dumps(data))


def auth(socket, credentials):
    send(socket, type="auth", room=credentials["room"], token=credentials["token"])
    return state(socket)

status, host = post("/api/word/rooms", {})
assert status == 201 and host["side"] == 0
_, guest = post("/api/word/join", {"room": host["room"]})
assert guest["side"] == 1
with connect(socket_base + "/ws/word", origin=base) as left:
    initial = auth(left, host)
    assert initial["phase"] == "waiting" and "answer" not in initial
    with connect(socket_base + "/ws/word", origin=base) as right:
        joined = auth(right, guest)
        states = [state(left, lambda s: s["phase"] == "playing"), joined]
        assert states[0]["words"] == states[1]["words"] == list(profiles)
        assert len(states[0]["questions"]) == 19 and "answer" not in states[0]
        sockets = [left, right]

        def act(side, kind, id):
            previous = states[side]
            send(sockets[side], type=kind, id=id, run=previous["run"], move=previous["move"])
            expected = previous["move"] + 1
            for index in range(2):
                states[index] = state(sockets[index], lambda s: s["move"] == expected)
            assert "answer" not in states[side] or states[side]["phase"] == "finished"
            assert len(states[side]["history"]) == states[side]["rightCount" if side else "leftCount"]
            return states[side]["history"][-1]

        # Invalid or out-of-turn actions do not consume an action.
        send(right, type="ask", id=0, run=states[1]["run"], move=0)
        assert until(right, lambda s: s.get("type") == "error")
        send(left, type="ask", id=999, run=states[0]["run"], move=0)
        assert until(left, lambda s: s.get("type") == "error")
        assert act(0, "ask", 0)["kind"] == "ask"
        assert states[1]["history"] == []  # Opponent's question and response remain private.
        act(1, "ask", 1)
        send(left, type="ask", id=0, run=states[0]["run"], move=states[0]["move"])
        assert until(left, lambda s: s.get("type") == "error")
        send(left, type="ask", id=2, run=states[0]["run"], move=0)
        assert until(left, lambda s: s.get("type") == "error")
        right.close()
        paused = state(left, lambda s: not s["rightConnected"])
        assert paused["phase"] == "playing" and paused["move"] == 2
        send(left, type="ask", id=2, run=paused["run"], move=paused["move"])
        assert until(left, lambda s: s.get("type") == "error")
        with connect(socket_base + "/ws/word", origin=base) as resumed:
            sockets[1] = resumed
            states[1] = auth(resumed, guest)
            states[0] = state(left, lambda s: s["rightConnected"])
            assert states[1]["move"] == 2 and states[1]["history"][0]["id"] == 1
            candidates = set(profiles)
            for side in (0, 1):
                step = states[side]["history"][0]
                candidates = {word for word in candidates if (step["id"] in profiles[word]) == step["yes"]}

            def choose_question(side):
                used = {step["id"] for step in states[side]["history"] if step["kind"] == "ask"}
                choices = [(min(sum(q in profiles[word] for word in candidates),
                                sum(q not in profiles[word] for word in candidates)), q)
                           for q in range(19) if q not in used]
                best, q = max(choices)
                assert best > 0
                return q

            # Select questions that split the remaining possibilities until one word remains.
            while len(candidates) > 1:
                side = states[0]["turn"]
                question = choose_question(side)
                step = act(side, "ask", question)
                candidates = {word for word in candidates if (question in profiles[word]) == step["yes"]}
                assert len(states[0]["history"]) <= 10 and len(states[1]["history"]) <= 10
            target = next(iter(candidates))
            # Complete a pair of turns without a guess, then both correctly guess in the same round.
            if states[0]["move"] % 2:
                side = states[0]["turn"]
                act(side, "ask", next(q for q in range(19) if q not in {x["id"] for x in states[side]["history"] if x["kind"] == "ask"}))
            for _ in range(2):
                side = states[0]["turn"]
                result = act(side, "guess", states[side]["words"].index(target))
                assert result["yes"]
            assert states[0]["phase"] == "finished" and states[0]["winner"] == -1
            assert states[0]["answer"] == states[1]["answer"] == target

            send(left, type="ready")
            states[0] = state(left, lambda s: s["leftReady"])
            send(resumed, type="ready")
            states[0] = state(left, lambda s: s["phase"] == "playing" and s["run"] != initial["run"])
            states[1] = state(resumed, lambda s: s["phase"] == "playing" and s["run"] == states[0]["run"])
            assert states[0]["turn"] == 1 and states[0]["history"] == []
            assert "answer" not in states[1]
            # Reveal the new word only through yes/no answers. Starter then wins on a paired turn.
            candidates = set(profiles)
            while len(candidates) > 1:
                side = states[0]["turn"]
                question = choose_question(side)
                step = act(side, "ask", question)
                candidates = {word for word in candidates if (question in profiles[word]) == step["yes"]}
            target2 = next(iter(candidates))
            if states[0]["move"] % 2:
                side = states[0]["turn"]
                act(side, "ask", next(q for q in range(19) if q not in {x["id"] for x in states[side]["history"] if x["kind"] == "ask"}))
            assert states[0]["turn"] == 1
            assert act(1, "guess", states[1]["words"].index(target2))["yes"]
            wrong = next(i for i, word in enumerate(states[0]["words"]) if word != target2)
            assert not act(0, "guess", wrong)["yes"]
            assert states[0]["phase"] == "finished" and states[0]["winner"] == 1
            assert target != target2  # Replay chooses a different target.
            send(left, type="ready")
            state(left, lambda s: s["leftReady"])
            send(resumed, type="ready")
            states[0] = state(left, lambda s: s["phase"] == "playing" and s["move"] == 0)
            states[1] = state(resumed, lambda s: s["phase"] == "playing" and s["run"] == states[0]["run"])
            # Twenty non-guess actions (ten each) lead to a draw.
            for _ in range(20):
                side = states[0]["turn"]
                used = {step["id"] for step in states[side]["history"] if step["kind"] == "ask"}
                act(side, "ask", next(q for q in range(19) if q not in used))
            assert states[0]["phase"] == "finished" and states[0]["winner"] == -1
            assert states[0]["leftCount"] == states[0]["rightCount"] == 10
            send(resumed, type="leave")
            states[0] = state(left, lambda s: s["phase"] == "waiting")
            assert states[0]["move"] == 0 and not states[0]["rightConnected"]
    _, replacement = post("/api/word/join", {"room": host["room"]})
    assert replacement["token"] != guest["token"]
    with connect(socket_base + "/ws/word", origin=base) as newcomer:
        auth(newcomer, replacement)
        send(left, type="leave")
        try:
            while True:
                newcomer.recv(timeout=5)
        except ConnectionClosedOK as ended:
            assert ended.rcvd.code == 1000 and ended.rcvd.reason == "Room closed"
print("PASS: 16 distinct targets, private histories, yes/no deductions, turn validation, same-round draw, winner, limit, rematch, reconnect and replacement")
