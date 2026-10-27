import assert from "node:assert/strict";
import test from "node:test";

import { chooseCanvasSize } from "../skills/css-canvas-inspector/src/canvas-size.js";

test("fixed body height wins over the iframe viewport scroll height", () => {
  assert.deepEqual(
    chooseCanvasSize({
      rootKind: "body",
      rectWidth: 1280,
      rectHeight: 640,
      bodyScrollWidth: 1280,
      bodyScrollHeight: 640,
      documentScrollWidth: 1280,
      documentScrollHeight: 1707,
    }),
    { width: 1280, height: 640 },
  );
});

test("metadata overrides rendered dimensions", () => {
  assert.deepEqual(
    chooseCanvasSize({
      rootKind: "element",
      metaWidth: 1080,
      metaHeight: 1440,
      rectWidth: 500,
      rectHeight: 500,
    }),
    { width: 1080, height: 1440 },
  );
});

test("body scroll dimensions capture overflowing content", () => {
  assert.deepEqual(
    chooseCanvasSize({
      rootKind: "body",
      rectWidth: 800,
      rectHeight: 600,
      bodyScrollWidth: 900,
      bodyScrollHeight: 1200,
      documentScrollWidth: 900,
      documentScrollHeight: 1200,
    }),
    { width: 900, height: 1200 },
  );
});
