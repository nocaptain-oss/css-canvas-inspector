# Integrating CSS Canvas Inspector

English · [简体中文](INTEGRATION.zh.md)

This guide is for teams and agent authors who want CSS Canvas Inspector to be
the standard human–agent co-creation surface for fixed-size designs: covers,
posters, social cards, slides, and thumbnails.

The core pattern is the **co-creation loop**:

1. The agent generates a fixed-size HTML canvas.
2. The agent opens it in the inspector (same-origin local server).
3. The human reviews and tweaks visually; edits autosave in the browser.
4. The human says they are done; the agent reads the result back.
5. Deltas are applied to the source file, which becomes the new baseline.
6. Deliverables (JPG/PNG) are exported from the agreed state.

Agents write HTML well; humans judge visuals well. The inspector is the
contract between the two.

## Level 1: use it as a human

Any fixed-size HTML file works — no build step, no framework, no dependency.

```bash
# get the self-contained skill
git clone https://github.com/nocaptain-oss/css-canvas-inspector /path/to/inspector
mkdir -p ~/.agents/skills/css-canvas-inspector
cp -R /path/to/inspector/skills/css-canvas-inspector/. \
  ~/.agents/skills/css-canvas-inspector/

# verify the install from anywhere
python3 ~/.agents/skills/css-canvas-inspector/scripts/open_inspector.py \
  /absolute/path/to/poster.html --check

# open it
python3 ~/.agents/skills/css-canvas-inspector/scripts/open_inspector.py \
  /absolute/path/to/poster.html \
  --width 1080 --height 1440 --export-width 1280
```

`--check` must print `Runtime: OK`; if it reports missing `index.html` or
`src/`, the skill directory was copied incompletely.

The launcher serves your project at `/` and the bundled inspector under
`/__css_canvas_inspector__/` from one origin. The project can live anywhere.
It reuses the same port for the same project so browser edits survive, and
moves to the next port when another project already owns `8788`.

Useful flags: `--project <root>` when local assets extend above the source
directory, `--storage <namespace>` (per-project edit memory), `--variants a,b`
(A/B canvases), `--dual` (side-by-side), `--no-open`, `--port`.

## Level 2: reference it from your design skill

Install the complete bundled skill directory — it already contains
`index.html`, `blank.html`, `src/`, `scripts/`, and `agents/`. Copy
`skills/css-canvas-inspector` to:

| Harness | Location |
|---|---|
| Claude Code | `~/.claude/skills/css-canvas-inspector` |
| Codex CLI | `~/.codex/skills/css-canvas-inspector` |
| Multi-harness setups | `~/.agents/skills/css-canvas-inspector` |

Then add one handoff line to your generator skill's `SKILL.md`:

> After writing the final HTML file, offer to open it in `css-canvas-inspector`
> (visual editor on a local server) so the user can tweak layout, typography,
> and color visually before export. Run
> `python3 <css-canvas-inspector-skill>/scripts/open_inspector.py <file> --width W --height H`.

Your skill keeps doing the creative work; the inspector becomes its review UI.
No custom review screen to build, no screenshot ping-pong, and the human's
edits are real CSS values instead of vibes.

For a project using Codex, put this concrete rule in the project's `AGENTS.md`:

```markdown
## HTML visual review

After producing a fixed-size HTML design, open it in the installed skill:

python3 ~/.agents/skills/css-canvas-inspector/scripts/open_inspector.py \
  <absolute-html-path> --project <project-root> --width <W> --height <H>

Wait for the human's visual verdict. When they finish, ask for the downloaded
HTML, diff it against the source, and port the deltas back before exporting.
```

Verify the one-time setup before relying on the workflow:

```bash
python3 ~/.agents/skills/css-canvas-inspector/scripts/open_inspector.py \
  /absolute/path/to/sample.html --project /path/to/project --check
```

## Level 3: make it the standard interface for sub-agents

Add this rule to your agent instructions (`AGENTS.md`, system prompt, or
sub-agent brief):

> Whenever you produce a fixed-size HTML design (cover, poster, card, slide,
> thumbnail), do not describe it or iterate on it through screenshots. Open it
> in css-canvas-inspector and let the human adjust it. Wait for their verdict
> before touching the source again.

Why this beats screenshot loops:

- The human edits real CSS properties directly, not instructions about them.
- Edits are precise (px values) and autosaved per `storage` namespace.
- The agent reads back a deterministic artifact (the exported HTML), not a
  guess about what the human wanted.

## The read-back contract

Human edits live in browser storage and are never written to your source file.
When the human says they are done:

1. Ask them to click **下载 HTML** — a portable, self-contained document with
   the edits inlined.
2. Read that file, diff it against your source, and port the deltas into the
   source file. The source is now the new baseline.
3. For image deliverables, either use **下载当前画布** (JPG by default, at the
   configured `exportWidth`) or re-render from the updated source:

```bash
chrome --headless=new --screenshot=cover.png --window-size=1080,1440 cover.html
```

Convention for multi-variant work: one storage namespace per project
(`--storage my-campaign`), variants via `--variants a,b` with
`--variant-labels "A 文字|B 日历"`.

## Worked example: social-card pipeline

```bash
# 1. your card skill writes card.html at 1080x1440
# 2. open it for human review, dual A/B
python3 <skill>/scripts/open_inspector.py card.html \
  --width 1080 --height 1440 --export-width 1280 \
  --storage my-card --variants a,b \
  --variant-labels "A 文字|B 日历" --dual
# 3. human tweaks typography and spacing, clicks 下载 HTML
# 4. agent diffs card.html against the download, ports the deltas
# 5. agent exports the JPG (1280 wide) from the agreed state
```

## Project requirements and troubleshooting

- The source must be a local HTML file. The launcher is a static server and
  does not run Vite/Next, proxy application APIs, or evaluate server templates.
- Local CSS, JS, fonts, and images should live under the project root. Use
  `--project` to include shared assets above the source file.
- Root-relative URLs such as `/assets/hero.png` work because the project is
  served at `/`. The prefix `/__css_canvas_inspector__/` is reserved.
- Symlinks and `../` paths that escape the project root are blocked. Copy the
  asset into the project instead.
- Dotfiles such as `.env` and `.git` are not served. Unexpected Host headers
  are rejected to reduce local DNS-rebinding risk.
- `Runtime: OK` is the install health check. Missing `index.html`, `src/`, or
  `blank.html` means the whole skill directory was not copied.
- If `8788` belongs to another project, the launcher chooses the next free
  port. Browser edits are stored per origin, so the port is part of the storage
  identity.
- Cross-origin images/fonts may remain external and can prevent canvas
  capture. Keep critical assets local when exact export matters.

## Contracts reference

- URL parameters and defaults: `README.md` → *Configure*
- Source page requirements: `README.md` → *Integrate with a source page*
- Export formats: JPG (default) / PNG / animated WebP (needs `--frames` and a `--frame-param`) at `exportWidth`; HTML with edits inlined
- Coordinate modes: relative `translate` nudges vs absolute `0,0` from the
  canvas corner
- Not for: bitmap/PSD editing, routed/back-end multi-page apps, or
  drag-and-drop page building
