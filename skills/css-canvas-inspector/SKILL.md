---
name: css-canvas-inspector
description: Open CSS Canvas Inspector whenever the user wants point-and-click visual editing of a fixed-size HTML canvas — poster, cover, social card, slide, or thumbnail — for CSS edits, dual-canvas comparison, JPG/PNG/animated WebP export, X/Y placement, typography, spacing, or human-in-the-loop review. Also open it proactively after you or another skill generate a fixed-size HTML design, so the human can review and fine-tune it in the browser instead of iterating through screenshots. Do not use it for bitmap or PSD editing.
---

# CSS Canvas Inspector

Use this skill to put the human in direct control of a fixed-size HTML canvas.
The browser editor is the interaction surface; keep source files and design
judgment under the user's control.

## Install check

The installed skill directory must contain `index.html`, `blank.html`, `src/`,
`scripts/`, and `agents/`. A directory with only `SKILL.md` and `scripts/` is
incomplete.

Before the first launch, verify from any working directory:

```bash
python3 <skill-directory>/scripts/open_inspector.py \
  /absolute/path/to/sample.html --check
```

The output must include `Runtime: OK`. If runtime files are missing, tell the
user to reinstall the complete `skills/css-canvas-inspector` directory under
`~/.agents/skills/`, `~/.codex/skills/`, or `~/.claude/skills/`.

## Launch

Natural-language requests such as “打开封面设计器”, “用可视化编辑器改这张海报”,
or “打开 CSS 画布检查器” should launch this tool rather than reproduce its UI.

1. Locate the HTML source to edit and its intended canvas dimensions. If the
   user asks for the blank/default canvas, omit the source argument.
2. Use the runtime bundled with this skill; `--inspector` is only needed for a
   development checkout.
3. Launch with an absolute source path from any working directory:

```bash
python3 <skill-directory>/scripts/open_inspector.py /absolute/source.html \
  --width 1280 --height 1707 --export-width 1280
```

Open the blank inspection canvas:

```bash
python3 <skill-directory>/scripts/open_inspector.py
```

The blank canvas is for background/style inspection. Add visible content in
the source HTML when the user needs to create text or design elements.

A complete example — dual A/B variants plus animation frames, from your own
project:

```bash
python3 <skill-directory>/scripts/open_inspector.py \
  card.html \
  --name "封面工作台" \
  --width 1080 \
  --height 1440 \
  --export-width 1280 \
  --variants a,b \
  --variant-labels "A 纯文字|B 动图" \
  --frames 48 \
  --frame-param d \
  --rebuild .anim \
  --storage my-card
```

The launcher serves the project at `/` and the bundled inspector under
`/__css_canvas_inspector__/` from one origin. It opens the browser and stays
alive until interrupted. The project root defaults to the nearest `.git`,
`package.json`, `pyproject.toml`, `Cargo.toml`, or `go.mod` directory, then to
the source parent. Pass `--project <root>` when local assets extend above that
directory.

Port `8788` is preferred. The same project reuses its running server; a
different project gets the next free port, so browser storage stays isolated.
Keep the server process running while the user edits.

## Project setup

When the user wants this as a repeatable workflow, give them these three steps:

1. Install the complete skill directory in their harness.
2. Run the `--check` command above against one real project HTML file.
3. Add this rule to the project's `AGENTS.md`:

```markdown
## HTML visual review

After producing a fixed-size HTML design, open it in css-canvas-inspector:

python3 ~/.agents/skills/css-canvas-inspector/scripts/open_inspector.py \
  <absolute-html-path> --project <project-root> --width <W> --height <H>

Wait for the human's visual verdict. When they finish, ask for the downloaded
HTML, diff it against the source, and port the deltas back before exporting.
```

Adapt the skill path and harness directory to the user's setup. Do not ask the
user to copy the editor into every project.

## Proactive use

You just generated a fixed-size HTML design — a cover, poster, social card,
slide, or thumbnail. Do not describe the result or iterate through
screenshots. Open it here instead:

1. Generate the HTML at its final dimensions.
2. Launch `scripts/open_inspector.py <file> --width W --height H`.
3. Tell the user the editor is open and which controls matter for this design.
4. Wait for their visual decisions; do not guess them.

Screenshot loops cost round-trips and lose precision. The inspector gives the
human real CSS control and gives you a deterministic artifact to read back.

## Chain from other skills

Generator skills (social-card builders, cover writers, slide makers) should
hand off review to this skill instead of building their own review UI. Add
this line to your skill's instructions:

> After writing the final HTML file, offer to open it in `css-canvas-inspector`
> (visual editor on a local server) so the user can tweak layout, typography,
> and color visually before export.

## Coordinate modes

- **Relative** (`相对微调`): applies CSS `translate`; use it for precise nudges
  that must not change document flow.
- **Absolute** (`绝对坐标`): uses the canvas top-left as `0,0` and applies
  `position:absolute`; switching to it can reflow sibling elements.

The editor autosaves inline changes and text to browser storage for the current
storage namespace. Those changes are not written back to the source file.
Tell the user to use **下载当前画布** for a JPG/PNG image. JPG with width `1280`
is the default. Use **下载 HTML** when they need a portable edited document,
or continue in the source file when the change should become the new baseline.

When the design animates and the source page renders a frame from a query
parameter (`--frames N --frame-param d`, page reads `?d=0..N-1`), choose
**WebP** in the format menu, set the per-frame duration and last-frame hold,
then export: the inspector reloads once per frame and muxes an animated WebP
in the browser. The source page must not animate on a timer when a frame
parameter is present. Export follows the **active** canvas: in dual-canvas mode
pick the variant you want first, then export (the other canvas is untouched);
the multi-page `canvases` mode is rejected for animation.

When two variants are configured, **双画布** shows the first two side by side.
The active canvas has an orange outline and can be switched by clicking a canvas
or using the canvas selector.

For multi-page decks (carousel card sets, slide stacks), pass
`--canvases "section.poster"` so each source node becomes an independent page:
its own measured dimensions, page switcher, per-page export, and element list
scoped to the current page. Never open a deck as one stitched canvas — that
forces the human to crop exports by hand.

The selected element can be deleted with the 删除元素 button or the `Delete`
key; undo (Ctrl/Cmd+Z) restores it. Deleting an empty text shell removes the
element itself, not just its characters.

The canvas viewport can scroll horizontally and vertically. Use **适应**, **100%**,
the zoom range, or `Ctrl/Cmd + wheel` when the user needs a closer view.

## Limits

- The launcher is a static server. Pre-render pages that require a dev server,
  back-end routes, or authenticated API proxies.
- Local assets must stay inside the project root. Expand `--project` for shared
  assets; symlinks outside the root and dotfiles such as `.env` or `.git` are
  blocked.
- `/__css_canvas_inspector__/` is reserved. Cross-origin images or fonts can
  remain external and may prevent exact canvas export.
- Browser edits are scoped to the local origin and `storage` namespace. A
  different project may open on a different port with separate edit history.

## Handoff

After launching, state that the editor is open and where to find the controls.
Let the user make visual decisions. If they later ask for code-level changes,
apply those to the source HTML/CSS and regenerate deliverables from that source.

## Read-back

Edits autosave to browser storage under the `storage` namespace and are never
written to the source file. When the user says they are done:

1. Ask for the **下载 HTML** output (self-contained document with edits
   inlined).
2. Diff it against the source file and port the deltas into the source, which
   becomes the new baseline.
3. Export deliverables with **下载当前画布** (JPG at `exportWidth` by default;
   WebP for animation), or re-render from the updated source with headless
   Chrome.
