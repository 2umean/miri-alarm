// Deterministic brand-asset generation from the SVG masters (run: node scripts/generate-brand-assets.mjs)
// MIRI · "First Light" — an amber sun cresting a broken horizon.
// Also writes assets/brand/logo.svg, so this script is the ONLY place the mark lives.
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// The mark: a sun (amber) cresting a broken horizon (white). Two swappable colors
// so the tile, adaptive foreground, and monochrome icon all read from one place.
const SUN = `
  <path d="M302 600 A210 210 0 0 1 722 600 Z" fill="{SUN}"/>
  <line x1="148" y1="600" x2="288" y2="600" stroke="{LINE}" stroke-width="66" stroke-linecap="round"/>
  <line x1="736" y1="600" x2="876" y2="600" stroke="{LINE}" stroke-width="66" stroke-linecap="round"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${body}</svg>`;

const GRADIENT = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#4FA8FF"/><stop offset="1" stop-color="#2C7BD4"/>
</linearGradient></defs>`;

// Full tile (rounded square + mark) — the iOS/store icon and splash image.
const tile = svg(`${GRADIENT}<rect width="1024" height="1024" rx="240" fill="url(#bg)"/>
  ${SUN.replaceAll('{LINE}', '#FFFFFF').replaceAll('{SUN}', '#FFB84C')}`);

// Adaptive foreground: mark only, scaled into the ~66% safe zone, transparent bg.
const foreground = svg(`<g transform="translate(512 512) scale(0.62) translate(-512 -512)">
  ${SUN.replaceAll('{LINE}', '#FFFFFF').replaceAll('{SUN}', '#FFB84C')}</g>`);

// Adaptive background: the gradient, full bleed (no rounding — the launcher masks it).
const background = svg(`${GRADIENT}<rect width="1024" height="1024" fill="url(#bg)"/>`);

// Monochrome (themed icons): white-only mark, transparent bg.
const monochrome = svg(`<g transform="translate(512 512) scale(0.62) translate(-512 -512)">
  ${SUN.replaceAll('{LINE}', '#FFFFFF').replaceAll('{SUN}', '#FFFFFF')}</g>`);

const out = async (svgStr, size, file) =>
  sharp(Buffer.from(svgStr)).resize(size, size).png().toFile(file);

await Promise.all([
  writeFile('assets/brand/logo.svg', `${tile}\n`),
  out(tile, 1024, 'assets/icon.png'),
  out(foreground, 1024, 'assets/android-icon-foreground.png'),
  out(background, 1024, 'assets/android-icon-background.png'),
  out(monochrome, 1024, 'assets/android-icon-monochrome.png'),
  out(tile, 512, 'assets/splash-icon.png'),
  out(tile, 48, 'assets/favicon.png'),
]);
console.log('brand assets generated');
