"""Real two-client rules check: nine boxes, continuation, stale packets and room lifecycle."""
import json
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from websockets.sync.client import connect
from websockets.exceptions import ConnectionClosed

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18080").rstrip("/")
ws_base = base.replace("https://", "wss://").replace("http://", "ws://")


def post(path, data):
    try:
        with urlopen(Request(base + path, json.dumps(data).encode(), {"Content-Type": "application/json"}, method="POST"), timeout=15) as response:
            assert response.headers.get("Cache-Control") == "no-store"
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


def until(socket, predicate):
    end = time.monotonic() + 10
    while time.monotonic() < end:
        message = json.loads(socket.recv(timeout=max(.1, end - time.monotonic())))
        if predicate(message):
            return message
    raise AssertionError("Timed out waiting for land state")


def state(socket, predicate=lambda s: True):
    return until(socket, lambda s: s.get("type") == "state" and predicate(s))


def auth(socket, credentials):
    socket.send(json.dumps({"type": "auth", "room": credentials["room"], "token": credentials["token"]}))
    return state(socket)


def closed(socket, code, reason):
    try:
        while True:
            socket.recv(timeout=5)
    except ConnectionClosed as error:
        assert error.rcvd.code == code and error.rcvd.reason == reason


assert post("/api/land/join", {"room": "OOOOOO"})[0] == 400
status, host = post("/api/land/rooms", {})
assert status == 201 and host["side"] == 0 and len(host["token"]) == 32
_, guest = post("/api/land/join", {"room": host["room"]})
assert post("/api/land/join", {"room": host["room"]})[0] == 409
with connect(ws_base + "/ws/land", origin=base) as bad:
    auth_message = {"type": "auth", "room": host["room"], "token": "0" * 32}
    bad.send(json.dumps(auth_message))
    closed(bad, 1008, "Unauthorized")
with connect(ws_base + "/ws/land", origin=base) as left:
    first = auth(left, host)
    assert first["phase"] == "waiting" and first["edges"] == [-1] * 24 and first["boxes"] == [-1] * 9
    with connect(ws_base + "/ws/land", origin=base) as right:
        joined = auth(right, guest)
        states = [state(left, lambda s: s["rightConnected"]), joined]
        sockets = [left, right]

        def act(side, kind, **extra):
            before = states[side]
            sockets[side].send(json.dumps({"type": kind, "run": before["run"], "ply": before["ply"], **extra}))
            for i in range(2):
                states[i] = state(sockets[i], lambda s: s["ply"] != before["ply"] or s["run"] != before["run"]
                                  or s["phase"] != before["phase"] or s["leftReady"] != before["leftReady"]
                                  or s["rightReady"] != before["rightReady"])
            for field in ("edges", "boxes", "turn", "scores", "ply", "run", "winner"):
                assert states[0][field] == states[1][field], field
            return states[0]

        def reject(side, kind, **extra):
            before = states[side]
            sockets[side].send(json.dumps({"type": kind, "run": before["run"], "ply": before["ply"], **extra}))
            assert until(sockets[side], lambda s: s.get("type") == "error")["message"]

        reject(0, "move", edge=0)
        act(0, "ready")
        assert states[0]["phase"] == "waiting" and states[1]["leftReady"]
        reject(0, "ready")
        act(1, "ready")
        assert states[0]["phase"] == "playing" and states[0]["turn"] == 0
        for invalid in (-1, 24, 1.5, "2", None, True):
            reject(0, "move", edge=invalid)
        reject(0, "move", edge=0, run=999)
        reject(0, "move", edge=0, ply=None)
        reject(1, "move", edge=0)
        reject(0, "ready")
        act(0, "move", edge=0)
        assert states[0]["turn"] == 1 and states[0]["scores"] == [0, 0]
        reject(0, "move", edge=1)
        reject(1, "move", edge=0)
        reject(1, "move", edge=1, ply=0)
        for edge in (1, 3, 4, 12, 14):
            act(states[0]["turn"], "move", edge=edge)
            assert states[0]["scores"] == [0, 0]
        double = act(0, "move", edge=13)
        assert double["boxes"][:2] == [0, 0] and double["scores"] == [2, 0] and double["turn"] == 0
        for edge in (2, 5, 15):
            act(states[0]["turn"], "move", edge=edge)
        assert states[0]["boxes"][:3] == [0, 0, 0] and states[0]["scores"] == [3, 0] and states[0]["turn"] == 0
        preserved = states[0].copy()
        right.close()
        states[0] = state(left, lambda s: not s["rightConnected"])
        reject(0, "move", edge=6)
        with connect(ws_base + "/ws/land", origin=base) as resumed:
            sockets[1] = resumed
            states[1] = auth(resumed, guest)
            states[0] = state(left, lambda s: s["rightConnected"])
            for field in ("edges", "boxes", "scores", "turn", "run", "ply"):
                assert states[1][field] == preserved[field], field
            with connect(ws_base + "/ws/land", origin=base) as replacement_socket:
                sockets[1] = replacement_socket
                states[1] = auth(replacement_socket, guest)
                closed(resumed, 1000, "Reconnected elsewhere")
                states[0] = state(left, lambda s: s["rightConnected"])
                for edge in range(24):
                    if states[0]["edges"][edge] >= 0:
                        continue
                    previous = states[0]
                    side = previous["turn"]
                    updated = act(side, "move", edge=edge)
                    gain = sum(updated["scores"]) - sum(previous["scores"])
                    assert gain in (0, 1, 2)
                    assert updated["edges"][edge] == side
                    assert updated["turn"] == (side if gain else 1 - side)
                assert states[0]["phase"] == "finished" and states[0]["ply"] == 24
                assert sum(states[0]["scores"]) == 9 and min(states[0]["boxes"]) >= 0
                assert states[0]["scores"][states[0]["winner"]] >= 5
                for side in (0, 1):
                    assert states[0]["boxes"].count(side) == states[0]["scores"][side]
                old_run = states[0]["run"]
                reject(0, "move", edge=0)
                act(0, "ready")
                assert states[0]["phase"] == "finished"
                act(1, "ready")
                assert states[0]["phase"] == "playing" and states[0]["run"] > old_run
                assert states[0]["first"] == states[0]["turn"] == 1
                assert states[0]["edges"] == [-1] * 24 and states[0]["scores"] == [0, 0]
                reject(1, "move", edge=0, run=old_run)
                reject(0, "move", edge=0)
                act(1, "move", edge=0)
                replacement_socket.send('{"type":"leave"}')
                states[0] = state(left, lambda s: s["phase"] == "waiting" and not s["rightConnected"])
                assert states[0]["edges"] == [-1] * 24 and states[0]["first"] == 0
    _, replacement = post("/api/land/join", {"room": host["room"]})
    assert replacement["token"] != guest["token"]
    with connect(ws_base + "/ws/land", origin=base) as newcomer:
        auth(newcomer, replacement)
        left.send('{"type":"leave"}')
        closed(newcomer, 1000, "Room closed")
print("PASS: nine-box authoritative rules, double capture, extra turns, stale/invalid moves, victory, swapped opener, reconnect/takeover and guest replacement")