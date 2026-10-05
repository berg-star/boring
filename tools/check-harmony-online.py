"""Two-client integration check for three-round compatibility ranking."""
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
        message = json.loads(socket.recv(timeout=max(.1, end - time.monotonic())))
        if predicate(message):
            return message
    raise AssertionError("Timed out waiting for harmony state")


def state(socket, predicate=lambda s: True):
    return until(socket, lambda s: s.get("type") == "state" and predicate(s))


def send(socket, **data):
    socket.send(json.dumps(data))


def auth(socket, credentials):
    send(socket, type="auth", room=credentials["room"], token=credentials["token"])
    return state(socket)


status, host = post("/api/harmony/rooms", {})
assert status == 201 and host["side"] == 0
_, guest = post("/api/harmony/join", {"room": host["room"]})
assert guest["side"] == 1
with connect(ws_base + "/ws/harmony", origin=base) as left:
    initial = auth(left, host)
    assert initial["phase"] == "ranking" and initial["round"] == 0 and not initial["rightConnected"]
    with connect(ws_base + "/ws/harmony", origin=base) as right:
        joined = auth(right, guest)
        states = [state(left, lambda s: s["rightConnected"]), joined]
        sockets = [left, right]
        assert states[0]["title"] == states[1]["title"] and states[0]["options"] == states[1]["options"]
        assert len(states[0]["options"]) == 5 and states[0]["myOrder"] != states[1]["myOrder"]
        assert sorted(states[0]["myOrder"]) == list(range(5))
        assert "rightOrder" not in states[0] and "leftOrder" not in states[1]

        def act(side, kind, **extra):
            previous = states[side]
            send(sockets[side], type=kind, run=previous["run"], round=previous["round"], **extra)
            for index in range(2):
                states[index] = state(sockets[index], lambda s: s["phase"] != previous["phase"]
                                       or s["round"] != previous["round"] or s["run"] != previous["run"]
                                       or s["leftSubmitted"] != previous["leftSubmitted"]
                                       or s["rightSubmitted"] != previous["rightSubmitted"]
                                       or s["leftReady"] != previous["leftReady"]
                                       or s["rightReady"] != previous["rightReady"])
            return states

        def rejected(side, kind, **extra):
            previous = states[side]
            send(sockets[side], type=kind, run=previous["run"], round=previous["round"], **extra)
            assert until(sockets[side], lambda s: s.get("type") == "error")

        rejected(0, "submit", order=[0, 1, 2, 3, 3])
        rejected(0, "submit", order=[0, 1, 2, 3])
        rejected(0, "submit", order=[0, 1, 2, 3, 9])
        rejected(0, "submit", order=[0, 1, 2, 3, 4.5])
        rejected(0, "next")
        act(0, "submit", order=[0, 1, 2, 3, 4])
        assert states[0]["leftSubmitted"] and not states[1]["rightSubmitted"]
        assert "leftOrder" not in states[1] and "rightOrder" not in states[0]
        assert states[0]["myOrder"] == [0, 1, 2, 3, 4]
        rejected(0, "submit", order=[4, 3, 2, 1, 0])
        # A submitted order survives a temporary disconnect without revealing it early.
        right.close()
        states[0] = state(left, lambda s: not s["rightConnected"])
        with connect(ws_base + "/ws/harmony", origin=base) as resumed:
            sockets[1] = resumed
            states[1] = auth(resumed, guest)
            states[0] = state(left, lambda s: s["rightConnected"])
            assert "leftOrder" not in states[1] and states[0]["leftSubmitted"]
            act(1, "submit", order=[0, 1, 2, 3, 4])
            assert states[0]["phase"] == states[1]["phase"] == "reveal"
            assert states[0]["roundScores"] == [10, -1, -1] and states[0]["total"] == 10
            assert states[1]["leftOrder"] == states[1]["rightOrder"] == [0, 1, 2, 3, 4]
            first_title = states[0]["title"]
            act(1, "next")
            assert states[0]["rightReady"] and states[0]["phase"] == "reveal"
            act(0, "next")
            assert states[0]["round"] == states[1]["round"] == 1
            assert states[0]["title"] != first_title
            assert "leftOrder" not in states[0] and states[0]["roundScores"] == [10, -1, -1]
            send(left, type="submit", order=[0, 1, 2, 3, 4], run=states[0]["run"], round=0)
            assert until(left, lambda s: s.get("type") == "error")
            act(0, "submit", order=[0, 1, 2, 3, 4])
            act(1, "submit", order=[0, 2, 1, 3, 4])
            assert states[0]["roundScores"] == [10, 9, -1] and states[0]["total"] == 19
            second_title = states[0]["title"]
            act(0, "next")
            act(1, "next")
            assert states[0]["round"] == 2 and states[0]["title"] not in (first_title, second_title)
            act(0, "submit", order=[0, 1, 2, 3, 4])
            act(1, "submit", order=[4, 3, 2, 1, 0])
            assert states[0]["phase"] == "finished" and states[1]["phase"] == "finished"
            assert states[0]["roundScores"] == [10, 9, 0] and states[1]["total"] == 19
            rejected(0, "submit", order=[0, 1, 2, 3, 4])
            act(0, "ready")
            assert states[1]["leftReady"] and states[1]["phase"] == "finished"
            act(1, "ready")
            assert states[0]["run"] != initial["run"] and states[0]["round"] == 0
            assert states[0]["total"] == 0 and states[0]["roundScores"] == [-1, -1, -1]
            send(resumed, type="leave")
            states[0] = state(left, lambda s: not s["rightConnected"] and s["run"] > initial["run"])
            assert states[0]["round"] == 0 and states[0]["total"] == 0
    _, replacement = post("/api/harmony/join", {"room": host["room"]})
    assert replacement["token"] != guest["token"]
    with connect(ws_base + "/ws/harmony", origin=base) as newcomer:
        auth(newcomer, replacement)
        send(left, type="leave")
        try:
            while True:
                newcomer.recv(timeout=5)
        except ConnectionClosedOK as closed:
            assert closed.rcvd.code == 1000 and closed.rcvd.reason == "Room closed"
print("PASS: private rankings, validation, 10/9/0 pair scores, unique prompts, three rounds, reconnect, rematch and replacement")
