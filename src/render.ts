// 确定性印章渲染：opentype 取字形轮廓 → SVG 章面 → resvg-wasm 光栅化 PNG
// 复用主站布局(layout)与缺字几何缪篆(GEO)，章面参数对齐 render.ts 已验收数字。
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from './index_bg.wasm';
import * as ot from 'opentype.js';
const otp: any = (ot as any).parse ? ot : (ot as any).default; // parse 入口在 module/默认导出间漂移，双取
import { layoutGrid } from '../../sealmaker/src/seal/layout';
import { GEO } from '../../sealmaker/src/seal/fallback';

await initWasm(resvgWasm as unknown as ArrayBuffer);

const INK = '#b03a2e';
const PAPER = '#f4ecd9';
export const FAMILY_MAIN = 'Jingfeng_ZSKSS';
export const FAMILY_SUPP = 'Chong Xi Small Seal';

interface Fonts {
  main: any;
  supp: any;
  mainBuf: ArrayBuffer;
  suppBuf: ArrayBuffer;
}
let fontsP: Promise<Fonts> | null = null;

async function fetchBuf(env: Env, path: string): Promise<ArrayBuffer> {
  const res = await env.ASSETS.fetch(new URL(path, 'https://fonts.internal'));
  if (!res.ok) throw new Error('font asset missing: ' + path);
  return res.arrayBuffer();
}

export function getFonts(env: Env): Promise<Fonts> {
  if (!fontsP) {
    fontsP = (async () => {
      const [mainBuf, suppBuf] = await Promise.all([
        fetchBuf(env, '/fonts/JFZSKSealScript_V3.5.ttf'),
        fetchBuf(env, '/fonts/chongxi-seal.ttf'),
      ]);
      return {
        main: otp.parse(mainBuf),
        supp: otp.parse(suppBuf),
        mainBuf,
        suppBuf,
      };
    })();
  }
  return fontsP;
}

// 单个字 → { svgInner, fam }：优先中山王全量真形，缺字用崇羲补字，再缺走几何缪篆
function glyphSvg(fonts: Fonts, ch: string, cellW: number, cellH: number, cx: number, cy: number): string {
  const em = 100;
  let font: any = null;
  if (fonts.main.charToGlyphIndex(ch) > 0) font = fonts.main;
  else if (fonts.supp.charToGlyphIndex(ch) > 0) font = fonts.supp;
  const isSupp = font === fonts.supp;

  if (!font) {
    const g = GEO[ch];
    if (!g) return '';
    const parts: string[] = [];
    for (const [x1, y1, x2, y2] of g.lines) parts.push(`M${x1} ${y1}L${x2} ${y2}`);
    for (const [bx, by, bw, bh] of g.boxes) parts.push(`M${bx} ${by}h${bw}v${bh}h${-bw}Z`);
    const fit = Math.min((cellW * 0.8) / em, (cellH * 0.86) / em);
    const w = em * fit;
    return (
      `<g transform="translate(${cx - w / 2} ${cy - w / 2}) scale(${fit})" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="${parts.join('')}"/></g>`
    );
  }

  const path = font.getPath(ch, 0, 0, em);
  const d = path.toPathData(2);
  const bb = path.getBoundingBox();
  const bw = bb.x2 - bb.x1;
  const bh = bb.y2 - bb.y1;
  if (bw <= 0 || bh <= 0) return '';
  const fit = Math.min((cellW * 0.82) / bw, (cellH * 0.88) / bh);
  const px = cx - (bb.x1 + bw / 2) * fit;
  const py = cy - (bb.y1 + bh / 2) * fit;
  // 墨晕微胀：先粗描(同色)再填充，≈站内 0.032em 笔画配平；崇羲字形站内已蚀边减墨，故不加胀
  if (isSupp) {
    return `<g transform="translate(${px} ${py}) scale(${fit})"><path d="${d}" fill="${INK}"/></g>`;
  }
  return (
    `<g transform="translate(${px} ${py}) scale(${fit})">` +
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="${INK}"/></g>`
  );
}

export interface SealSvgOptions {
  size?: number;
}

export function buildSealSvg(fonts: Fonts, chars: string[], opts: SealSvgOptions = {}): string {
  const size = opts.size ?? 512;
  const grid = layoutGrid(chars.slice(0, 8));
  const m = size * 0.05;
  const fw = size * 0.045;
  const x0 = m + fw + size * 0.02;
  const w0 = size - 2 * (m + fw) - size * 0.04;
  const cellW = w0 / grid.cols;
  const cellH = w0 / grid.rows;
  let inner = '';
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const ch = grid.grid[r][c];
      if (!ch) continue;
      inner += glyphSvg(fonts, ch, cellW, cellH, x0 + c * cellW + cellW / 2, m + fw + (w0 / grid.rows) * r + cellH / 2);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<defs><filter id="stamp" x="-6%" y="-6%" width="112%" height="112%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="noise"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="noise" scale="${(size * 0.008).toFixed(1)}" result="carved"/>` +
    `<feGaussianBlur in="carved" stdDeviation="${(size * 0.0028).toFixed(2)}" result="halo"/>` +
    `<feComponentTransfer in="halo" result="haloA"><feFuncA type="linear" slope="0.5"/></feComponentTransfer>` +
    `<feComponentTransfer in="carved" result="mainA"><feFuncA type="linear" slope="0.94"/></feComponentTransfer>` +
    `<feMerge><feMergeNode in="haloA"/><feMergeNode in="mainA"/></feMerge>` +
    `</filter></defs>` +
    `<rect width="${size}" height="${size}" fill="${PAPER}"/>` +
    `<g filter="url(#stamp)">` +
    `<rect x="${m}" y="${m}" width="${size - 2 * m}" height="${size - 2 * m}" fill="none" stroke="${INK}" stroke-width="${fw}"/>` +
    inner +
    `</g></svg>`
  );
}

export async function renderSealPng(env: Env, chars: string[], size = 512): Promise<Uint8Array> {
  const fonts = await getFonts(env);
  const svg = buildSealSvg(fonts, chars, { size });
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: {
      loadSystemFonts: false,
      fontFiles: [new Uint8Array(fonts.mainBuf), new Uint8Array(fonts.suppBuf)],
      defaultFontFamily: FAMILY_MAIN,
    },
  });
  return resvg.render().asPng();
}
