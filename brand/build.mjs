// Builds every Stall brand asset from mark.mjs. Run: node brand/build.mjs (from repo root or brand/)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from '/Users/mac/Documents/Hacks/tote/video/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
import { mark, concepts } from './mark.mjs'
const here = path.dirname(fileURLToPath(import.meta.url)), pub = path.join(here, '../public')
const A = concepts.A
const svg = mark({ ...A, size: 512 }).replace(/ width="512" height="512"/, '')
fs.writeFileSync(path.join(here, 'stall-mark.svg'), svg)
fs.writeFileSync(path.join(pub, 'favicon.svg'), svg)
fs.writeFileSync(path.join(here, 'mark-inline.txt'), mark({ ...A, size: 30 }).replace(/\n/g, '').replace(/ width="30" height="30"/, ' class="logo-mark" aria-hidden="true"'))
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage()
const png = async (s, size, out, rx) => {
  await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  await p.setContent(`<html><body style="margin:0;background:transparent">${mark({ ...A, size: s, rx })}</body></html>`)
  await p.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}
await png(192, 192, path.join(pub, 'icon-192.png'))
await png(512, 512, path.join(pub, 'icon-512.png'))
await png(180, 180, path.join(pub, 'apple-touch-icon.png'), 0)
await png(1024, 1024, path.join(here, 'stall-icon-1024.png'))
await png(1024, 1024, path.join(here, 'stall-icon-1024-square.png'), 0)
// OG image with the new mark
let og = fs.readFileSync(path.join(here, 'og.html'), 'utf8').replace('<span class="m">S</span>', mark({ ...A, size: 64 }))
await p.setViewport({ width: 1200, height: 630 })
await p.setContent(og, { waitUntil: 'networkidle0' })
await p.evaluate(() => document.fonts.ready)
await p.screenshot({ path: path.join(pub, 'og.png') })
await b.close()
console.log('brand assets written')
