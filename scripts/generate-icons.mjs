#!/usr/bin/env node
/**
 * Generates the app icons as real PNG files, with no dependencies.
 *
 *   node scripts/generate-icons.mjs
 *
 * The artwork (a rising sun with a check mark on a sunrise gradient) is drawn
 * with signed-distance functions and analytic anti-aliasing, then encoded as an
 * opaque RGB PNG (iOS renders transparent icon pixels as black, so we never
 * emit alpha).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'icons');

const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  // Android "maskable" icons may be cropped to a circle: keep art in the safe zone.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.78 },
];

// ---------------------------------------------------------------- PNG encoder

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePNG(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB, no alpha)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- drawing

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

const SKY = [
  [0.0, hex('#8F2E10')],
  [0.5, hex('#E2580E')],
  [1.0, hex('#F6A21A')],
];
const SUN = hex('#FFF8EF');
const CHECK = hex('#E2580E');
const SHADOW = hex('#5A1A06');

function gradient(stops, t) {
  t = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    const [p0, c0] = stops[i - 1];
    if (t <= p1) return mix(c0, c1, (t - p0) / (p1 - p0));
  }
  return stops[stops.length - 1][1];
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

// Design space: origin at the icon centre, 1 unit = icon width.
const SUN_RADIUS = 0.245;
const RAY_INNER = 0.305;
const RAY_OUTER = 0.375;
const RAY_WIDTH = 0.026;
const CHECK_POINTS = [
  [-0.105, 0.008],
  [-0.032, 0.08],
  [0.112, -0.066],
];
const CHECK_WIDTH = 0.032;

function render(size, scale) {
  const rgb = Buffer.alloc(size * size * 3);
  const pxPerUnit = size * scale; // pixels per design unit
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      // Sunrise sky with a gentle diagonal and a warm glow behind the sun.
      let colour = gradient(SKY, v * 0.82 + u * 0.18);
      const glow = clamp01(1 - Math.hypot(u - 0.5, v - 0.52) / 0.62);
      colour = mix(colour, hex('#FFD08A'), glow * glow * 0.35);

      // Design coordinates.
      const dx = (u - 0.5) / scale;
      const dy = (v - 0.5) / scale;
      const r = Math.hypot(dx, dy);

      // Soft shadow under the sun.
      const shadowD = Math.hypot(dx, dy - 0.014) - SUN_RADIUS;
      const shadowA = 0.22 * (1 - smoothstep(-0.02, 0.045, shadowD));
      colour = mix(colour, SHADOW, shadowA);

      // Eight short rays.
      const angle = Math.atan2(dy, dx);
      const sector = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const ax = Math.cos(sector) * RAY_INNER;
      const ay = Math.sin(sector) * RAY_INNER;
      const bx = Math.cos(sector) * RAY_OUTER;
      const by = Math.sin(sector) * RAY_OUTER;
      const rayD = segmentDistance(dx, dy, ax, ay, bx, by) - RAY_WIDTH;
      colour = mix(colour, SUN, 0.92 * clamp01(0.5 - rayD * pxPerUnit));

      // Sun disc.
      const sunD = r - SUN_RADIUS;
      colour = mix(colour, SUN, clamp01(0.5 - sunD * pxPerUnit));

      // Check mark.
      const [p0, p1, p2] = CHECK_POINTS;
      const checkD =
        Math.min(
          segmentDistance(dx, dy, p0[0], p0[1], p1[0], p1[1]),
          segmentDistance(dx, dy, p1[0], p1[1], p2[0], p2[1]),
        ) - CHECK_WIDTH;
      colour = mix(colour, CHECK, clamp01(0.5 - checkD * pxPerUnit));

      const i = (y * size + x) * 3;
      rgb[i] = Math.round(colour[0]);
      rgb[i + 1] = Math.round(colour[1]);
      rgb[i + 2] = Math.round(colour[2]);
    }
  }
  return rgb;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, scale } of ICONS) {
  const png = encodePNG(size, size, render(size, scale));
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`icons/${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
