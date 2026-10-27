function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : 0;
}

export function chooseCanvasSize(metrics) {
  let width =
    positive(metrics.metaWidth) ||
    positive(metrics.attrWidth) ||
    positive(metrics.rectWidth);
  let height =
    positive(metrics.metaHeight) ||
    positive(metrics.attrHeight) ||
    positive(metrics.rectHeight);

  if (metrics.rootKind === "body") {
    width = Math.max(width, positive(metrics.bodyScrollWidth));
    height = Math.max(height, positive(metrics.bodyScrollHeight));
  } else if (metrics.rootKind === "document") {
    width = Math.max(width, positive(metrics.documentScrollWidth));
    height = Math.max(height, positive(metrics.documentScrollHeight));
  }

  if (!width) {
    width =
      positive(metrics.bodyScrollWidth) ||
      positive(metrics.documentScrollWidth) ||
      positive(metrics.fallbackWidth);
  }
  if (!height) {
    height =
      positive(metrics.bodyScrollHeight) ||
      positive(metrics.documentScrollHeight) ||
      positive(metrics.fallbackHeight);
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}
