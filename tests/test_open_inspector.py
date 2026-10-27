from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request


REPO = Path(__file__).resolve().parents[1]
SKILL = REPO / "skills" / "css-canvas-inspector"
SCRIPT = SKILL / "scripts" / "open_inspector.py"
RUNTIME_FILES = (
    "index.html",
    "blank.html",
    "src/inspector.css",
    "src/inspector.js",
    "src/webp-anim.js",
    "src/vendor/html2canvas.min.js",
    "src/vendor/html2canvas.LICENSE.txt",
)


def load_launcher():
    spec = importlib.util.spec_from_file_location("open_inspector_test", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def fetch_code(url: str, headers: dict[str, str] | None = None) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        try:
            return error.code, error.read()
        finally:
            error.close()


class InstallationTests(unittest.TestCase):
    def test_skill_runtime_is_complete_and_matches_canonical_files(self) -> None:
        for relative in RUNTIME_FILES:
            canonical = REPO / relative
            bundled = SKILL / relative
            self.assertTrue(bundled.is_file(), f"missing bundled runtime: {relative}")
            self.assertEqual(
                canonical.read_bytes(),
                bundled.read_bytes(),
                f"skill runtime drifted from canonical file: {relative}",
            )

    def test_check_mode_opens_external_project_from_skill_only_install(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            installed = root / ".agents" / "skills" / "css-canvas-inspector"
            shutil.copytree(SKILL, installed)
            project = root / "project"
            source = project / "designs" / "poster.html"
            source.parent.mkdir(parents=True)
            source.write_text("<!doctype html><h1>Poster</h1>", encoding="utf-8")
            cwd = root / "elsewhere"
            cwd.mkdir()

            result = subprocess.run(
                [
                    sys.executable,
                    str(installed / "scripts" / "open_inspector.py"),
                    str(source),
                    "--project",
                    str(project),
                    "--check",
                ],
                cwd=cwd,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Runtime: OK", result.stdout)
            self.assertIn(str(source.resolve()), result.stdout)

    def test_explicit_project_must_contain_source(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            project = root / "project"
            project.mkdir()
            source = root / "outside.html"
            source.write_text("<!doctype html>", encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    str(source),
                    "--project",
                    str(project),
                    "--check",
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("outside project", result.stderr)

    def test_source_dimensions_default_to_auto(self) -> None:
        source = REPO / "tests" / "fixtures" / "auto-size.html"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(source), "--check"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Width: auto", result.stdout)
        self.assertIn("Height: auto", result.stdout)

    def test_explicit_dimensions_override_auto(self) -> None:
        source = REPO / "tests" / "fixtures" / "auto-size.html"
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                str(source),
                "--width",
                "1080",
                "--height",
                "2000",
                "--check",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Width: 1080", result.stdout)
        self.assertIn("Height: 2000", result.stdout)

    def test_home_directory_marker_does_not_become_project_root(self) -> None:
        launcher = load_launcher()
        with tempfile.TemporaryDirectory() as raw:
            home = Path(raw) / "home"
            source_dir = home / "Downloads"
            source_dir.mkdir(parents=True)
            (home / "package.json").write_text("{}", encoding="utf-8")
            self.assertEqual(
                launcher.find_project_root(source_dir, boundary=home),
                source_dir.resolve(),
            )


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.launcher = load_launcher()

    def test_runtime_and_project_share_origin_without_exposing_neighbors(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            project = root / "project"
            (project / "assets").mkdir(parents=True)
            (project / "poster.html").write_text(
                '<!doctype html><link rel="stylesheet" href="/assets/poster.css">',
                encoding="utf-8",
            )
            (project / "assets" / "poster.css").write_text(
                "body{margin:0}", encoding="utf-8"
            )
            (project / ".env").write_text("SECRET=not-served", encoding="utf-8")
            secret = root / "secret.txt"
            secret.write_text("not served", encoding="utf-8")
            os.symlink(secret, project / "leak.txt")

            server = self.launcher.create_server(project, SKILL, 0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_address[1]}"
            try:
                health_status, health_body = fetch_code(
                    base + self.launcher.HEALTH_PATH
                )
                self.assertEqual(health_status, 200)
                health = json.loads(health_body)
                self.assertEqual(
                    health["protocol"], self.launcher.PROTOCOL_VERSION
                )
                self.assertEqual(
                    health["project_id"],
                    self.launcher.project_id(project),
                )

                self.assertEqual(
                    fetch_code(
                        base + self.launcher.RUNTIME_PREFIX + "index.html"
                    )[0],
                    200,
                )
                self.assertEqual(
                    fetch_code(
                        base + self.launcher.RUNTIME_PREFIX + "src/inspector.js"
                    )[0],
                    200,
                )
                self.assertEqual(fetch_code(base + "/poster.html")[0], 200)
                self.assertEqual(
                    fetch_code(base + "/assets/poster.css")[0], 200
                )
                self.assertEqual(fetch_code(base + "/leak.txt")[0], 404)
                self.assertEqual(fetch_code(base + "/.env")[0], 404)
                self.assertEqual(
                    fetch_code(base + "/poster.html", {"Host": "evil.example"})[0],
                    403,
                )
                self.assertEqual(fetch_code(base + "/assets/")[0], 404)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
