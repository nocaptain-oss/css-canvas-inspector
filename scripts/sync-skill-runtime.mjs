import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(repo, "skills", "css-canvas-inspector");
const files = [
  "index.html",
  "blank.html",
  "src/inspector.css",
  "src/inspector.js",
  "src/canvas-size.js",
  "src/webp-anim.js",
  "src/vendor/html2canvas.min.js",
  "src/vendor/html2canvas.LICENSE.txt",
];
const check = process.argv.includes("--check");
const drift = [];

for (const relative of files) {
  const source = join(repo, relative);
  const target = join(skill, relative);
  if (!existsSync(source)) {
    console.error(`Missing canonical runtime file: ${relative}`);
    process.exit(1);
  }
  if (check) {
    if (!existsSync(target) || !readFileSync(source).equals(readFileSync(target))) {
      drift.push(relative);
    }
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

if (check && drift.length) {
  console.error(`Bundled skill runtime is stale: ${drift.join(", ")}`);
  console.error("Run npm run sync:skill and commit the result.");
  process.exit(1);
}

console.log(check ? "Skill runtime is in sync." : "Skill runtime updated.");
