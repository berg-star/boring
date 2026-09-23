"""验证可执行文件的本地默认值、Render 环境变量和错误配置。"""
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1]
default_binary = root / ("build/Release/boring_lab.exe" if os.name == "nt" else "build/boring_lab")
binary = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else default_binary
base_env = {key: value for key, value in os.environ.items() if key.upper() not in ("HOST", "PORT")}
checks = root / ".qa"
checks.mkdir(exist_ok=True)

for label, settings, port, host in (
    ("local", {}, 18080, "127.0.0.1"),
    ("render", {"HOST": "0.0.0.0", "PORT": "18081"}, 18081, "0.0.0.0"),
):
    log_path = checks / ("startup-" + label + ".log")
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen([str(binary)], cwd=str(checks), env=dict(base_env, **settings), stdout=log, stderr=log)
        try:
            address = "http://127.0.0.1:" + str(port)
            for attempt in range(50):
                if process.poll() is not None:
                    raise AssertionError("Server exited; see " + str(log_path))
                try:
                    with urlopen(address + "/healthz", timeout=1) as response:
                        assert response.status == 200
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                raise AssertionError("Startup timed out; see " + str(log_path))
            subprocess.run([sys.executable, str(root / "tools/check-http.py"), address], check=True)
            assert "listening on " + host + ":" + str(port) in log_path.read_text(encoding="utf-8")
        finally:
            process.terminate()
            process.wait(timeout=10)

for key, value in (
    ("PORT", ""), ("PORT", "0"), ("PORT", "65536"), ("PORT", "-1"),
    ("PORT", "10000oops"), ("PORT", " 10000"), ("PORT", "999999999999999999"),
    ("HOST", ""), ("HOST", "bad-host"),
):
    result = subprocess.run([str(binary)], env=dict(base_env, **{key: value}), capture_output=True, timeout=5)
    assert result.returncode == 1, (key, value, result.returncode)
    assert (key + " must be").encode() in result.stderr, result.stderr

print("PASS: default local address, Render HOST/PORT, executable-relative resources, invalid configuration rejection.")
