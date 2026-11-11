"""
Delon desktop launcher (used to build Delon.exe with PyInstaller).

* Starts the Flask backend on 127.0.0.1 (or on the LAN with --lan, so the
  Android app on the same Wi-Fi can connect to this PC).
* Opens the reader UI in a native window (pywebview / Edge WebView2),
  falling back to the default web browser.
* Keeps user data (database, feeds, keywords, reports) in a writable folder:
  %APPDATA%\\Delon on Windows, ~/.delon elsewhere, or DELON_DATA_DIR.
* Put a `secret.env` next to Delon.exe (or in the data folder) for API keys.
"""

import argparse
import os
import shutil
import socket
import sys
import threading
import time
import webbrowser


def resource_dir():
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def exe_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def data_dir():
    if os.environ.get("DELON_DATA_DIR"):
        path = os.environ["DELON_DATA_DIR"]
    elif os.name == "nt":
        path = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "Delon")
    else:
        path = os.path.join(os.path.expanduser("~"), ".delon")
    os.makedirs(path, exist_ok=True)
    return path


def prepare_data(path):
    """Copy default JSON config (feeds, keywords, places…) on first run."""
    src = os.path.join(resource_dir(), "json")
    dst = os.path.join(path, "json")
    os.makedirs(dst, exist_ok=True)
    if os.path.isdir(src):
        for name in os.listdir(src):
            target = os.path.join(dst, name)
            if not os.path.exists(target):
                shutil.copy2(os.path.join(src, name), target)
    for candidate in (os.path.join(exe_dir(), "secret.env"), os.path.join(path, "secret.env")):
        if os.path.exists(candidate):
            try:
                from dotenv import load_dotenv
                load_dotenv(candidate)
            except Exception:
                pass
            break


def free_port(preferred=5000):
    for port in [preferred] + list(range(5001, 5100)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return 0


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def wait_for(url, timeout=60):
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(0.3)
    return False


class JsApi:
    """Functions callable from the UI as window.pywebview.api.*"""

    def open_external(self, url):
        webbrowser.open(url)
        return True


def main():
    ap = argparse.ArgumentParser(description="Delon news reader")
    ap.add_argument("--lan", action="store_true",
                    help="listen on the local network so the Android app can connect")
    ap.add_argument("--port", type=int, default=5000)
    ap.add_argument("--browser", action="store_true", help="open in the web browser instead of a window")
    ap.add_argument("--headless", action="store_true", help="only run the server")
    args = ap.parse_args()

    path = data_dir()
    prepare_data(path)
    os.chdir(path)

    # Windowed .exe has no console: send output to a log file.
    if sys.stdout is None or sys.stderr is None or getattr(sys, "frozen", False):
        log = open(os.path.join(path, "delon.log"), "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log

    os.environ.setdefault("DELON_BUILD_DIR", os.path.join(resource_dir(), "build"))
    os.environ.setdefault("DELON_DB", os.path.join(path, "news_articles.db"))

    sys.path.insert(0, resource_dir())
    import main as backend  # noqa: E402  (import after env/cwd are set)
    from werkzeug.serving import make_server

    port = free_port(args.port)
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    server = make_server(host, port, backend.app, threaded=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    url = f"http://127.0.0.1:{port}/"
    wait_for(url + "available-categories")
    title = "Delon"
    if args.lan:
        title += f"  —  Android server: http://{lan_ip()}:{port}"
    print(f"Delon running at {url} (data: {path})")

    if args.headless:
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return

    if not args.browser:
        try:
            import webview
            webview.create_window(title, url, width=1280, height=820, min_size=(820, 560),
                                  js_api=JsApi())
            webview.start()
            server.shutdown()
            return
        except Exception as e:  # pywebview / WebView2 missing → use the browser
            print(f"Native window unavailable ({e}); opening the browser instead.")

    webbrowser.open(url)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
