import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(repo, "skills", "css-canvas-inspector");
const required = [
  "SKILL.md",
  "LICENSE",
  "index.html",
  "blank.html",
  "agents/openai.yaml",
  "scripts/open_inspector.py",
  "src/inspector.css",
  "src/inspector.js",
  "src/canvas-size.js",
  "src/webp-anim.js",
  "src/vendor/html2canvas.min.js",
  "src/vendor/html2canvas.LICENSE.txt",
];

const missing = required.filter((relative) => !existsSync(join(skill, relative)));
if (missing.length) {
  console.error(`Skill runtime is incomplete: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Skill runtime is complete.");
