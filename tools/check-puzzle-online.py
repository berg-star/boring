"""Two-client integration check for cooperative, asymmetric puzzles."""
import json
import re
import sys
import time
from urllib.request import Request, urlopen

from websockets.sync.client import connect
from websockets.exceptions import ConnectionClosedOK

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18091").rstrip("/")
socket_base = base.replace("https://", "wss://").replace("http://", "ws://")


def post(path, data):
    with urlopen(Request(base + path, json.dumps(data).encode(), {"Content-Type": "application/json"}, method="POST"), timeout=15) as response:
        return response.status, json.load(response)


def until(socket, predicate, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        state = json.loads(socket.recv(timeout=max(0.1, end - time.monotonic())))
        if predicate(state):
            return state
    raise AssertionError("Timed out waiting for puzzle state")


def state(socket, predicate=lambda s: True):
    return until(socket, lambda s: s.get("type") == "state" and predicate(s))


def auth(socket, credentials):
    socket.send(json.dumps({"type": "auth", "room": credentials["room"], "token": credentials["token"]}))
    return state(socket)


def send(socket, **data):
    socket.send(json.dumps(data))


def solution(left, right, stage):
    a, b = left["clue"], right["clue"]
    if stage == 0:
        mapping = dict(re.findall(r"([星月云风]) → (\d)", a))
        sequence = re.findall(r"[星月云风]", b)
        assert len(mapping) == len(sequence) == 4
        return "".join(mapping[symbol] for symbol in sequence)
    if stage == 1:
        rows = dict((name, list(letters)) for name, *letters in re.findall(r"^([ABC])\s+([A-Z])\s+([A-Z])\s+([A-Z])", a, re.MULTILINE))
        coordinates = re.findall(r"([ABC])([123])", b)
        assert len(rows) == 3 and len(coordinates) == 4
        return "".join(rows[row][int(col) - 1] for row, col in coordinates)
    gauges = {name: int(value) for name, value in re.findall(r"([ABCD]) = (\d)", a)}
    assert len(gauges) == 4 and "(A + C) × B − D" in b
    return f"{((gauges['A'] + gauges['C']) * gauges['B'] - gauges['D']) % 100:02d}"


status, host = post("/api/puzzle/rooms", {})
assert status == 201 and host["side"] == 0
_, guest = post("/api/puzzle/join", {"room": host["room"]})
assert guest["side"] == 1 and host["token"] != guest["token"]
with connect(socket_base + "/ws/puzzle", origin=base) as left:
    initial = auth(left, host)
    assert initial["phase"] == "waiting" and initial["stage"] == 0
    with connect(socket_base + "/ws/puzzle", origin=base) as right:
        current_right = auth(right, guest)
        current_left = state(left, lambda s: s["phase"] == "playing")
        assert current_left["clue"] != current_right["clue"]
        assert current_left["clue"] not in json.dumps(current_right, ensure_ascii=False)
        assert current_right["clue"] not in json.dumps(current_left, ensure_ascii=False)
        run = current_left["run"]
        for stage_number in range(3):
            if stage_number:
                current_right = state(right, lambda s: s["stage"] == stage_number)
            expected = solution(current_left, current_right, stage_number)
            wrong = "ZZZZ" if stage_number == 1 else "9999" if stage_number == 0 else "99"
            if wrong == expected:
                wrong = "AAAA" if stage_number == 1 else "8888" if stage_number == 0 else "88"
            send(left, type="solve", stage=stage_number, run=run, answer=wrong)
            assert until(left, lambda s: s.get("type") == "error")["message"]
            current_left = state(left, lambda s: s["leftAttempts"] == 1)
            assert current_left["stage"] == stage_number
            send(left, type="solve", stage=stage_number, run=run, answer=expected)
            current_left = state(left, lambda s: s["leftApproved"])
            assert current_left["stage"] == stage_number and current_left["clue"] != current_right["clue"]
            send(left, type="solve", stage=stage_number, run=run, answer=expected)
            until(left, lambda s: s.get("type") == "error")
            if stage_number == 0:
                right.close()
                paused = state(left, lambda s: not s["rightConnected"])
                assert paused["stage"] == 0 and paused["leftApproved"]
                send(left, type="solve", stage=0, run=run, answer=expected)
                until(left, lambda s: s.get("type") == "error")
                break
            send(right, type="solve", stage=stage_number, run=run, answer=expected)
            current_left = state(left, lambda s: s["stage"] == stage_number + 1)
        with connect(socket_base + "/ws/puzzle", origin=base) as resumed:
            current_right = auth(resumed, guest)
            assert current_right["stage"] == 0
            state(left, lambda s: s["rightConnected"])
            send(resumed, type="solve", stage=0, run=run, answer=solution(current_left, current_right, 0))
            current_left = state(left, lambda s: s["stage"] == 1)
            for stage_number in (1, 2):
                current_right = state(resumed, lambda s: s["stage"] == stage_number)
                expected = solution(current_left, current_right, stage_number)
                send(left, type="solve", stage=stage_number, run=run - 1, answer=expected)
                until(left, lambda s: s.get("type") == "error")
                send(left, type="solve", stage=stage_number, run=run, answer=expected)
                state(left, lambda s: s["leftApproved"])
                send(resumed, type="solve", stage=stage_number, run=run, answer=expected)
                current_left = state(left, lambda s: s["stage"] == stage_number + 1)
            assert current_left["phase"] == "finished"
            send(left, type="ready")
            assert state(left, lambda s: s["leftApproved"])["phase"] == "finished"
            send(resumed, type="ready")
            current_left = state(left, lambda s: s["stage"] == 0 and s["run"] != run)
            assert current_left["phase"] == "playing" and not current_left["leftApproved"]
            send(resumed, type="leave")
            current_left = state(left, lambda s: s["phase"] == "waiting")
            assert current_left["stage"] == 0 and not current_left["rightConnected"]
    _, replacement = post("/api/puzzle/join", {"room": host["room"]})
    assert replacement["token"] != guest["token"]
    with connect(socket_base + "/ws/puzzle", origin=base) as newcomer:
        auth(newcomer, replacement)
        send(left, type="leave")
        try:
            while True:
                newcomer.recv(timeout=5)
        except ConnectionClosedOK as ended:
            assert ended.rcvd.code == 1000 and ended.rcvd.reason == "Room closed"
print("PASS: asymmetric clues, randomized solutions, all three locks, wrong answers, sync, stale submissions, disconnect/reconnect, replay, guest replacement, room closure")
