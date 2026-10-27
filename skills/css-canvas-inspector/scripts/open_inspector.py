#!/usr/bin/env python3
"""Serve a project and the bundled inspector from one local origin."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import functools
import hashlib
import http.server
import json
from pathlib import Path
import posixpath
import urllib.error
import urllib.parse
import urllib.request
import webbrowser


PROTOCOL_VERSION = 2
RUNTIME_PREFIX = "/__css_canvas_inspector__/"
HEALTH_PATH = RUNTIME_PREFIX + "_health"
PORT_ATTEMPTS = 10
REQUIRED_RUNTIME_FILES = (
    "index.html",
    "blank.html",
    "src/inspector.css",
    "src/inspector.js",
    "src/webp-anim.js",
    "src/vendor/html2canvas.min.js",
    "src/vendor/html2canvas.LICENSE.txt",
)


@dataclass(frozen=True)
class Layout:
    source: Path
    source_was_omitted: bool
    project: Path
    inspector: Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class InspectorHandler(NoCacheHandler):
    def __init__(
        self,
        *args,
        project_root: Path,
        inspector_root: Path,
        **kwargs,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.inspector_root = Path(inspector_root).resolve()
        super().__init__(*args, directory=str(self.project_root), **kwargs)

    def do_GET(self) -> None:
        if not self._host_allowed():
            self.send_error(403, "Invalid Host header")
            return
        if urllib.parse.urlsplit(self.path).path == HEALTH_PATH:
            self._send_health()
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if not self._host_allowed():
            self.send_error(403, "Invalid Host header")
            return
        if urllib.parse.urlsplit(self.path).path == HEALTH_PATH:
            self._send_health()
            return
        super().do_HEAD()

    def _host_allowed(self) -> bool:
        port = self.server.server_address[1]
        host = self.headers.get("Host", "")
        return host in (f"127.0.0.1:{port}", f"localhost:{port}")

    def _send_health(self) -> None:
        payload = json.dumps(
            {
                "protocol": PROTOCOL_VERSION,
                "project_id": project_id(self.project_root),
                "runtime_id": runtime_id(self.inspector_root),
            },
            separators=(",", ":"),
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _root_and_relative(self, path: str) -> tuple[Path, str]:
        url_path = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        if url_path.startswith(RUNTIME_PREFIX):
            return self.inspector_root, url_path[len(RUNTIME_PREFIX) :]
        return self.project_root, url_path.lstrip("/")

    def translate_path(self, path: str) -> str:
        root, relative = self._root_and_relative(path)
        components = posixpath.normpath(relative).split("/")
        if any(
            component.startswith(".") and component not in (".", "..")
            for component in components
        ):
            return str(root / ".__css_canvas_inspector_not_found__")
        original_directory = self.directory
        self.directory = str(root)
        try:
            candidate = Path(super().translate_path("/" + relative)).resolve()
        finally:
            self.directory = original_directory
        if not inside(candidate, root):
            return str(root / ".__css_canvas_inspector_not_found__")
        return str(candidate)

    def list_directory(self, path: str):
        self.send_error(404, "Not found")
        return None


def runtime_complete(root: Path) -> bool:
    return all((root / relative).is_file() for relative in REQUIRED_RUNTIME_FILES)


def missing_runtime_files(root: Path) -> list[str]:
    return [
        relative
        for relative in REQUIRED_RUNTIME_FILES
        if not (root / relative).is_file()
    ]


def find_inspector_dir() -> Path | None:
    skill_root = Path(__file__).resolve().parent.parent
    for candidate in (skill_root, *skill_root.parents):
        if runtime_complete(candidate):
            return candidate
    return None


def find_project_root(start: Path) -> Path:
    current = start.resolve()
    markers = (".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod")
    for candidate in (current, *current.parents):
        if any((candidate / marker).exists() for marker in markers):
            return candidate
    return current


def inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def project_id(root: Path) -> str:
    return hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:16]


def runtime_id(root: Path) -> str:
    digest = hashlib.sha256()
    for relative in REQUIRED_RUNTIME_FILES:
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update((root / relative).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def runtime_url(relative: str = "index.html") -> str:
    return RUNTIME_PREFIX + urllib.parse.quote(relative)


def project_url(path: Path, root: Path) -> str:
    relative = path.relative_to(root).as_posix()
    return "/" + urllib.parse.quote(relative)


def resolve_layout(args: argparse.Namespace, parser: argparse.ArgumentParser) -> Layout:
    inspector = (
        Path(args.inspector).expanduser().resolve()
        if args.inspector
        else find_inspector_dir()
    )
    if inspector is None:
        parser.error(
            "CSS Canvas Inspector runtime not found. Reinstall the complete "
            "skill directory (SKILL.md, index.html, blank.html, src/, scripts/), "
            "or pass --inspector pointing to a full checkout."
        )
    if not inspector.is_dir():
        parser.error(f"inspector directory not found: {inspector}")
    missing = missing_runtime_files(inspector)
    if missing:
        parser.error(
            f"inspector runtime is incomplete at {inspector}; missing: "
            f"{', '.join(missing)}. Reinstall the whole skill directory, not "
            "only SKILL.md and scripts/, or pass --inspector to a full checkout."
        )

    source_was_omitted = args.source is None
    if source_was_omitted:
        source = inspector / "blank.html"
        project = (
            Path(args.project).expanduser().resolve()
            if args.project
            else inspector
        )
    else:
        source = Path(args.source).expanduser().resolve()
        if not source.is_file():
            parser.error(f"source file not found: {source}")
        project = (
            Path(args.project).expanduser().resolve()
            if args.project
            else find_project_root(source.parent)
        )

    if not project.is_dir():
        parser.error(f"project directory not found: {project}")
    if not source_was_omitted and not inside(source, project):
        parser.error(
            f"source file is outside project: {source}. Pass --project with a "
            "directory that contains the source file."
        )
    return Layout(
        source=source,
        source_was_omitted=source_was_omitted,
        project=project,
        inspector=inspector,
    )


def create_server(
    project_root: Path, inspector_root: Path, port: int
) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(
        InspectorHandler,
        project_root=Path(project_root).resolve(),
        inspector_root=Path(inspector_root).resolve(),
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True
    return server


def probe_health(port: int) -> dict | None:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}{HEALTH_PATH}", timeout=0.6
        ) as response:
            if response.status != 200:
                return None
            payload = json.loads(response.read(4096))
            if isinstance(payload, dict):
                return payload
    except (OSError, ValueError, urllib.error.URLError):
        return None
    return None


def build_url(
    base: str,
    layout: Layout,
    args: argparse.Namespace,
) -> str:
    if layout.source_was_omitted:
        source_url = runtime_url("blank.html")
        default_name = "空白检查画布"
    else:
        source_url = project_url(layout.source, layout.project)
        default_name = "CSS Canvas Inspector"

    if layout.source_was_omitted:
        width = args.width if args.width is not None else 1280
        height = args.height if args.height is not None else 1707
    else:
        width = args.width if args.width is not None else "auto"
        height = args.height if args.height is not None else "auto"

    params = {
        "src": source_url,
        "name": default_name if args.name == "CSS Canvas Inspector" else args.name,
        "width": str(width),
        "height": str(height),
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
    return base + runtime_url() + "?" + urllib.parse.urlencode(params)


def claim_port(
    layout: Layout, preferred: int
) -> tuple[http.server.ThreadingHTTPServer | None, int]:
    expected_project = project_id(layout.project)
    expected_runtime = runtime_id(layout.inspector)
    if preferred == 0:
        server = create_server(layout.project, layout.inspector, 0)
        return server, int(server.server_address[1])

    for port in range(preferred, min(65535, preferred + PORT_ATTEMPTS) + 1):
        health = probe_health(port)
        if (
            health
            and health.get("protocol") == PROTOCOL_VERSION
            and health.get("project_id") == expected_project
            and health.get("runtime_id") == expected_runtime
        ):
            return None, port
        try:
            server = create_server(layout.project, layout.inspector, port)
        except OSError:
            continue
        return server, port
    raise OSError(
        f"ports {preferred}-{min(65535, preferred + PORT_ATTEMPTS)} are unavailable"
    )


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
        help="Inspector runtime directory; defaults to the runtime bundled with this skill",
    )
    parser.add_argument("--name", default="CSS Canvas Inspector")
    parser.add_argument(
        "--width",
        type=int,
        help="canvas width; omit to measure the source page (blank defaults to 1280)",
    )
    parser.add_argument(
        "--height",
        type=int,
        help="canvas height; omit to measure the source page (blank defaults to 1707)",
    )
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
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate the installation, project, and source paths, then exit",
    )
    args = parser.parse_args()
    for name in ("width", "height", "export_width"):
        value = getattr(args, name)
        if value is not None and value <= 0:
            parser.error(f"--{name.replace('_', '-')} must be positive")
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")

    layout = resolve_layout(args, parser)
    if args.check:
        print("Runtime: OK")
        print(f"Inspector: {layout.inspector}")
        print(f"Project: {layout.project}")
        print(
            "Source: "
            + ("blank canvas" if layout.source_was_omitted else str(layout.source))
        )
        default_width, default_height = (
            (1280, 1707)
            if layout.source_was_omitted
            else ("auto", "auto")
        )
        print(
            f"Width: {args.width if args.width is not None else default_width}"
        )
        print(
            f"Height: {args.height if args.height is not None else default_height}"
        )
        print(f"Entry: {runtime_url()}")
        return 0

    try:
        server, port = claim_port(layout, args.port)
    except OSError as error:
        parser.error(str(error))

    base = f"http://127.0.0.1:{port}"
    url = build_url(base, layout, args)
    if server is None:
        print(f"Reusing CSS Canvas Inspector: {url}")
        if not args.no_open:
            webbrowser.open(url)
        return 0

    if args.port != 0 and port != args.port:
        print(f"Port {args.port} is busy; using {port}.")
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
