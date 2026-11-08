import puppeteer from '/Users/mac/Documents/Hacks/tote/video/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
import fs from 'node:fs'
import { mark, concepts, INK, PAPER } from './mark.mjs'
const [,, out = 'concepts.png', html] = process.argv
const page_html = html ? fs.readFileSync(html, 'utf8') : `<html><head><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=swap" rel="stylesheet"><style>
body{margin:0;background:${PAPER};font-family:'Bricolage Grotesque';color:${INK};display:flex;gap:40px;padding:40px}
.c{display:flex;flex-direction:column;align-items:center;gap:22px;background:#fff;border-radius:28px;padding:32px;border:2px solid #e3ddcf}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:54px;letter-spacing:-0.03em}
.sm{display:flex;gap:16px;align-items:end}
h3{margin:0;font-size:20px}
</style></head><body>${Object.entries(concepts).map(([k, c]) => `<div class="c"><h3>${k}</h3>${mark({ ...c, size: 260 })}
<div class="lock">${mark({ ...c, size: 64 })}stall</div>
<div class="sm">${mark({ ...c, size: 48 })}${mark({ ...c, size: 32 })}${mark({ ...c, size: 16 })}</div></div>`).join('')}</body></html>`
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage()
await p.setViewport({ width: 1100, height: 640, deviceScaleFactor: 1 })
await p.setContent(page_html, { waitUntil: 'networkidle0' })
await p.screenshot({ path: out, fullPage: true })
await b.close()
console.log('wrote', out)
