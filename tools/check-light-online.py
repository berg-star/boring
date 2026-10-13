"""Two real clients: automatic ticks, turn guards, pause/resume and room lifecycle."""
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
    end = time.monotonic() + 15
    while time.monotonic() < end:
        message = json.loads(socket.recv(timeout=max(.1, end - time.monotonic())))
        if predicate(message):
            return message
    raise AssertionError("Timed out waiting for light state")

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

def reject(socket, message):
    socket.send(json.dumps(message))
    assert until(socket, lambda s: s.get("type") == "error")["message"]

assert post("/api/light/join", {"room": "OOOOOO"})[0] == 400
status, host = post("/api/light/rooms", {})
assert status == 201 and host["side"] == 0
_, guest = post("/api/light/join", {"room": host["room"]})
assert post("/api/light/join", {"room": host["room"]})[0] == 409
with connect(ws_base + "/ws/light", origin=base) as bad:
    bad.send(json.dumps({"type": "auth", "room": host["room"], "token": "0" * 32}))
    closed(bad, 1008, "Unauthorized")
with connect(ws_base + "/ws/light", origin=base) as left:
    first = auth(left, host)
    assert first["phase"] == "waiting" and len(first["trail"]) == 432 and first["trail"].count('.') == 430
    with connect(ws_base + "/ws/light", origin=base) as right:
        auth(right, guest)
        joined = state(left, lambda s: s["rightConnected"])
        reject(left, {"type": "turn", "direction": 1})
        left.send(json.dumps({"type": "ready", "run": joined["run"]}))
        state(left, lambda s: s["leftReady"])
        reject(left, {"type": "ready", "run": joined["run"]})
        right.send(json.dumps({"type": "ready", "run": joined["run"]}))
        state(left, lambda s: s["phase"] == "countdown")
        live = state(left, lambda s: s["phase"] == "running")
        # Reject malformed/stale actions; future step stays invalid even over a slow network.
        action = {"type": "turn", "run": live["run"], "epoch": live["epoch"], "step": live["step"], "seq": 1, "direction": 1}
        for field, value in [("run", 999), ("epoch", 999), ("step", 999), ("step", -1), ("seq", 0), ("seq", True), ("direction", 0), ("direction", 1.5), ("direction", "1")]:
            left.send(json.dumps({**action, field: value}))
        for _ in range(9):
            assert until(left, lambda s: s.get("type") == "error")["message"]
        # Refresh to a current running step before the accepted turn.
        live = state(left, lambda s: s["phase"] == "running")
        while True:
            try:
                message = json.loads(left.recv(timeout=.04))
                if message.get("type") == "state": live = message
            except TimeoutError:
                break
        action.update(step=live["step"])
        left.send(json.dumps(action))
        accepted = state(left, lambda s: s["ack"] == 1 and s["myTurn"] == 1)
        reject(left, action)  # Duplicate sequence cannot steer twice, even if a tick intervenes.
        turned = state(left, lambda s: s["step"] > accepted["step"])
        assert turned["directions"][0] == 1
        right.close()
        paused = state(left, lambda s: s["phase"] == "paused")
        assert paused["myTurn"] == 0
        reject(left, {**action, "seq": 2})
        time.sleep(.6)
        with connect(ws_base + "/ws/light", origin=base) as resumed:
            restored = auth(resumed, guest)
            assert restored["phase"] == "countdown" and restored["epoch"] > paused["epoch"]
            for field in ["run", "step", "heads", "directions", "trail"]:
                assert restored[field] == paused[field], field
            live = state(left, lambda s: s["phase"] == "running" and s["epoch"] == restored["epoch"])
            reject(left, {**action, "step": live["step"], "seq": 2}) # Old epoch.
            result = state(left, lambda s: s["phase"] == "finished")
            peer = state(resumed, lambda s: s["phase"] == "finished")
            for field in ["step", "trail", "heads", "winner", "reasons"]:
                assert result[field] == peer[field], field
            assert result["winner"] in [-1, 0, 1] and any(result["reasons"])
            reject(left, {"type": "turn", "direction": 1})
            left.send(json.dumps({"type": "ready", "run": result["run"]}))
            state(left, lambda s: s["leftReady"])
            resumed.send(json.dumps({"type": "ready", "run": result["run"]}))
            rematch = state(left, lambda s: s["run"] > result["run"])
            assert rematch["swapped"] and rematch["heads"] == first["heads"][::-1] and rematch["step"] == 0
            live = state(left, lambda s: s["phase"] == "running")
            reject(left, {**action, "epoch": live["epoch"], "step": 0}) # Old run.
            # Straight paths from symmetric starting positions must finish in a simultaneous wall draw.
            result = state(left, lambda s: s["phase"] == "finished")
            assert result["winner"] == -1 and result["step"] == 13 and result["reasons"] == ["wall", "wall"]
            with connect(ws_base + "/ws/light", origin=base) as takeover:
                replacement = auth(takeover, guest)
                closed(resumed, 1000, "Reconnected elsewhere")
                assert replacement["phase"] == "finished" and replacement["trail"] == result["trail"]
                takeover.send('{"type":"leave"}')
                cleared = state(left, lambda s: s["phase"] == "waiting" and not s["rightConnected"])
                assert cleared["step"] == 0 and cleared["trail"].count('.') == 430
    _, newcomer = post("/api/light/join", {"room": host["room"]})
    assert newcomer["token"] != guest["token"]
    with connect(ws_base + "/ws/light", origin=base) as replacement:
        auth(replacement, newcomer)
        left.send('{"type":"leave"}')
        closed(replacement, 1000, "Room closed")
print("PASS: authoritative automatic steps, validated turn sequences, shared results, preserved pause/resume with epoch guards, swapped rematch/draw, takeover and replacement")
