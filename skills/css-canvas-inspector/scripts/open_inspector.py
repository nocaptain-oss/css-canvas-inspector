#!/usr/bin/env python3
"""Serve a project locally and open CSS Canvas Inspector."""

from __future__ import annotations

import argparse
import functools
import http.server
import os
from pathlib import Path
import urllib.parse
import urllib.request
import webbrowser


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def find_project_root(source: Path) -> Path:
    current = source if source.is_dir() else source.parent
    while True:
        if (current / "tools" / "css-canvas-inspector" / "index.html").is_file():
            return current
        if (current / ".git").exists():
            return current
        if current == current.parent:
            return source.parent
        current = current.parent


def inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def editor_is_running(port: int, entry_path: str) -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}{entry_path}", timeout=0.6
        ) as response:
            body = response.read(4096).decode("utf-8", errors="ignore")
            return response.status == 200 and "CSS Canvas Inspector" in body
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Open a fixed-size HTML file in CSS Canvas Inspector."
    )
    parser.add_argument(
        "source",
        nargs="?",
        help="HTML source file to edit; omit it to open the blank canvas",
    )
    parser.add_argument("--project", help="Project root served by the local server")
    parser.add_argument(
        "--inspector",
        help="CSS Canvas Inspector directory (defaults to <project>/tools/css-canvas-inspector)",
    )
    parser.add_argument("--name", default="CSS Canvas Inspector")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=1707)
    parser.add_argument("--export-width", type=int, default=1280)
    parser.add_argument("--dual", action="store_true")
    parser.add_argument("--variants", default="")
    parser.add_argument("--variant-labels", default="")
    parser.add_argument("--variant-param", default="variant")
    parser.add_argument("--frames", type=int, default=0)
    parser.add_argument("--frame-param", default="frame")
    parser.add_argument("--rebuild", default="")
    parser.add_argument(
        "--canvases",
        default="",
        help="CSS selector for multi-canvas mode; each matching node becomes one page",
    )
    parser.add_argument("--storage", default="")
    parser.add_argument("--port", type=int, default=8788)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()

    project = (
        Path(args.project).expanduser().resolve()
        if args.project
        else find_project_root(Path.cwd())
    )
    inspector = (
        Path(args.inspector).expanduser().resolve()
        if args.inspector
        else project / "tools" / "css-canvas-inspector"
    )
    source_was_omitted = args.source is None
    source = (
        Path(args.source).expanduser().resolve()
        if args.source
        else inspector / "blank.html"
    )
    if not source.is_file():
        parser.error(f"source file not found: {source}")

    entry = inspector / "index.html"
    if not entry.is_file():
        parser.error(
            f"inspector not found at {entry}; pass --inspector or install the package"
        )

    server_root = Path(os.path.commonpath([project, inspector])).resolve()
    if not inside(source, server_root):
        parser.error("source and inspector must share the directory served by the local server")

    def url_path(path: Path) -> str:
        relative = path.relative_to(server_root).as_posix()
        return "/" + urllib.parse.quote(relative)

    params = {
        "src": url_path(source),
        "name": (
            "空白检查画布"
            if source_was_omitted and args.name == "CSS Canvas Inspector"
            else args.name
        ),
        "width": str(args.width),
        "height": str(args.height),
        "exportWidth": str(args.export_width),
    }
    optional = {
        "variants": args.variants,
        "variantLabels": args.variant_labels,
        "variantParam": args.variant_param,
        "frames": str(args.frames) if args.frames > 0 else "",
        "frameParam": args.frame_param,
        "rebuild": args.rebuild,
        "canvases": args.canvases,
        "storage": args.storage,
        "dual": "1" if args.dual else "",
    }
    params.update({key: value for key, value in optional.items() if value})

    entry_path = url_path(entry)
    if editor_is_running(args.port, entry_path):
        url = (
            f"http://127.0.0.1:{args.port}{entry_path}?"
            + urllib.parse.urlencode(params)
        )
        print(f"CSS Canvas Inspector already running: {url}")
        if not args.no_open:
            webbrowser.open(url)
        return 0

    handler = functools.partial(NoCacheHandler, directory=str(server_root))
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        parser.error(
            f"port {args.port} is occupied by another service ({error}); "
            "close it or pass a different --port"
        )
    host, port = server.server_address

    url = (
        f"http://{host}:{port}{entry_path}?"
        + urllib.parse.urlencode(params)
    )
    print(f"CSS Canvas Inspector: {url}")
    print("Keep this process running. Press Ctrl-C to stop the local server.")
    if not args.no_open:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping CSS Canvas Inspector.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
