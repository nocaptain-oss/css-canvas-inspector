# CSS Canvas Inspector

A lightweight visual CSS editor for fixed-size HTML canvases. It is designed
for human-agent design collaboration: a person selects elements and adjusts
layout values on the left, while an agent can keep editing the underlying HTML
and CSS.

No framework or runtime dependency is required. The source canvas and the
inspector must be served from the same origin.

## Adopt it

Three ways to make this the review surface for your design work — see
[INTEGRATION.md](INTEGRATION.md):

- **Human quickstart** — open any fixed-size HTML file in the editor:
  [Level 1](INTEGRATION.md#level-1-use-it-as-a-human)
- **Design skills** — your generator skill hands off review to this tool:
  [Level 2](INTEGRATION.md#level-2-reference-it-from-your-design-skill)
- **Sub-agents** — make it the standard co-creation interface instead of
  screenshot loops: [Level 3](INTEGRATION.md#level-3-make-it-the-standard-interface-for-sub-agents)

## Features

- Click any element on the canvas to select it.
- Adjust width, height, font size, weight, line height, tracking, color,
  alignment, margins, and padding.
- Move elements with relative X/Y offsets.
- Switch to absolute page coordinates using the canvas origin as `0,0`.
- Enter any additional CSS property.
- Edit direct text nodes inside mixed inline content.
- Undo and redo edits, or nudge with arrow keys.
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

## Run locally

From the repository root:

```bash
python3 -m http.server 8788 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8788/index.html?src=/demo.html
```

The blank starter is an inspection canvas, not a drag-and-drop page builder.
Its content should come from the source HTML. It defaults to `1280 × 1707`
with a `1280px` export width.

## Use from a Codex session

The package includes the model-invocable skill in
`skills/css-canvas-inspector`. Install that directory under
`${CODEX_HOME:-$HOME/.codex}/skills` or `~/.agents/skills` when using a
multi-harness setup.

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

The skill launches `scripts/open_inspector.py`, which serves the project and
inspector from the same origin, then opens the browser. The model should not
try to reproduce the editor with a screenshot or by describing CSS changes.

## Configure

The inspector is configured through URL parameters:

| Parameter | Required | Example | Description |
|---|---:|---|---|
| `src` | yes | `/poster.html` | Same-origin HTML page to edit |
| `name` | no | `Poster Inspector` | Toolbar title |
| `width` | no | `1080` | Canvas width in CSS pixels |
| `height` | no | `1440` | Canvas height in CSS pixels |
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
index.html?src=/campaign/poster.html&width=1080&height=1440&exportWidth=1280
```

## Integrate with a source page

The source page should:

1. Render at the configured fixed dimensions.
2. Use normal HTML and CSS.
3. Be served from the same origin as the inspector.
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
npm run check
npm pack --dry-run
npm publish
```

Before publishing, set the final package name and repository URL in
`package.json`. The included MIT license permits commercial use, modification,
and redistribution.

## Other tools from this author

- [visa-stay-guard](https://github.com/nocaptain-oss/visa-stay-guard) —
  an Agent Skill that computes visa stay days (Schengen 90/180 exact rolling
  window, 213 countries' rules, offline and verifiable)

## Limitations

- The source must be same-origin because the inspector accesses its iframe DOM.- URL-based assets inside an exported HTML file are inlined when possible;
  cross-origin assets may remain linked.
- Image export uses `html2canvas`; heavily layered gradients, blend modes, and
  filters can be approximated. Use the HTML output for exact CSS behavior.
- Changes are stored per browser and per `storage` namespace.
- This is a focused inspector, not a general drag-and-drop page builder.
