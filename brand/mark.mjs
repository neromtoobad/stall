// Generates the Stall mark: a market-stall awning over a counter with a hex coin.
export function mark({ bg, a, b, counter, coin, coinInner, rx = 116, size = 512 }) {
  const x0 = 80, w = 352, n = 5, sw = w / n
  let stripes = ''
  for (let i = 0; i < n; i++) {
    const x = x0 + i * sw, f = i % 2 ? b : a
    stripes += `<rect x="${x.toFixed(1)}" y="128" width="${(sw + 0.6).toFixed(1)}" height="92" fill="${f}"/><circle cx="${(x + sw / 2).toFixed(1)}" cy="220" r="${(sw / 2).toFixed(1)}" fill="${f}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
<rect width="512" height="512" rx="${rx}" fill="${bg}"/>
${stripes}
<rect x="68" y="102" width="376" height="30" rx="15" fill="${counter}"/>
<path d="M206 286 H274 L306 318 V398 H206 Z" fill="${coin}" stroke="${coin}" stroke-width="14" stroke-linejoin="round"/>
<path d="M274 286 V318 H306" fill="none" stroke="${coinInner}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>
<rect x="226" y="338" width="44" height="11" rx="5.5" fill="${coinInner}"/>
<rect x="226" y="362" width="60" height="11" rx="5.5" fill="${coinInner}"/>
<rect x="92" y="400" width="328" height="30" rx="15" fill="${counter}"/>
</svg>`
}
export const INK = '#1F2348', GOLD = '#E9B213', CREAM = '#FFF6DA', PAPER = '#F6F3EC'
export const concepts = {
  A: { bg: INK, a: GOLD, b: CREAM, counter: CREAM, coin: GOLD, coinInner: INK },
  B: { bg: GOLD, a: INK, b: CREAM, counter: INK, coin: INK, coinInner: GOLD },
  C: { bg: CREAM, a: GOLD, b: INK, counter: INK, coin: GOLD, coinInner: INK },
}
