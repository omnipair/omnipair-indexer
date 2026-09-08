import * as fs from 'fs';
import * as path from 'path';
import { safeFetch } from '../utils/safeFetch';

export interface OgCardParams {
  token0Symbol: string;
  token1Symbol: string;
  token0IconBase64?: string;
  token1IconBase64?: string;
  swapFee: string;
  ltv: string;
  apr: string;
  tvlValue: string;
  tvlSuffix: string;
  totalDebtValue: string;
  totalDebtSuffix: string;
  spotPriceValue: string;
  spotPriceSuffix: string;
}

export function formatLargeNumber(num: number): { value: string; suffix: string } {
  if (num >= 1_000_000_000) {
    return { value: (num / 1_000_000_000).toFixed(1), suffix: 'B' };
  } else if (num >= 1_000_000) {
    return { value: (num / 1_000_000).toFixed(1), suffix: 'M' };
  } else if (num >= 1_000) {
    return { value: (num / 1_000).toFixed(1), suffix: 'K' };
  } else if (num >= 1) {
    return { value: num.toFixed(2), suffix: '' };
  } else {
    return { value: num.toFixed(4), suffix: '' };
  }
}

const IMAGE_TIMEOUT_MS = 5_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Fetch an image URL and return it as a base64 data URI.
 * Returns undefined if the fetch fails.
 */
export async function fetchImageAsBase64(url: string): Promise<string | undefined> {
  try {
    const response = await safeFetch(url, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxBytes: MAX_IMAGE_BYTES,
      requireImage: true,
    });

    return `data:${response.contentType};base64,${response.body.toString('base64')}`;
  } catch (error) {
    console.warn(`Failed to fetch image for OG card: ${url}`, error);
    return undefined;
  }
}


function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') width += 0.56 * fontSize;
    else if (ch === '.') width += 0.27 * fontSize;
    else if (ch === ' ') width += 0.27 * fontSize;
    else if (ch === '-') width += 0.36 * fontSize;
    else width += 0.5 * fontSize;
  }
  return width;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

let templateCache: string | null = null;
let fontBase64Cache: string | null = null;

function loadTemplate(): string {
  if (!templateCache) {
    const templatePath = path.join(__dirname, '../../pair-og-card-template.svg');
    templateCache = fs.readFileSync(templatePath, 'utf-8');
  }
  return templateCache;
}

function loadFontBase64(): string {
  if (!fontBase64Cache) {
    const fontPath = path.join(__dirname, '../../MSaansVF.ttf');
    fontBase64Cache = fs.readFileSync(fontPath).toString('base64');
  }
  return fontBase64Cache;
}

export function generateOgCardSvg(params: OgCardParams): string {
  let svg = loadTemplate();
  const fontB64 = loadFontBase64();

  // 0. Embed the M Saans variable font as a base64 @font-face in <defs>
  const fontStyle = `<style>
@font-face {
  font-family: 'M Saans';
  src: url('data:font/truetype;base64,${fontB64}') format('truetype');
  font-weight: 100 900;
  font-style: normal;
}
</style>`;
  svg = svg.replace('<defs>', `<defs>${fontStyle}`);

  // 1. Replace token symbols in the ticker
  svg = svg.replace('>Token1</tspan>', `>${escapeXml(params.token0Symbol)}</tspan>`);
  svg = svg.replace('>Token2</tspan>', `>${escapeXml(params.token1Symbol)}</tspan>`);

  // 2. Replace swap fee value (id="swap_fee_value")
  svg = svg.replace('>0.25%</tspan></text>', `>${escapeXml(params.swapFee)}</tspan></text>`);

  // 3. Replace LTV value (id="ltv_value")
  svg = svg.replace('>Dynamic</tspan></text>', `>${escapeXml(params.ltv)}</tspan></text>`);

  // 4. Replace APR value (id="apr_value")
  svg = svg.replace('>4.66%</tspan></text>', `>${escapeXml(params.apr)}</tspan></text>`);

  // 5. Replace TVL number (inside tvl_value group, matched by unique x coordinate)
  svg = svg.replace(
    /(<tspan x="129\.664" y="444\.3">) 650(<\/tspan>)/,
    `$1 ${escapeXml(params.tvlValue)}$2`
  );

  // 6. Replace TVL suffix K/M/B (in tvl_value group, matched by unique x coordinate)
  svg = svg.replace(
    /(<tspan x="245\.328" y="444\.3">)K(<\/tspan>)/,
    `$1${escapeXml(params.tvlSuffix)}$2`
  );

  // 7. Replace total debt number (inside total_debt_value group, matched by unique x coordinate)
  svg = svg.replace(
    /(<tspan x="892\.486" y="444\.3">) 120\.7(<\/tspan>)/,
    `$1 ${escapeXml(params.totalDebtValue)}$2`
  );

  // 8. Replace total debt suffix K/M/B (in total_debt_value group, matched by unique x coordinate)
  svg = svg.replace(
    /(<tspan x="1031\.99" y="444\.3">)K(<\/tspan>)/,
    `$1${escapeXml(params.totalDebtSuffix)}$2`
  );

  // 9. Replace liquidity card with spot price (token0 price in token1)
  // Value line: price + token1 logo (or symbol fallback)
  if (params.token1IconBase64) {
    const priceTextWidth = estimateTextWidth(params.spotPriceValue + ' ', 56);
    const iconX = Math.round(478 + priceTextWidth);
    const iconR = 22;
    const iconCx = iconX + iconR;
    const iconCy = 428;
    svg = svg.replace(
      /<g id="liquidity_value">[\s\S]*?<\/g>/,
      `<g id="liquidity_value">
<text style="white-space: pre" xml:space="preserve" font-family="M Saans" font-size="56" letter-spacing="0em"><tspan x="478" y="442.3" fill="#292929">${escapeXml(params.spotPriceValue)} </tspan></text>
<clipPath id="clip-price-token1"><circle cx="${iconCx}" cy="${iconCy}" r="${iconR}"/></clipPath>
<image href="${params.token1IconBase64}" x="${iconX}" y="${iconCy - iconR}" width="${iconR * 2}" height="${iconR * 2}" clip-path="url(#clip-price-token1)" preserveAspectRatio="xMidYMid slice"/>
<circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" stroke="#E0E0E0" stroke-width="1.5" fill="none"/>
</g>`
    );
  } else {
    svg = svg.replace(
      /<g id="liquidity_value">[\s\S]*?<\/g>/,
      `<g id="liquidity_value">
<text style="white-space: pre" xml:space="preserve" font-family="M Saans" font-size="56" letter-spacing="0em"><tspan x="478" y="442.3" fill="#292929">${escapeXml(params.spotPriceValue)} </tspan><tspan fill="#9B9B9B">${escapeXml(params.spotPriceSuffix)}</tspan></text>
</g>`
    );
  }
  // Label line: "1 {token0 symbol}" (always text, no icon)
  svg = svg.replace(
    /<text id="liquidity_label"[^>]*>.*?<\/text>/,
    `<text id="liquidity_label" fill="#9B9B9B" style="white-space: pre" xml:space="preserve" font-family="M Saans" font-size="32" letter-spacing="0em"><tspan x="478" y="502.6">1 ${escapeXml(params.token0Symbol)}</tspan></text>`
  );

  // 10. Replace token0 image if base64 data URI is available
  if (params.token0IconBase64) {
    svg = svg.replace(
      /<g id="token0_img">[\s\S]*?<\/g>/,
      `<g id="token0_img">
<image href="${params.token0IconBase64}" x="53.938" y="66.625" width="111" height="111" clip-path="url(#clip-token0)" preserveAspectRatio="xMidYMid slice"/>
<circle cx="109.438" cy="122.125" r="55.5" stroke="white" stroke-width="6" fill="none"/>
</g>`
    );
    svg = svg.replace(
      '</defs>',
      `<clipPath id="clip-token0"><circle cx="109.438" cy="122.125" r="55.5"/></clipPath>\n</defs>`
    );
  }

  // 8. Replace token1 image if base64 data URI is available
  if (params.token1IconBase64) {
    svg = svg.replace(
      /<g id="token1_img">[\s\S]*?<\/g>/,
      `<g id="token1_img">
<image href="${params.token1IconBase64}" x="105.812" y="66.625" width="111" height="111" clip-path="url(#clip-token1)" preserveAspectRatio="xMidYMid slice"/>
<circle cx="161.312" cy="122.125" r="55.5" stroke="white" stroke-width="6" fill="none"/>
</g>`
    );
    svg = svg.replace(
      '</defs>',
      `<clipPath id="clip-token1"><circle cx="161.312" cy="122.125" r="55.5"/></clipPath>\n</defs>`
    );
  }

  return svg;
}
