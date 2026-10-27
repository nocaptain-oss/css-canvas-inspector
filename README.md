# CSS Canvas Inspector

A lightweight visual CSS editor for fixed-size HTML canvases. It is designed
for human-agent design collaboration: a person selects elements and adjusts
layout values on the left, while an agent can keep editing the underlying HTML
and CSS.

No build step or framework is required. The Python launcher uses only the
standard library. It serves the inspector runtime and your project from one
local origin, so the source can live in any project directory.

## Adopt it

Three ways to make this the review surface for your design work — see
[INTEGRATION.md](INTEGRATION.md):

- **Human quickstart** — open any fixed-size HTML file in the editor:
  [Level 1](INTEGRATION.md#level-1-use-it-as-a-human)
- **Design skills** — your generator skill hands off review to this tool:
  [Level 2](INTEGRATION.md#level-2-reference-it-from-your-design-skill)
- **Sub-agents** — make it the standard co-creation interface instead of
  screenshot loops: [Level 3](INTEGRATION.md#level-3-make-it-the-standard-interface-for-sub-agents)

## Repository layout

| Path | Needed to run installed skill? | Audience |
|---|---:|---|
| `skills/css-canvas-inspector/` | Yes | End users copy this complete directory |
| `README.md`, `INTEGRATION.md`, `INTEGRATION.zh.md` | No | GitHub/NPM onboarding and workflow guides |
| `LICENSE` | Yes — copied into the bundled skill | Everyone redistributing or using the code |
| root `index.html`, `blank.html`, `src/` | No for skill-only use | Canonical development runtime, synced into the skill |
| `tests/`, `scripts/` | No | Maintainers and CI |
| `AGENTS.md` | No | Agents maintaining this repository |
| `package.json`, `demo.html` | No | NPM publishing and local demonstration |

The root runtime is the development source of truth. `npm run sync:skill`
copies it into the self-contained skill directory; `npm run check` fails if the
copies drift. Human guides stay at the repository root rather than being
duplicated inside every installed skill.

## Install the skill

The skill directory is self-contained. Install the whole directory, including
`index.html`, `blank.html`, `src/`, `scripts/`, and `agents/`:

```bash
git clone --depth 1 https://github.com/nocaptain-oss/css-canvas-inspector /tmp/css-canvas-inspector
mkdir -p ~/.agents/skills/css-canvas-inspector
cp -R /tmp/css-canvas-inspector/skills/css-canvas-inspector/. \
  ~/.agents/skills/css-canvas-inspector/

python3 ~/.agents/skills/css-canvas-inspector/scripts/open_inspector.py \
  /absolute/path/to/poster.html --check
```

Use `~/.codex/skills/` for Codex or `~/.claude/skills/` for Claude Code. The
check must print `Runtime: OK`. Copying only `SKILL.md` and `scripts/` is an
incomplete installation.

## Features

- Click any element on the canvas to select it.
- Adjust width, height, font size, weight, line height, tracking, color,
  alignment, margins, and padding.
- Move elements with relative X/Y offsets.
- Switch to absolute page coordinates using the canvas origin as `0,0`.
- Enter any additional CSS property.
- Edit direct text nodes inside mixed inline content.
- Undo and redo edits, or nudge with arrow keys.
- Duplicate the selected element into the same parent; copies persist in the
  current storage namespace, participate in undo, and appear in downloaded HTML.
- Delete the selected element (button or `Delete` key; undo restores it).
- Multi-canvas mode: pass `canvases=<selector>` so each matching node in the
  source page (for example `section.poster`) becomes an independent page with
  its own export — no sheet background, no letterboxing, no manual cropping.
  The page fills the viewport exactly (source `body` padding is neutralized
  and overflow hidden while browsing), so there are no inner scrollbars and
  no drifting; the downloaded HTML restores the original layout. The
  active-canvas red outline appears only in dual-canvas mode.
- Persist edits on a stable local origin.
- Compare the first two variants side by side in dual-canvas mode.
- Zoom from `5%` to `300%`, jump to fit/actual size, and scroll both axes.
- Download the active canvas as JPG (default), PNG, or animated WebP at a
  configurable width. Animated WebP walks the configured frames, then muxes
  them in-browser (Chrome cannot encode animation natively).
- Download an HTML copy with editor changes inlined.
- Optionally switch among content variants and animation frames.

## Run from a checkout

For development, run the launcher directly; it resolves the checkout runtime
automatically:

```bash
python3 skills/css-canvas-inspector/scripts/open_inspector.py demo.html \
  --export-width 1280
```

The blank starter is an inspection canvas, not a drag-and-drop page builder.
Its content should come from the source HTML. It defaults to `1280 × 1707`
with a `1280px` export width.

## Use from a Codex session

The package includes the model-invocable skill in
`skills/css-canvas-inspector`. After installing the complete directory, the
agent can open any HTML file on disk:

Users can invoke it naturally:

```text
打开封面设计器，我要自己调字号和位置
用可视化编辑器改这张海报
打开 CSS 画布检查器
```

They can also invoke it explicitly:

```text
$css-canvas-inspector 打开 cover-edit.html
```

The skill launches its bundled runtime, serves the source project at `/` and
the inspector under `/__css_canvas_inspector__/`, then opens the browser. The
default project root is the nearest `.git`, `package.json`, `pyproject.toml`,
`Cargo.toml`, or `go.mod` directory; otherwise it is the source file's parent.
Pass `--project` when HTML assets extend above that directory.

The model should not reproduce the editor with a screenshot or describe CSS
changes. See [INTEGRATION.md](INTEGRATION.md) for the project handoff pattern.

## Configure

The inspector is configured through URL parameters:

| Parameter | Required | Example | Description |
|---|---:|---|---|
| `src` | yes | `/poster.html` | Same-origin page path; the launcher fills this automatically |
| `name` | no | `Poster Inspector` | Toolbar title |
| `width` | no | `1080` or `auto` | Canvas width; omitted for a source means auto-detect |
| `height` | no | `1440` or `auto` | Canvas height; omitted for a source means auto-detect |
| `exportWidth` | no | `1280` | Image export width in pixels |
| `dual` | no | `1` | Start in dual-canvas mode when two variants exist |
| `variants` | no | `a,b` | Values for the variant parameter |
| `variantLabels` | no | `A 文字|B 图片` | User-facing variant labels |
| `variantParam` | no | `variant` | Query parameter consumed by the source page |
| `frames` | no | `48` | Number of animation frames; `2` or more enables the frame picker and animated WebP export |
| `frameParam` | no | `d` | Query parameter the source page reads to render a single frame |
| `rebuild` | no | `.month` | Selectors whose generated children are removed on export |
| `canvases` | no | `section.poster` | Multi-canvas mode: each matching source node becomes one independent page (own dimensions, own export) |
| `storage` | no | `my-poster` | Local storage namespace |

Example:

```text
index.html?src=/campaign/poster.html&width=auto&height=auto&exportWidth=1280
```

### Automatic canvas size

When `--width` and `--height` are omitted for a source file, the inspector
measures the loaded iframe after layout and fonts are ready. Detection order:

1. `<meta name="canvas-width">` and `<meta name="canvas-height">`.
2. `data-canvas-width`, `data-canvas-height`, or `data-canvas-size="1080x1440"`.
3. A fixed canvas root: `[data-canvas]`, `[data-poster]`, `main.poster`,
   `#poster`, or `.poster`.
4. The body/document scroll dimensions.

Explicit CLI dimensions override detection. For responsive pages that use
`100vw`, `100vh`, or media queries, declare the intended export size:

```html
<meta name="canvas-width" content="1080">
<meta name="canvas-height" content="1440">
```

The blank canvas still defaults to `1280 × 1707`.

## Integrate with a source page

The source page should:

1. Render at the configured fixed dimensions.
2. Use normal HTML and CSS.
3. Keep referenced local assets inside the project root (the launcher blocks
   symlinks and paths that escape it).
4. Optionally read `variant` and `frameParam` query parameters (`?frame=0..N-1`
   by default). Each frame value must render deterministically; do not rely on
   a timer, because export reloads the page once per frame.

Relative X/Y edits use the CSS `translate` property and preserve document flow.
Absolute coordinates switch the selected element to `position: absolute` and
use the canvas viewport as the coordinate system.

Dual mode compares the first two configured variants side by side. The orange
outline marks the active canvas; clicking either canvas or using the canvas
selector changes the active target.

The canvas viewport supports Fit, `100%`, range/button zoom, and two-axis
scrolling when enlarged. `Ctrl/Cmd + wheel` zooms around the current viewport
center.

Image export uses the locally bundled `html2canvas` renderer and its included
MIT license. JPG is the default format; the width defaults to `1280px`.
`repeating-linear-gradient` backgrounds (unsupported by html2canvas 1.4.1) are
rasterized to a cached bitmap before capture, so striped fills keep their
pattern; radial and conic gradients are still dropped.

Animated WebP is available when `frames > 1`: pick **WebP**, set the per-frame
duration and the extra hold on the last frame, then export. Each frame is
rendered and encoded separately and muxed into one animated file by
`src/webp-anim.js`. Export renders the active canvas only: in dual-canvas mode
it walks the active variant's frames and leaves the other canvas untouched. The
multi-page `canvases` mode is rejected and asks for JPG/PNG instead. If every
frame encodes to the same size, the status line warns that the page may not
read the frame parameter. A single frame (`frames <= 1`) exports a static WebP.

## Publish

The package is static and has no build step:

```bash
cd tools/css-canvas-inspector
npm run sync:skill
npm run check
npm test
npm pack --dry-run
npm publish
```

`npm run check` verifies that the runtime bundled inside the skill matches the
repository root. Before publishing, set the final package name and repository
URL in `package.json`. The included MIT license permits commercial use,
modification, and redistribution.

## Other tools from this author

- [visa-stay-guard](https://github.com/nocaptain-oss/visa-stay-guard) —
  an Agent Skill that computes visa stay days (Schengen 90/180 exact rolling
  window, 213 countries' rules, offline and verifiable)

## Limitations

- The launcher is a static server. It does not start Vite/Next backends, proxy
  API requests, or execute server-side templates; pre-render dynamic pages to
  HTML first.
- The runtime prefix `/__css_canvas_inspector__/` is reserved inside the local
  origin. Directory listings are disabled and symlinks outside the project are
  not served. Dotfiles such as `.env` and `.git` are blocked, and requests with
  an unexpected Host header are rejected to reduce DNS-rebinding risk.
- URL-based assets inside an exported HTML file are inlined when possible;
  cross-origin assets may remain linked and can prevent canvas capture.
- Image export uses `html2canvas`; heavily layered gradients, blend modes, and
  filters can be approximated. Use the HTML output for exact CSS behavior.
- Changes are stored per browser origin and per `storage` namespace. Different
  projects may use different local ports, so their edit history is separate.
- Automatic sizing reflects the layout inside the inspector iframe. Responsive
  content should declare metadata or pass explicit dimensions when its viewport
  size differs from the intended export size.
- Requires Python 3.10+ and a current browser. This is a focused inspector,
  not a general drag-and-drop page builder or a routed multi-page site editor.
