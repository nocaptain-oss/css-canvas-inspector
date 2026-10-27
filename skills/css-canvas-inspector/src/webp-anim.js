const CHUNK_HEAD = 8;
const IMAGE_CHUNKS = ["ALPH", "VP8 ", "VP8L"];
const MAX_DURATION = 0xffffff;

function fourccBytes(fourcc) {
  return [0, 1, 2, 3].map((i) => fourcc.charCodeAt(i));
}

function u24(value) {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

function chunk(fourcc, payload) {
  const pad = payload.byteLength & 1;
  const buffer = new Uint8Array(CHUNK_HEAD + payload.byteLength + pad);
  buffer.set(fourccBytes(fourcc), 0);
  new DataView(buffer.buffer).setUint32(4, payload.byteLength, true);
  buffer.set(payload, CHUNK_HEAD);
  return buffer;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function readRiffChunks(buffer) {
  const view = new DataView(buffer);
  const chunks = [];
  let offset = 12;
  while (offset + CHUNK_HEAD <= buffer.byteLength) {
    const fourcc = String.fromCharCode(...new Uint8Array(buffer, offset, 4));
    const size = view.getUint32(offset + 4, true);
    if (offset + CHUNK_HEAD + size > buffer.byteLength) break;
    chunks.push({ fourcc, data: new Uint8Array(buffer, offset + CHUNK_HEAD, size) });
    offset += CHUNK_HEAD + size + (size & 1);
  }
  return chunks;
}

async function canvasBlob(canvas, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("浏览器未能编码 WebP 帧");
  return blob;
}

async function frameImageChunks(frame, quality) {
  const blob = frame instanceof Blob ? frame : await canvasBlob(frame, quality);
  const chunks = readRiffChunks(await blob.arrayBuffer());
  const image = chunks.filter((item) => IMAGE_CHUNKS.includes(item.fourcc));
  if (!image.length) throw new Error("WebP 帧缺少 VP8/VP8L 数据");
  const hasAlpha = image.some((item) => item.fourcc !== "VP8 ");
  return { parts: image.map((item) => chunk(item.fourcc, item.data)), hasAlpha };
}

export async function encodeAnimatedWebp(frames, options = {}) {
  if (!frames.length) throw new Error("没有可编码的帧");
  const {
    duration = 80,
    hold = 0,
    loop = 0,
    quality = 0.92,
    onProgress,
  } = options;
  const width = Math.round(options.width || frames[0].width || 0);
  const height = Math.round(options.height || frames[0].height || 0);
  if (!width || !height) throw new Error("缺少帧尺寸");

  const frameSize = Math.max(1, Math.min(MAX_DURATION, Math.round(duration)));
  const holdSize = Math.max(0, Math.min(MAX_DURATION, Math.round(hold)));

  const frameParts = [];
  let hasAlpha = false;
  for (let index = 0; index < frames.length; index += 1) {
    const encoded = await frameImageChunks(frames[index], quality);
    hasAlpha ||= encoded.hasAlpha;
    const size = encoded.parts.reduce((sum, part) => sum + part.byteLength, 0);
    const payload = new Uint8Array(16 + size);
    payload.set(u24(0), 0);
    payload.set(u24(0), 3);
    payload.set(u24(width - 1), 6);
    payload.set(u24(height - 1), 9);
    const frameDuration = Math.min(MAX_DURATION, frameSize + (index === frames.length - 1 ? holdSize : 0));
    payload.set(u24(frameDuration), 12);
    payload[15] = 0x00;
    let offset = 16;
    for (const part of encoded.parts) {
      payload.set(part, offset);
      offset += part.byteLength;
    }
    frameParts.push(chunk("ANMF", payload));
    onProgress?.(index + 1, frames.length);
  }

  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02 | (hasAlpha ? 0x10 : 0x00);
  vp8x.set(u24(width - 1), 4);
  vp8x.set(u24(height - 1), 7);

  const anim = new Uint8Array(6);
  anim[4] = loop & 0xff;
  anim[5] = (loop >> 8) & 0xff;

  const body = concat([chunk("VP8X", vp8x), chunk("ANIM", anim), ...frameParts]);
  const riff = new Uint8Array(12 + body.byteLength);
  riff.set(fourccBytes("RIFF"), 0);
  new DataView(riff.buffer).setUint32(4, 4 + body.byteLength, true);
  riff.set(fourccBytes("WEBP"), 8);
  riff.set(body, 12);
  return new Blob([riff], { type: "image/webp" });
}
