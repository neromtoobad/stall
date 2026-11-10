import './style.css'
import { installDevWallet } from './devwallet'
if (import.meta.env.DEV) installDevWallet()
import { nimiq, inNimiqPay, network, walletError, signIn, payNim, payUsdt, evmAccount, stakeNim, nimBalance } from './wallet'

// Stall mark (brand/mark.mjs → brand/build.mjs)
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="logo-mark" aria-hidden="true"><rect width="512" height="512" rx="116" fill="#1F2348"/><rect x="80.0" y="128" width="71.0" height="92" fill="#E9B213"/><circle cx="115.2" cy="220" r="35.2" fill="#E9B213"/><rect x="150.4" y="128" width="71.0" height="92" fill="#FFF6DA"/><circle cx="185.6" cy="220" r="35.2" fill="#FFF6DA"/><rect x="220.8" y="128" width="71.0" height="92" fill="#E9B213"/><circle cx="256.0" cy="220" r="35.2" fill="#E9B213"/><rect x="291.2" y="128" width="71.0" height="92" fill="#FFF6DA"/><circle cx="326.4" cy="220" r="35.2" fill="#FFF6DA"/><rect x="361.6" y="128" width="71.0" height="92" fill="#E9B213"/><circle cx="396.8" cy="220" r="35.2" fill="#E9B213"/><rect x="68" y="102" width="376" height="30" rx="15" fill="#FFF6DA"/><path d="M206 286 H274 L306 318 V398 H206 Z" fill="#E9B213" stroke="#E9B213" stroke-width="14" stroke-linejoin="round"/><path d="M274 286 V318 H306" fill="none" stroke="#1F2348" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/><rect x="226" y="338" width="44" height="11" rx="5.5" fill="#1F2348"/><rect x="226" y="362" width="60" height="11" rx="5.5" fill="#1F2348"/><rect x="92" y="400" width="328" height="30" rx="15" fill="#FFF6DA"/></svg>`

// ---------- tiny utils ----------

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[]
const app = $('#app')
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const store = {
  get(k: string) { try { return localStorage.getItem('stall.' + k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem('stall.' + k, v) } catch {} },
  del(k: string) { try { localStorage.removeItem('stall.' + k) } catch {} },
}
const nf = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
const fmtNim = (n: number) => nf(n, n < 10 ? 2 : 0) + ' NIM'
const fmtUsd = (n: number) => '$' + nf(n, 2)
const fmtNgn = (n: number) => '₦' + nf(Math.round(n))
const fmtPrice = (p: { amount: number; currency: string }) => p.currency === 'USD' ? fmtUsd(p.amount) : p.currency === 'NGN' ? fmtNgn(p.amount) : fmtNim(p.amount)
const fmtSize = (b: number) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'
const ago = (t: number) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago' }
const short = (a: string, n = 4) => { const c = (a || '').replace(/\s/g, ''); return c.length > 14 ? c.slice(0, n + 2) + '…' + c.slice(-n) : c }
const nimWatch = (net: string, hash: string) => `https://${net === 'testnet' ? 'test.' : ''}nimiq.watch/#${hash}`
const polyScan = (hash: string) => `https://polygonscan.com/tx/${hash}`
const origin = () => location.origin
// nimpay.app/miniapps/open/<host> only works once the app is in the nimiq/awesome catalog.
// Flip this on after the listing is merged; until then people paste the link into Mini Apps → Custom URL.
const LISTED_IN_NIMIQ_PAY = false
const openInPay = (path: string) => `https://nimpay.app/miniapps/open/${location.host}${path}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const linkify = (t: string) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>')

const I = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  leaf: '<svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z" fill="currentColor" stroke="none"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M4 4l16 16M20 4L4 20"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M9 9h11v11H9zM5 15H4V4h11v1"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  inn: '<svg viewBox="0 0 24 24"><path d="M17 7 7 17M7 9v8h8"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/></svg>',
}

async function api<T = any>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string> || {}) }
  const token = store.get('token')
  if (token) headers.authorization = 'Bearer ' + token
  let body = opts.body
  if (opts.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.json) }
  let res: Response
  try { res = await fetch(path, { ...opts, headers, body }) } catch { throw new Error('No connection to Stall. Check your internet and try again.') }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && token) store.del('token')
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status })
  return data
}

function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  $$('.toast').forEach((t) => t.remove())
  const t = document.createElement('div')
  t.className = 'toast ' + kind
  t.setAttribute('role', 'status')
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.classList.add('out'), 2800)
  setTimeout(() => t.remove(), 3200)
}

async function copy(text: string, label = 'Link copied') {
  try { await navigator.clipboard.writeText(text); toast(label) } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); toast(label) } catch { toast('Could not copy', 'err') }
    ta.remove()
  }
}

// bottom sheet helper
function sheet(html: string, opts: { onClose?: () => void; cls?: string } = {}) {
  const bg = document.createElement('div')
  bg.className = 'sheet-bg'
  bg.innerHTML = `<div class="sheet ${opts.cls || ''}" role="dialog"><div class="grab" aria-hidden="true"></div>${html}</div>`
  const close = () => { bg.classList.add('out'); setTimeout(() => bg.remove(), 180); opts.onClose?.() }
  bg.addEventListener('click', (e) => { if (e.target === bg || (e.target as HTMLElement).closest('[data-close]')) close() })
  document.body.appendChild(bg)
  return { el: bg.querySelector('.sheet') as HTMLElement, close }
}

function shareSheet(url: string, title: string, blurb = '') {
  const text = `${title}${blurb ? ' · ' + blurb : ''}`
  const s = sheet(`<h3>Share</h3><p class="muted small">${esc(title)}</p>
    <div class="share-grid">
      <a class="share-opt" href="https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}" target="_blank" rel="noopener">${I.wa}<span>WhatsApp</span></a>
      <a class="share-opt" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener">${I.x}<span>X</span></a>
      <button class="share-opt" data-copy>${I.copy}<span>Copy link</span></button>
      ${'share' in navigator ? `<button class="share-opt" data-native>${I.share}<span>More</span></button>` : ''}
    </div>
    <p class="url mono">${esc(url)}</p>`)
  s.el.querySelector<HTMLButtonElement>('[data-copy]')!.onclick = () => { copy(url); s.close() }
  const n = s.el.querySelector<HTMLButtonElement>('[data-native]')
  if (n) n.onclick = async () => { try { await navigator.share({ url, title }) } catch {} s.close() }
}

// receipts the buyer owns, kept on this device
type Saved = { id: string; key: string; title: string; at: number }
const receipts = {
  list(): Saved[] { try { return JSON.parse(store.get('receipts') || '[]') } catch { return [] } },
  add(r: Saved) { const l = receipts.list().filter((x) => x.id !== r.id); l.unshift(r); store.set('receipts', JSON.stringify(l.slice(0, 200))) },
  merge(rs: Saved[]) { const l = receipts.list(); for (const r of rs) if (!l.find((x) => x.id === r.id)) l.push(r); l.sort((a, b) => b.at - a.at); store.set('receipts', JSON.stringify(l.slice(0, 200))) },
}

// ---------- shared chrome ----------

const awning = `<div class="awning" aria-hidden="true"></div>`
function header(right = '', withAwning = false) {
  return `${withAwning ? awning : ''}<header class="bar"><a href="/" class="logo" data-link aria-label="Stall home">${MARK}stall</a><div class="bar-right">${right}</div></header>`
}
function tabs(active: 'home' | 'sell' | 'buy') {
  const signed = !!store.get('token')
  return `<nav class="tabs" aria-label="Main">
    <a href="/" data-link class="${active === 'home' ? 'on' : ''}">${I.home}<span>${signed ? 'My stall' : 'Home'}</span></a>
    <a href="/new" data-link class="sell ${active === 'sell' ? 'on' : ''}"><b>${I.plus}</b><span>Sell</span></a>
    <a href="/purchases" data-link class="${active === 'buy' ? 'on' : ''}">${I.bag}<span>Purchases</span></a>
  </nav>`
}
const hueOf = (s: string) => ((s || 'S').charCodeAt(0) * 37 + (s.length || 1) * 11) % 360
const av = (name: string, cls = 'av') => `<span class="${cls}" style="--h:${hueOf(name)}">${esc((name || 'S').trim().slice(0, 1).toUpperCase())}</span>`
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const netBadge = (net: string) => net === 'testnet' ? `<span class="badge test">Testnet</span>` : ''

function cover(p: { cover: string | null; title: string; hue: number; kind?: string }, cls = '') {
  if (p.cover) return `<div class="cover ${cls}"><img src="${esc(p.cover)}" alt="" loading="lazy"></div>`
  const init = esc(p.title.trim().slice(0, 1).toUpperCase() || 'S')
  return `<div class="cover gen ${cls}" style="--h:${p.hue}"><span>${init}</span></div>`
}

function render(html: string, withTabs: false | 'home' | 'sell' | 'buy' = false) {
  app.innerHTML = html + (withTabs ? tabs(withTabs) : '')
  document.body.classList.toggle('has-tabs', !!withTabs)
  window.scrollTo(0, 0)
}

// ---------- router ----------

const routes: [RegExp, (m: RegExpMatchArray) => void | Promise<void>][] = [
  [/^\/$/, () => home()],
  [/^\/new$/, () => newProduct()],
  [/^\/setup$/, () => setup()],
  [/^\/edit\/([A-Za-z0-9]+)$/, (m) => editProduct(m[1])],
  [/^\/p\/([A-Za-z0-9]+)$/, (m) => productPage(m[1])],
  [/^\/r\/([A-Za-z0-9]+)$/, (m) => receiptPage(m[1])],
  [/^\/@([A-Za-z0-9_]+)$/, (m) => stallPage(m[1])],
  [/^\/s\/([A-Za-z0-9]+)$/, (m) => stallPage(m[1])],
  [/^\/purchases$/, () => purchasesPage()],
  [/^\/privacy$/, () => privacyPage()],
]

let navToken = 0
async function route() {
  const t = ++navToken
  $$('.sheet-bg').forEach((s) => s.remove())
  const path = location.pathname.replace(/\/+$/, '') || '/'
  for (const [re, fn] of routes) {
    const m = path.match(re)
    if (m) {
      try { await fn(m) } catch (e: any) { if (t === navToken) errorPage(e.message) }
      return
    }
  }
  errorPage('This page is not on the shelf.')
}
function go(path: string) { history.pushState(null, '', path); route() }
window.addEventListener('popstate', route)
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-link]') as HTMLAnchorElement | null
  if (a && a.origin === location.origin && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.pathname + a.search) }
})

function errorPage(msg: string) {
  render(`${header()}<main class="wrap"><div class="empty"><div class="empty-art" aria-hidden="true">?</div><h1>Hmm.</h1><p>${esc(msg)}</p><a class="btn" href="/" data-link>Back to Stall</a></div></main>`, 'home')
}
function loading() { render(`${header()}<main class="wrap"><div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton short"></div></main>`) }

// ---------- privacy ----------

function privacyPage() {
  render(`${header()}<main class="wrap prose">
    <h1>Privacy</h1>
    <p class="lede">Stall keeps as little as it can. No emails, passwords, ads or trackers.</p>
    <h2>What Stall stores</h2>
    <ul>
      <li><b>Creators:</b> your Nimiq wallet address, the shop name, handle and bio you type, and an optional Polygon address if you turn on USDT.</li>
      <li><b>Products:</b> the files, covers, titles, prices and private links you upload, plus a view count for your own dashboard.</li>
      <li><b>Orders:</b> the product, the amount, the payment message, the transaction hash and the paying wallet address, so the download can unlock and a buyer can recover it later.</li>
    </ul>
    <h2>What it does not store</h2>
    <p>No real names, emails, phone numbers, IP logs or analytics cookies. Your private key never leaves Nimiq Pay: Stall only asks your wallet to sign a message or approve a payment, and you confirm every one.</p>
    <h2>On this device</h2>
    <p>Your sign-in session and the receipts you bought are saved in this browser's local storage so you can open them again. Clearing site data removes them; you can bring purchases back from <a href="/purchases" data-link>Purchases</a> with "Recover with my wallet".</p>
    <h2>Public by nature</h2>
    <p>Payments are Nimiq or Polygon transactions, which are public on their blockchains. Your shop page and the "recent sales" feed show shop names and product titles, never buyer addresses.</p>
    <h2>Removing your data</h2>
    <p>Removing a product from its edit page takes it off sale at once. Its file is kept only so people who already paid can still download it. To remove your whole shop and its files, open an issue on <a href="https://github.com/neromtoobad/stall/issues" target="_blank" rel="noopener">GitHub</a> from your shop handle and it will be deleted.</p>
    <p class="fine">Stall is open source (MIT); the code that handles all of this is public.</p>
  </main>${footer()}`, 'home')
}

// ---------- sign in ----------

async function walletSignature() {
  const ch = await api('/api/auth/challenge')
  const signed = await signIn(ch.message)
  return { nonce: ch.nonce, publicKey: signed.publicKey, signature: signed.signature }
}

async function doSignIn(btn?: HTMLButtonElement, next?: string) {
  if (!(await nimiq())) { openOutsideSheet(next || '/'); return false }
  const label = btn?.innerHTML
  if (btn) { btn.disabled = true; btn.innerHTML = 'Check Nimiq Pay…' }
  try {
    const sig = await walletSignature()
    const r = await api('/api/auth/verify', { method: 'POST', json: { ...sig, network: network() } })
    store.set('token', r.token)
    go(r.isNew ? '/setup' : next || '/')
    return true
  } catch (e) {
    const w = walletError(e)
    toast(w.cancelled ? 'Sign-in cancelled' : w.message, w.cancelled ? 'ok' : 'err')
    return false
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = label! }
  }
}

function openOutsideSheet(path: string) {
  const link = origin() + path
  const s = sheet(`<h3>Stall lives inside Nimiq Pay</h3>
    <p>Your wallet does the signing and paying, so Stall never touches your keys. Open this page in the Nimiq Pay app on your phone.</p>
    ${LISTED_IN_NIMIQ_PAY
      ? `<a class="btn primary block" href="${esc(openInPay(path))}">Open in Nimiq Pay</a>
         <button class="btn ghost block" data-copy>Copy link</button>`
      : `<ol class="steps">
           <li>Copy this link</li>
           <li>In Nimiq Pay, open <b>Mini Apps</b></li>
           <li>Paste it into <b>Custom URL</b></li>
         </ol>
         <p class="mono linkbox">${esc(link.replace(/^https?:\/\//, ''))}</p>
         <button class="btn primary block" data-copy>Copy link</button>`}
    <p class="fine">No Nimiq Pay yet? It's free on the App Store and Google Play.</p>`)
  s.el.querySelector<HTMLButtonElement>('[data-copy]')!.onclick = () => { copy(link); s.close() }
}

// ---------- home: landing or dashboard ----------

async function home() {
  if (store.get('token')) {
    try { return await dashboard() } catch (e: any) { if (e.status !== 401) throw e }
  }
  return landing()
}

function heroArt() {
  const bars = [2, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8, 7, 10]
  return `<div class="demo" aria-hidden="true">
    <div class="demo-card">
      <div class="bal-top"><span class="label">Total earned</span><span class="pill flat">Example</span></div>
      <p class="bal">₦212,400</p>
      <p class="bal-sub"><span class="pill up">${I.up} ₦48,500 this week</span></p>
      <div class="demo-bars">${bars.map((h, i) => `<i style="--h:${h * 10}%;--i:${i}" class="${i === bars.length - 1 ? 't' : ''}"></i>`).join('')}</div>
    </div>
    <div class="demo-toast"><span class="ric in">${I.inn}</span><div><b>Preset pack sold</b><span>+4,299 NIM · just now</span></div></div>
  </div>`
}

async function landing() {
  render(`${header(`<button class="btn sm" id="signin2">Sign in</button>`, true)}
  <main class="wrap">
    <section class="hero">
      ${heroArt()}
      <p class="eyebrow">For creators in Nimiq Pay</p>
      <h1>Sell your files.<br>Get paid in NIM.</h1>
      <p class="lede">Put up presets, e-books, beats, notes, templates or a private link. Share one link. Buyers pay from Nimiq Pay and get it straight away. The money lands in your wallet, and Stall takes nothing.</p>
      <button class="btn primary block lg" id="open">Open your stall</button>
      <p class="fine center">Sign in with your wallet. No email, no password, 0% fees. <a href="/privacy" data-link>Privacy</a></p>
    </section>
    <section id="pulse"></section>
    <section class="steps">
      <div class="step"><b>1</b><div><h3>Add a product</h3><p>A file up to 50 MB, or a link or message that unlocks after payment. Price it in naira, dollars or NIM.</p></div></div>
      <div class="step"><b>2</b><div><h3>Share the link</h3><p>WhatsApp, X, your bio. It opens right inside Nimiq Pay with a proper preview.</p></div></div>
      <div class="step"><b>3</b><div><h3>Earn, then grow it</h3><p>Each sale is checked on-chain before the file unlocks. Stake what you earn with a pool in two taps.</p></div></div>
    </section>
    <section class="compare">
      <h2>Keep what you make</h2>
      <div class="cmp-row"><span>Typical creator platform</span><b>5–10% + payout wait</b></div>
      <div class="cmp-row win"><span>Stall</span><b>0% · lands in seconds</b></div>
    </section>
    <section id="shelf"></section>
  </main>${footer()}`, 'home')
  $('#open').onclick = (e) => doSignIn(e.currentTarget as HTMLButtonElement)
  $('#signin2').onclick = () => doSignIn()
  try {
    const ex = await api('/api/explore')
    if (ex.stats.sales) {
      $('#pulse').innerHTML = `<div class="pulse">
        <div class="pulse-stats"><div><b>${nf(ex.stats.sales)}</b><span>sales</span></div><div><b>${fmtUsd(ex.stats.usd)}</b><span>earned by creators</span></div><div><b>${nf(ex.stats.creators)}</b><span>${ex.stats.creators === 1 ? 'creator' : 'creators'}</span></div></div>
        <ul class="feed">${ex.recent.slice(0, 4).map((r: any) => `<li><a href="/p/${r.productId}" data-link><span class="dot"></span><span class="feed-t"><b>${esc(r.title)}</b> sold for ${esc(r.amount)}</span><span class="muted">${ago(r.at)}</span></a></li>`).join('')}</ul>
      </div>`
    }
    if (ex.products.length) {
      $('#shelf').innerHTML = `<div class="sec-head"><h2>On the shelf</h2><span class="muted">${ex.products.length} ${ex.products.length === 1 ? "item" : "items"}</span></div>
        <div class="grid">${ex.products.map(card).join('')}</div>`
    }
  } catch {}
}

function card(p: any) {
  return `<a class="card" href="/p/${p.id}" data-link>${cover(p)}<div class="card-body"><h3>${esc(p.title)}</h3>
    <div class="card-meta"><span class="price">${fmtPrice(p.price)}${p.pwyw ? '+' : ''}</span>${p.creator ? `<span class="muted">${esc(p.creator.name)}</span>` : p.sold ? `<span class="muted">${p.sold} sold</span>` : ''}</div></div>
    ${p.kind === 'link' ? `<span class="kind-pill">${I.link}</span>` : ''}</a>`
}

function footer() {
  return `<footer class="foot"><p>Stall is open source (MIT). Payments go straight from buyer to creator on the Nimiq blockchain.</p>
  <p><a href="https://github.com/neromtoobad/stall" target="_blank" rel="noopener">GitHub</a> · <a href="/privacy" data-link>Privacy</a> · Built for Nimiq Pay</p></footer>`
}

function chart(daily: { day: number; usd: number; sales: number }[]) {
  const max = Math.max(...daily.map((d) => d.usd), 0.01)
  const w = 100 / daily.length
  const bars = daily.map((d, i) => {
    const h = d.usd ? Math.max(6, (d.usd / max) * 100) : 3
    const label = new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `<g><title>${label}: ${fmtUsd(d.usd)} from ${d.sales} ${d.sales === 1 ? 'sale' : 'sales'}</title>
      <rect x="${i * w + w * 0.18}" y="${100 - h}" width="${w * 0.64}" height="${h}" rx="1.4" class="${d.usd ? 'b' : 'z'}${i === daily.length - 1 ? ' today' : ''}"/></g>`
  }).join('')
  return `<div class="chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Earnings over the last 14 days">${bars}</svg>
    <div class="chart-x"><span>14 days ago</span><span>today</span></div></div>`
}

async function dashboard() {
  const me = await api('/api/me')
  const c = me.creator
  if (!c.name) return go('/setup')
  const t = me.totals
  const stallUrl = origin() + (c.handle ? '/@' + c.handle : '/s/' + c.id)
  const views = me.products.reduce((a: number, p: any) => a + (p.views || 0), 0)
  const sold = me.products.reduce((a: number, p: any) => a + (p.sold || 0), 0)
  const [whole, cents] = fmtUsd(t.usd).split('.')
  render(`<header class="bar">
    <div class="me">${av(c.name)}<div><span class="muted">${greet()}</span><b>${esc(c.name)}</b></div></div>
    <div class="bar-right">${netBadge(me.network)}<button class="icon-btn" id="out" aria-label="Sign out">${I.out}</button></div>
  </header>
  <main class="wrap">
    <section class="balance">
      <div class="bal-top"><span class="label">Total earned</span>
        ${t.weekSales ? `<span class="pill up">${I.up} ${fmtUsd(t.weekUsd)} this week</span>` : `<span class="pill flat">No sales this week</span>`}</div>
      <p class="bal">${whole}${cents ? `<small>.${cents}</small>` : ''}</p>
      <p class="bal-sub">${fmtNim(t.nim)}${t.usdt ? ` · ${nf(t.usdt, 2)} USDT` : ''} · ${t.sales} ${t.sales === 1 ? 'sale' : 'sales'}</p>
      ${chart(me.daily)}
      <div class="actions">
        <a class="act main" href="/new" data-link><i>${I.plus}</i>Add</a>
        <button class="act" id="share-stall"><i>${I.share}</i>Share</button>
        <button class="act act-grow" id="grow"><i>${I.leaf}</i>Grow</button>
        <a class="act" href="/setup" data-link><i>${I.user}</i>Profile</a>
      </div>
    </section>
    <section class="tiles">
      <div class="tile"><span>Page views</span><b>${nf(views)}</b></div>
      <div class="tile"><span>Buy rate</span><b>${views ? Math.round((sold / views) * 100) + '%' : '–'}</b></div>
      <div class="tile"><span>${t.tipsUsd ? 'Tips' : 'Buyers'}</span><b>${t.tipsUsd ? fmtUsd(t.tipsUsd) : nf(t.buyers)}</b></div>
    </section>
    <section id="stake"></section>
    <section>
      <div class="sec-head"><h2>Products</h2><a class="link" href="/new" data-link>${I.plus} New</a></div>
      ${me.products.length ? `<div class="list">${me.products.map((p: any) => `
        <div class="row">
          <a href="/p/${p.id}" data-link class="row-main">${cover(p, 'sm')}<div><h3>${esc(p.title)}</h3>
            <p class="conv">${fmtPrice(p.price)}${p.pwyw ? '+' : ''} · ${p.views ? `${nf(p.views)} ${p.views === 1 ? "view" : "views"} · <b>${p.sold} sold</b>` : 'No views yet'}</p></div></a>
          <a class="icon-btn" href="/edit/${p.id}" data-link aria-label="Edit ${esc(p.title)}">${I.edit}</a>
          <button class="icon-btn" data-share="${p.id}" data-title="${esc(p.title)}" aria-label="Share ${esc(p.title)}">${I.share}</button>
        </div>`).join('')}</div>`
      : `<div class="empty small"><p>Nothing on the shelf yet.</p><a class="btn primary" href="/new" data-link>Add your first product</a></div>`}
    </section>
    <section>
      <div class="sec-head"><h2>Activity</h2><span class="muted small">Paid to <span class="mono">${esc(short(c.address))}</span></span></div>
      ${me.sales.length ? `<div class="list">${me.sales.map((s: any) => `
        <a class="row" href="${s.chain === 'nim' ? nimWatch(s.network, s.tx_hash) : polyScan(s.tx_hash)}" target="_blank" rel="noopener">
          <span class="ric in">${I.inn}</span>
          <div><h3>${esc(s.title)}</h3><p class="muted">${ago(s.paid_at)} · from <span class="mono">${esc(short(s.buyer_address || '', 4))}</span></p></div>
          <span class="amt">+${s.chain === 'nim' ? fmtNim(s.amount_luna / 1e5) : nf(s.amount_usdt / 1e6, 2) + ' USDT'}<small>${fmtUsd(s.usd_value || 0)}</small></span>
        </a>`).join('')}</div>`
      : `<div class="empty small"><p>Sales show up here the moment they confirm on-chain.</p></div>`}
    </section>
  </main>`, 'home')
  $('#out').onclick = () => { store.del('token'); nimiq().then((n) => n?.disconnect?.()); go('/') }
  $('#share-stall').onclick = () => shareSheet(stallUrl, c.name + "'s stall", 'paid in NIM')
  $$<HTMLButtonElement>('[data-share]').forEach((b) => b.onclick = () => shareSheet(origin() + '/p/' + b.dataset.share, b.dataset.title!))
  const staking = stakeCard(c.address, t.nim)
  $('#grow').onclick = async () => {
    const s = await staking
    if (s) stakeSheet(s.info, s.bal, s.existing)
    else toast('Could not load staking right now. Try again soon.', 'err')
  }
}

// ---------- staking: put earnings to work ----------

async function stakeCard(address: string, earnedNim: number) {
  const box = $('#stake')
  if (!box) return null
  let info: any, bal: number | null
  try { [info, bal] = await Promise.all([api('/api/staking'), nimBalance(address)]) } catch { return null }
  const st = info.staker
  const staked = st ? st.active + st.inactive : 0
  const pool = st?.delegation ? info.pools.find((p: any) => p.address.replace(/\s/g, '') === st.delegation.replace(/\s/g, '')) : null
  if (box.isConnected) {
    box.innerHTML = `<div class="grow">
      <div class="grow-ic">${I.leaf}</div>
      <div class="grow-body">
        <h3>${staked ? `${fmtNim(staked)} staked` : 'Put your earnings to work'}</h3>
        <p class="muted">${staked
          ? `Earning network rewards${pool ? ' with ' + esc(pool.name) : ''}. Your NIM stays yours.`
          : `Stake NIM with a pool and collect network rewards. ${bal !== null ? `You hold ${fmtNim(bal)}.` : earnedNim ? `You've earned ${fmtNim(earnedNim)} here.` : ''}`}</p>
      </div>
      <button class="btn sm ${staked ? '' : 'primary'}" id="stake-btn">${staked ? 'Add' : 'Stake'}</button>
    </div>`
    $('#stake-btn').onclick = () => stakeSheet(info, bal, !!st)
  }
  return { info, bal, existing: !!st }
}

function stakeSheet(info: any, bal: number | null, existing: boolean) {
  const pools = info.pools as any[]
  if (!pools.length && !existing) { toast('Could not load staking pools. Try again soon.', 'err'); return }
  const spendable = Math.max(0, (bal || 0) - 1)
  const s = sheet(`<h3>${existing ? 'Add to your stake' : 'Stake with a pool'}</h3>
    <p class="muted small">${existing ? 'This adds NIM to the pool you already stake with.' : 'Pick a pool. Pools share the network rewards with stakers after their fee.'} You can unstake later from Nimiq Pay; it takes up to a day to come back.</p>
    ${existing ? '' : `<div class="pools">${pools.map((p, i) => `<label class="pool"><input type="radio" name="pool" value="${esc(p.address)}" ${i === 0 ? 'checked' : ''}>
      <span class="pool-dot" style="background:${esc(p.color || '#E9B213')}"></span>
      <span class="pool-name"><b>${esc(p.name)}</b><span class="muted">${p.payoutType === 'restake' ? 'rewards restaked' : p.payoutType === 'direct' ? 'rewards paid out' : esc(p.payoutType)}</span></span>
      <span class="pool-fee mono">${nf(p.fee * 100, 1)}% fee</span></label>`).join('')}</div>`}
    <label class="field"><span>Amount <span class="muted">${bal !== null ? `(you hold ${fmtNim(bal)})` : ''}</span></span>
      <div class="amt-in"><input id="stake-amt" inputmode="decimal" placeholder="${existing ? '100' : '1000'}"><span>NIM</span></div></label>
    ${bal ? `<div class="chips">${[0.25, 0.5, 1].map((f) => `<button class="chip" data-f="${f}">${f === 1 ? 'Max' : f * 100 + '%'}</button>`).join('')}</div>` : ''}
    <p class="fine">${existing ? '' : 'A new staker needs at least 1 NIM. '}Your wallet asks you to confirm.</p>
    <button class="btn primary block lg" id="do-stake">Stake</button>`)
  const amt = s.el.querySelector<HTMLInputElement>('#stake-amt')!
  s.el.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => b.onclick = () => { amt.value = String(Math.floor(spendable * Number(b.dataset.f))) })
  s.el.querySelector<HTMLButtonElement>('#do-stake')!.onclick = async (e) => {
    const btn = e.currentTarget as HTMLButtonElement
    const nim = Number(amt.value.replace(/,/g, ''))
    if (!nim || nim < 1) { toast('Enter at least 1 NIM', 'err'); return }
    if (bal !== null && nim > bal) { toast("That's more than you hold", 'err'); return }
    const delegation = s.el.querySelector<HTMLInputElement>('input[name=pool]:checked')?.value || ''
    btn.disabled = true; btn.textContent = 'Confirm in Nimiq Pay…'
    try {
      await stakeNim(delegation, Math.floor(nim * 1e5), existing)
      s.close()
      toast(`Staking ${fmtNim(nim)}. It shows up after the next block.`)
      setTimeout(() => { if (location.pathname === '/') route() }, 6000)
    } catch (er) {
      const w = walletError(er); toast(w.message, w.cancelled ? 'ok' : 'err')
      btn.disabled = false; btn.textContent = 'Stake'
    }
  }
}

// ---------- profile setup ----------

async function setup() {
  if (!store.get('token')) return go('/')
  const me = await api('/api/me')
  const c = me.creator
  render(`${header()}
  <main class="wrap narrow">
    ${c.name ? '' : `<div class="progress"><i class="on"></i><i></i></div>`}
    <p class="eyebrow">${c.name ? 'Profile' : 'Step 1 of 2'}</p>
    <h1>${c.name ? 'Your profile' : 'Name your stall'}</h1>
    <form id="f" class="form">
      <label><span>Display name</span><input name="name" required maxlength="60" value="${esc(c.name)}" placeholder="e.g. Tolu Presets"></label>
      <label><span>Handle <span class="muted">(your stall link)</span></span>
        <div class="prefix"><span>${esc(location.host)}/@</span><input name="handle" maxlength="30" value="${esc(c.handle || '')}" placeholder="tolupresets" autocapitalize="off" autocomplete="off"></div></label>
      <label><span>One line about you <span class="muted">(optional)</span></span><textarea name="bio" maxlength="240" rows="2" placeholder="Lightroom presets shot in Lagos light.">${esc(c.bio)}</textarea></label>
      <div class="box">
        <div><h3>Also take USDT</h3><p class="muted">Buyers can pay in USDT on Polygon. It goes to your Nimiq Pay EVM address.</p></div>
        <div id="usdt">${c.evmAddress ? `<p class="mono small">${esc(c.evmAddress)}</p><button type="button" class="btn sm" id="usdt-off">Turn off</button>` : `<button type="button" class="btn sm" id="usdt-on">Connect USDT address</button>`}</div>
      </div>
      <p class="fine">NIM payments go to <span class="mono">${esc(c.address)}</span>, the wallet you signed in with.</p>
      <button class="btn primary block lg">${c.name ? 'Save' : 'Continue'}</button>
    </form>
  </main>`)
  let evm: string | null | undefined
  const usdtBox = $('#usdt')
  usdtBox.onclick = async (e) => {
    const t = e.target as HTMLElement
    if (t.id === 'usdt-on') {
      try { evm = (await evmAccount()).toLowerCase(); usdtBox.innerHTML = `<p class="mono small">${esc(evm)}</p><p class="ok">Connected. Save to apply.</p>` } catch (er) { toast(walletError(er).message, 'err') }
    } else if (t.id === 'usdt-off') { evm = null; usdtBox.innerHTML = `<p class="muted">USDT off. Save to apply.</p>` }
  }
  $('#f').onsubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target as HTMLFormElement)
    const btn = $<HTMLButtonElement>('#f button.primary')
    btn.disabled = true
    try {
      await api('/api/me', { method: 'PATCH', json: { name: fd.get('name'), handle: fd.get('handle'), bio: fd.get('bio'), ...(evm !== undefined ? { evmAddress: evm } : {}) } })
      if (c.name) { toast('Saved'); go('/') } else go('/new')
    } catch (er: any) { toast(er.message, 'err') } finally { btn.disabled = false }
  }
}

// ---------- new / edit product ----------

let rateCache: { usd: number; ngn: number } | null = null
async function rates() {
  if (!rateCache) { try { rateCache = (await api('/api/config')).rate } catch {} }
  return rateCache
}

function priceFields(p?: any) {
  const cur = p?.price.currency || 'NGN'
  return `<div class="price-row">
    <label class="fill"><span>Price</span><input name="amount" required inputmode="decimal" placeholder="2,000" value="${p ? esc(p.price.amount) : ''}"></label>
    <label><span>In</span><select name="currency">${[['NGN', '₦ naira'], ['USD', '$ dollars'], ['NIM', 'NIM']].map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </div>
  <p class="fine" id="conv">Buyers pay in NIM (or USDT) at the live rate when they check out.</p>
  <label class="toggle"><input type="checkbox" name="pwyw" ${p?.pwyw ? 'checked' : ''}><span class="sw"></span><span><b>Let buyers pay more</b><span class="muted">Fans can add a tip on top of your price.</span></span></label>`
}

function wirePrice(form: HTMLFormElement) {
  const amountIn = form.querySelector<HTMLInputElement>('input[name=amount]')!
  const curIn = form.querySelector<HTMLSelectElement>('select[name=currency]')!
  const upd = async () => {
    const r = await rates()
    const a = Number(amountIn.value.replace(/,/g, ''))
    if (!r || !a) { $('#conv').textContent = 'Buyers pay in NIM (or USDT) at the live rate when they check out.'; return }
    const usd = curIn.value === 'USD' ? a : curIn.value === 'NGN' ? a * (r.usd / r.ngn) : a * r.usd
    $('#conv').innerHTML = `Today that's about <b>${fmtNim(usd / r.usd)}</b> · ${fmtUsd(usd)} · ${fmtNgn(usd * r.ngn / r.usd)}`
  }
  amountIn.oninput = upd; curIn.onchange = upd; upd()
  return amountIn
}

async function newProduct() {
  if (!store.get('token')) {
    render(`${header()}<main class="wrap narrow"><div class="empty"><div class="empty-art" aria-hidden="true">${I.plus}</div><h1>Sell on Stall</h1><p>Sign in with your Nimiq Pay wallet to open your stall. It takes one tap.</p><button class="btn primary lg" id="si">Open your stall</button></div></main>`, 'sell')
    $('#si').onclick = (e) => doSignIn(e.currentTarget as HTMLButtonElement, '/new')
    return
  }
  const me = await api('/api/me')
  if (!me.creator.name) return go('/setup')
  const hasUsdt = !!me.creator.evmAddress
  render(`${header()}
  <main class="wrap narrow">
    ${me.products.length ? '' : `<div class="progress"><i class="on"></i><i class="on"></i></div>`}
    <p class="eyebrow">${me.products.length ? 'New product' : 'Step 2 of 2'}</p>
    <h1>What are you selling?</h1>
    <form id="f" class="form">
      <div class="seg" role="tablist">
        <button type="button" class="on" data-kind="file">${I.file} A file</button>
        <button type="button" data-kind="link">${I.link} A link or message</button>
      </div>
      <input type="hidden" name="kind" value="file">
      <label class="drop" id="drop" data-k="file"><input type="file" name="file" hidden>
        <span class="drop-in"><span class="drop-ic">${I.file}</span><b>Choose the file</b><span class="muted">PDF, ZIP, images, audio, anything up to 50 MB. Buyers get this after paying.</span></span></label>
      <label data-k="link" hidden><span>What buyers unlock <span class="muted">(a private link, code, or message)</span></span>
        <textarea name="secret" rows="3" maxlength="2000" placeholder="https://notion.so/my-course · or a WhatsApp group invite, a discount code, a class link…"></textarea></label>
      <label><span>Name</span><input name="title" required maxlength="90" placeholder="Lagos Golden Hour preset pack"></label>
      <label><span>Describe it <span class="muted">(what's inside, who it's for)</span></span><textarea name="description" rows="4" maxlength="2000" placeholder="12 Lightroom presets tuned for warm skin tones and harmattan haze. Works on mobile and desktop."></textarea></label>
      ${priceFields()}
      ${hasUsdt ? `<label class="toggle"><input type="checkbox" name="acceptUsdt" checked><span class="sw"></span><span><b>Also accept USDT</b><span class="muted">On Polygon, to ${esc(short(me.creator.evmAddress))}</span></span></label>` : ''}
      <label class="drop small" id="cdrop"><input type="file" name="cover" accept="image/*" hidden><span class="drop-in"><b>Add a cover image</b><span class="muted">Optional. We'll make one if you skip it.</span></span></label>
      <button class="btn primary block lg">Put it on the shelf</button>
    </form>
  </main>`, 'sell')
  const form = $<HTMLFormElement>('#f')
  const fileIn = form.querySelector<HTMLInputElement>('input[name=file]')!
  const coverIn = form.querySelector<HTMLInputElement>('input[name=cover]')!
  const kindIn = form.querySelector<HTMLInputElement>('input[name=kind]')!
  $$<HTMLButtonElement>('[data-kind]', form).forEach((b) => b.onclick = () => {
    kindIn.value = b.dataset.kind!
    $$('[data-kind]', form).forEach((x) => x.classList.toggle('on', x === b))
    $$<HTMLElement>('[data-k]', form).forEach((el) => { el.hidden = el.dataset.k !== kindIn.value })
  })
  fileIn.onchange = () => {
    const f = fileIn.files?.[0]
    $('#drop .drop-in').innerHTML = f ? `<span class="drop-ic">${I.file}</span><b>${esc(f.name)}</b><span class="muted">${fmtSize(f.size)} · tap to change</span>` : ''
    $('#drop').classList.toggle('has', !!f)
    const title = form.querySelector<HTMLInputElement>('input[name=title]')!
    if (f && !title.value) { const n = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); title.value = n.charAt(0).toUpperCase() + n.slice(1) }
  }
  coverIn.onchange = () => {
    const f = coverIn.files?.[0]
    if (!f) return
    $('#cdrop .drop-in').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="" class="thumb"><span class="muted">${esc(f.name)} · tap to change</span>`
  }
  const amountIn = wirePrice(form)
  form.onsubmit = async (e) => {
    e.preventDefault()
    if (kindIn.value === 'file' && !fileIn.files?.length) { toast('Choose the file buyers will get', 'err'); return }
    if (kindIn.value === 'link' && !(form.querySelector<HTMLTextAreaElement>('textarea[name=secret]')!.value.trim())) { toast('Add the link or message buyers unlock', 'err'); return }
    const fd = new FormData(form)
    fd.set('amount', String(amountIn.value).replace(/,/g, ''))
    fd.set('acceptUsdt', String(!!form.querySelector<HTMLInputElement>('input[name=acceptUsdt]')?.checked))
    fd.set('pwyw', String(!!form.querySelector<HTMLInputElement>('input[name=pwyw]')?.checked))
    if (!coverIn.files?.length) fd.delete('cover')
    if (kindIn.value !== 'file') fd.delete('file')
    const btn = form.querySelector<HTMLButtonElement>('button.primary')!
    btn.disabled = true; btn.textContent = kindIn.value === 'file' ? 'Uploading…' : 'Saving…'
    try {
      const r = await api('/api/products', { method: 'POST', body: fd })
      go('/p/' + r.product.id + '?new=1')
    } catch (er: any) { toast(er.message, 'err'); btn.disabled = false; btn.textContent = 'Put it on the shelf' }
  }
}

async function editProduct(pid: string) {
  if (!store.get('token')) return go('/')
  loading()
  const { product: p, hasUsdt, } = await api(`/api/products/${pid}/edit`)
  render(`${header(`<a class="link" href="/p/${p.id}" data-link>View</a>`)}
  <main class="wrap narrow">
    <p class="eyebrow">Edit product</p>
    <h1>${esc(p.title)}</h1>
    <form id="f" class="form">
      <label class="drop small" id="cdrop"><input type="file" name="cover" accept="image/*" hidden>
        <span class="drop-in">${p.cover ? `<img src="${esc(p.cover)}" class="thumb" alt="">` : ''}<b>${p.cover ? 'Change cover' : 'Add a cover image'}</b></span></label>
      <label><span>Name</span><input name="title" required maxlength="90" value="${esc(p.title)}"></label>
      <label><span>Description</span><textarea name="description" rows="4" maxlength="2000">${esc(p.description)}</textarea></label>
      ${p.kind === 'link' ? `<label><span>What buyers unlock</span><textarea name="secret" rows="3" maxlength="2000">${esc(p.secret || '')}</textarea></label>`
        : `<div class="file-line">${I.file}<div><b>${esc(p.file?.name || '')}</b><span class="muted">${p.file ? fmtSize(p.file.size) : ''} · to swap the file, add a new product</span></div></div>`}
      ${priceFields(p)}
      ${hasUsdt && p.price.currency !== 'NIM' ? `<label class="toggle"><input type="checkbox" name="acceptUsdt" ${p.acceptUsdt ? 'checked' : ''}><span class="sw"></span><span><b>Also accept USDT</b><span class="muted">On Polygon</span></span></label>` : ''}
      <button class="btn primary block lg">Save changes</button>
      <button type="button" class="link danger center block" id="rm">Take off the shelf</button>
    </form>
  </main>`, 'home')
  const form = $<HTMLFormElement>('#f')
  const amountIn = wirePrice(form)
  const coverIn = form.querySelector<HTMLInputElement>('input[name=cover]')!
  coverIn.onchange = async () => {
    const f = coverIn.files?.[0]
    if (!f) return
    const fd = new FormData(); fd.set('cover', f)
    try { await api(`/api/products/${p.id}/cover`, { method: 'POST', body: fd }); $('#cdrop .drop-in').innerHTML = `<img src="${URL.createObjectURL(f)}" class="thumb" alt=""><b>Cover updated</b>`; toast('Cover updated') }
    catch (er: any) { toast(er.message, 'err') }
  }
  form.onsubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    const btn = form.querySelector<HTMLButtonElement>('button.primary')!
    btn.disabled = true
    try {
      await api('/api/products/' + p.id, { method: 'PATCH', json: {
        title: fd.get('title'), description: fd.get('description'), amount: String(amountIn.value).replace(/,/g, ''), currency: fd.get('currency'),
        pwyw: !!form.querySelector<HTMLInputElement>('input[name=pwyw]')?.checked,
        ...(form.querySelector('input[name=acceptUsdt]') ? { acceptUsdt: !!form.querySelector<HTMLInputElement>('input[name=acceptUsdt]')!.checked } : {}),
        ...(p.kind === 'link' ? { secret: fd.get('secret') } : {}),
      } })
      toast('Saved'); go('/p/' + p.id)
    } catch (er: any) { toast(er.message, 'err') } finally { btn.disabled = false }
  }
  $('#rm').onclick = async () => {
    if (!confirm('Take this off the shelf? Past buyers keep their downloads.')) return
    try { await api('/api/products/' + p.id, { method: 'DELETE' }); toast('Removed'); go('/') } catch (er: any) { toast(er.message, 'err') }
  }
}

// ---------- product page + checkout ----------

async function productPage(pid: string) {
  loading()
  const { product: p, creator: c, quote: q } = await api('/api/products/' + pid)
  const isNew = new URLSearchParams(location.search).has('new')
  const link = origin() + '/p/' + p.id
  const mine = store.get('token') ? await api('/api/me').then((m) => m.creator.id === c.id).catch(() => false) : false
  const stallHref = c.handle ? '/@' + c.handle : '/s/' + c.id
  const priceLine = q ? (p.price.currency === 'NIM' ? `≈ ${fmtUsd(q.usd)} · ${fmtNgn(q.ngn)}` : `≈ ${fmtNim(q.nim)}${p.price.currency !== 'USD' ? ' · ' + fmtUsd(q.usd) : ''}${p.price.currency !== 'NGN' ? ' · ' + fmtNgn(q.ngn) : ''}`) : ''
  render(`${header(mine ? `<a class="btn sm" href="/edit/${p.id}" data-link>${I.edit} Edit</a>` : `<button class="icon-btn" data-share aria-label="Share">${I.share}</button>`)}
  <main class="wrap product ${p.active && !mine ? 'with-buybar' : ''}">
    ${isNew ? `<div class="notice"><b>It's live.</b> Share this link and you'll see each sale on your dashboard.<div class="notice-actions"><button class="btn sm primary" data-share>${I.share} Share</button><a class="btn sm" href="/" data-link>Dashboard</a></div></div>` : ''}
    ${cover(p, 'hero')}
    <div class="p-head">
      <div><h1>${esc(p.title)}</h1>
      <a class="by" href="${stallHref}" data-link>${av(c.name)}<span>by <b>${esc(c.name)}</b></span></a></div>
      ${netBadge(p.network)}
    </div>
    <div class="price-box">
      <div><span class="big-price">${fmtPrice(p.price)}${p.pwyw ? '<small>+</small>' : ''}</span><span class="muted">${priceLine}</span></div>
      ${p.sold ? `<span class="sold">${nf(p.sold)} sold</span>` : ''}
    </div>
    ${!p.active ? `<div class="notice warn">The creator took this off the shelf.</div>` : ''}
    ${p.description ? `<section class="desc"><h2>About this</h2><p>${linkify(p.description)}</p></section>` : ''}
    <section class="file-line">${p.kind === 'link' ? I.link : I.file}<div>${p.kind === 'link'
      ? `<b>A private link or message</b><span class="muted">Revealed on your receipt right after payment</span>`
      : `<b>${esc(p.file?.name || 'File')}</b><span class="muted">${p.file ? fmtSize(p.file.size) + ' · ' : ''}instant download after payment</span>`}</div></section>
    <section class="trust">${I.shield}
      <p><b>Paid straight to the creator.</b> Your payment goes to <span class="mono">${esc(short(c.address))}</span>, and Stall checks it on the Nimiq blockchain before unlocking. No fees.</p>
    </section>
    ${!inNimiqPay() && !mine && p.active ? `<div class="center row-actions"><button class="btn sm" data-manual>Pay from another wallet</button></div>` : ''}
    ${mine ? `<div class="notice">This is your product. Buyers see a pay button here.</div>` : ''}
  </main>
  ${p.active && !mine ? `<div class="buybar" id="buybar">
    <div class="bb-price"><b>${fmtPrice(p.price)}${p.pwyw ? '+' : ''}</b><span class="muted mono">${q ? (p.price.currency === 'NIM' ? '≈ ' + fmtUsd(q.usd) : fmtNim(q.nim)) : ''}</span></div>
    <button class="btn primary lg" id="buy">Buy now</button>
  </div>` : ''}`)

  $$<HTMLButtonElement>('[data-share]').forEach((b) => b.onclick = () => shareSheet(link, p.title, fmtPrice(p.price)))
  const man = app.querySelector<HTMLButtonElement>('[data-manual]')
  if (man) man.onclick = () => manualPay(p)
  const buy = document.getElementById('buy') as HTMLButtonElement | null
  if (buy) buy.onclick = async () => {
    if (!(await nimiq())) { openOutsideSheet('/p/' + p.id); return }
    if (!p.pwyw && !p.acceptUsdt) return checkout(p, 'nim', 0)
    checkoutSheet({ ...p, creator: c }, q)
  }
}

function checkoutSheet(p: any, q: any) {
  let tip = 0
  const tips = q ? [0, Math.max(0.5, Math.round(q.usd * 0.5 * 2) / 2), Math.max(1, Math.round(q.usd * 2) / 2)] : [0]
  const s = sheet(`<h3>${esc(p.title)}</h3>
    ${p.pwyw && q ? `<p class="muted small">Want to tip ${esc(p.creator?.name || 'the creator')}? It all goes to them.</p>
      <div class="chips" id="tips">${tips.map((t, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-tip="${t}">${t ? '+' + fmtUsd(t) : 'No tip'}</button>`).join('')}<button class="chip" data-tip="custom">Other</button></div>
      <div class="amt-in" id="tip-custom" hidden><span>+$</span><input inputmode="decimal" placeholder="5"></div>` : ''}
    <div class="total"><span>Total</span><b id="tot">${q ? fmtNim(q.nim) : fmtPrice(p.price)}</b></div>
    <button class="btn primary block lg pay-btn" data-pay="nim"><span>Pay with NIM</span><span class="num" id="tot-nim">${q ? fmtNim(q.nim) : ''}</span></button>
    ${p.acceptUsdt ? `<button class="btn ghost block pay-btn" data-pay="usdt"><span>Pay with USDT</span><span class="num" id="tot-usdt">${q ? nf(q.usd, 2) + ' USDT' : ''}</span></button>
      <p class="fine center">USDT goes over Polygon, so keep a little POL for gas.</p>` : ''}`)
  const upd = () => {
    if (!q) return
    const usd = q.usd + tip, nim = q.nim + tip / q.rate.usd
    s.el.querySelector('#tot')!.textContent = `${fmtNim(nim)} · ${fmtUsd(usd)}`
    s.el.querySelector('#tot-nim')!.textContent = fmtNim(nim)
    const tu = s.el.querySelector('#tot-usdt'); if (tu) tu.textContent = nf(usd, 2) + ' USDT'
  }
  s.el.querySelectorAll<HTMLButtonElement>('[data-tip]').forEach((b) => b.onclick = () => {
    s.el.querySelectorAll('[data-tip]').forEach((x) => x.classList.toggle('on', x === b))
    const custom = s.el.querySelector<HTMLElement>('#tip-custom')!
    custom.hidden = b.dataset.tip !== 'custom'
    if (b.dataset.tip === 'custom') { const i = custom.querySelector('input')!; i.focus(); i.oninput = () => { tip = Math.max(0, Number(i.value.replace(/,/g, '')) || 0); upd() } }
    else tip = Number(b.dataset.tip)
    upd()
  })
  s.el.querySelectorAll<HTMLButtonElement>('[data-pay]').forEach((b) => b.onclick = () => { s.close(); checkout(p, b.dataset.pay as 'nim' | 'usdt', tip) })
}

async function createOrder(p: any, chain: 'nim' | 'usdt', tipUsd = 0) {
  const r = await api('/api/orders', { method: 'POST', json: { productId: p.id, chain, tipUsd } })
  receipts.add({ id: r.order.id, key: r.order.key, title: p.title, at: Date.now() })
  return r.order
}

async function checkout(p: any, chain: 'nim' | 'usdt', tipUsd: number) {
  if (chain === 'nim' && p.network !== network()) {
    toast(`This item is on ${p.network}. Switch Nimiq Pay to ${p.network} to buy it.`, 'err'); return
  }
  const bar = $('#buybar')
  const btn = $<HTMLButtonElement>('#buy')
  btn.disabled = true; btn.textContent = 'Confirm in wallet…'
  try {
    const order = await createOrder(p, chain, tipUsd)
    const hash = chain === 'nim'
      ? await payNim(order.payTo, order.luna, order.memo)
      : await payUsdt(order.payTo, BigInt(order.usdtUnits))
    await waitForPayment(order, hash, bar)
  } catch (e) {
    const w = walletError(e)
    toast(w.message, w.cancelled ? 'ok' : 'err')
    btn.disabled = false; btn.textContent = 'Buy now'
  }
}

async function waitForPayment(order: any, hash: string, host: HTMLElement) {
  host.classList.add('busy')
  host.innerHTML = `<div class="checking"><div class="spinner"></div><div><b>Payment sent</b><p class="muted small" id="ck">Checking it on-chain. This takes a few seconds.</p></div></div>`
  const started = Date.now()
  while (Date.now() - started < 3 * 60_000) {
    try {
      const r = await api(`/api/orders/${order.id}/claim`, { method: 'POST', json: { key: order.key, hash } })
      if (r.state === 'paid') { go(`/r/${order.id}?k=${order.key}&fresh=1`); return }
      if (r.state === 'invalid') {
        host.innerHTML = `<div class="notice warn"><b>That payment doesn't match.</b> ${esc(r.reason)}<br><span class="muted small">Order ${esc(order.id)}. Keep this page, or contact the creator.</span></div>`
        return
      }
      const ck = document.getElementById('ck'); if (ck && r.reason) ck.textContent = r.reason
    } catch {}
    await sleep(2500)
  }
  host.innerHTML = `<div class="notice warn"><b>Still waiting for the network.</b> Your receipt is saved in <a href="/purchases" data-link>Purchases</a>; it unlocks once the payment confirms.</div>`
}

async function manualPay(p: any) {
  const s = sheet(`<div class="checking plain"><div class="spinner"></div><p class="muted">Getting today's price…</p></div>`)
  let order: any
  try { order = await createOrder(p, 'nim') } catch (e: any) { s.el.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; return }
  const nim = order.luna / 1e5
  s.el.innerHTML = `<div class="grab"></div><h3>Pay from any Nimiq wallet</h3>
    <div class="kv"><span>Amount</span><b class="mono">${nf(nim, 5)} NIM</b><button class="link" data-c="${nim}">copy</button></div>
    <div class="kv"><span>To</span><b class="mono">${esc(order.payTo)}</b><button class="link" data-c="${esc(order.payTo)}">copy</button></div>
    <div class="kv"><span>Message</span><b class="mono">${esc(order.memo)}</b><button class="link" data-c="${esc(order.memo)}">copy</button></div>
    <p class="fine">The message matters: it's how Stall knows the payment is yours. Price held for 20 minutes.</p>
    <label class="field">Then paste the transaction hash<input id="hash" placeholder="e.g. 57dab851a5f7…" autocomplete="off" autocapitalize="off"></label>
    <button class="btn primary block" id="check">Check my payment</button>
    <div id="mres"></div>`
  s.el.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => b.onclick = () => copy(b.dataset.c!, 'Copied'))
  s.el.querySelector<HTMLButtonElement>('#check')!.onclick = () => {
    const h = s.el.querySelector<HTMLInputElement>('#hash')!.value.trim()
    if (h) waitForPayment(order, h, s.el.querySelector('#mres')!)
  }
}

// ---------- receipt ----------

async function receiptPage(oid: string) {
  const k = new URLSearchParams(location.search).get('k') || receipts.list().find((r) => r.id === oid)?.key || ''
  loading()
  const { order: o, product: p, creator: c, secret } = await api(`/api/orders/${oid}?k=${encodeURIComponent(k)}`)
  receipts.add({ id: o.id, key: o.key, title: p.title, at: o.paidAt || Date.now() })
  const fresh = new URLSearchParams(location.search).has('fresh')
  const dl = `/api/download/${o.id}?k=${encodeURIComponent(o.key)}`
  const viewable = p.file && /^(image\/|application\/pdf|audio\/|video\/|text\/)/.test(p.file.mime)
  const paid = o.status === 'paid'
  const amount = o.chain === 'nim' ? nf(o.luna / 1e5, 2) + ' NIM' : nf(o.usdtUnits / 1e6, 2) + ' USDT'
  render(`${header()}
  <main class="wrap narrow">
    <section class="success">
      <div class="check-ring ${paid ? '' : 'wait'}">${paid ? I.check : I.clock}</div>
      <p class="muted">${paid ? (fresh ? 'Payment confirmed' : 'Paid') : 'Waiting for payment'}</p>
      <p class="sum">${amount}</p>
      <p class="muted">${fmtUsd(o.usd)} to ${esc(c.name)}</p>
    </section>
    <div class="slot ${fresh ? 'print' : ''}"><article class="receipt ${paid ? 'paid' : ''}">
      <div class="r-top">${MARK}<div><b>Stall receipt</b><span class="mono">#${esc(o.id)}</span></div>${paid ? `<span class="stamp">Paid</span>` : `<span class="stamp pending">Pending</span>`}</div>
      <div class="r-item">${cover(p, 'sm')}<div><h3>${esc(p.title)}</h3><p class="muted">from ${esc(c.name)}</p></div></div>
      <dl class="r-lines">
        <div><dt>Amount</dt><dd>${amount}</dd></div>
        <div><dt>Value</dt><dd>${fmtUsd(o.usd)}</dd></div>
        ${o.tipUsd ? `<div><dt>Includes tip</dt><dd>${fmtUsd(o.tipUsd)}</dd></div>` : ''}
        <div><dt>Fee</dt><dd>None</dd></div>
        ${o.buyer ? `<div><dt>From</dt><dd class="mono">${esc(short(o.buyer, 6))}</dd></div>` : ''}
        <div><dt>To</dt><dd class="mono">${esc(short(o.payTo, 6))}</dd></div>
        ${o.paidAt ? `<div><dt>Date</dt><dd>${new Date(o.paidAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd></div>` : ''}
        ${o.txHash ? `<div><dt>On-chain</dt><dd><a class="mono" target="_blank" rel="noopener" href="${o.chain === 'nim' ? nimWatch(o.network, o.txHash) : polyScan(o.txHash)}">${esc(short(o.txHash, 6))}</a></dd></div>` : ''}
      </dl>
      <div class="zig" aria-hidden="true"></div>
    </article></div>
    ${!paid ? `<div class="notice">This payment hasn't confirmed yet. <a href="/p/${p.id}" data-link>Back to the product</a></div>`
      : p.kind === 'link' ? `<section class="secret"><p class="label">${I.key} Your unlock</p><div class="secret-body">${linkify(secret || '')}</div>
          <button class="btn ghost sm" id="cs">${I.copy} Copy</button></section>`
      : `<a class="btn primary block lg" href="${dl}" download>Download the file</a>
         <p class="fine center">${esc(p.file?.name || '')}${p.file ? ' · ' + fmtSize(p.file.size) : ''}</p>
         ${viewable ? `<a class="btn block" href="${dl}&view=1" target="_blank" rel="noopener">Open it here</a>` : ''}
         <button class="link center block" id="cp">Copy download link (open it in your browser)</button>`}
    ${paid ? `<p class="fine center">Saved under Purchases on this device. On a new phone, recover it with your wallet.</p>
      <div class="center"><a class="link" href="${c.handle ? '/@' + c.handle : '/s/' + c.id}" data-link>More from ${esc(c.name)} ${I.chev}</a></div>` : ''}
  </main>`, 'buy')
  const cp = document.getElementById('cp'); if (cp) cp.onclick = () => copy(origin() + dl, 'Download link copied')
  const cs = document.getElementById('cs'); if (cs) cs.onclick = () => copy(secret || '', 'Copied')
  if (fresh) confetti()
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const box = document.createElement('div')
  box.className = 'confetti'
  box.innerHTML = Array.from({ length: 22 }, (_, i) => `<i style="--x:${(Math.random() * 2 - 1) * 160}px;--r:${Math.random() * 540}deg;--d:${0.6 + Math.random() * 0.6}s;--c:${['#E9B213', '#1F2348', '#13A05F', '#BFC3D9'][i % 4]};left:${45 + Math.random() * 10}%"></i>`).join('')
  document.body.appendChild(box)
  setTimeout(() => box.remove(), 1800)
}

async function purchasesPage() {
  const list = receipts.list()
  render(`${header()}
  <main class="wrap narrow">
    <h1>Purchases</h1>
    ${list.length ? `<div class="list">${list.map((r) => `<a class="row" href="/r/${r.id}?k=${encodeURIComponent(r.key)}" data-link><span class="ric">${I.bag}</span><div><h3>${esc(r.title)}</h3><p class="muted">${ago(r.at)} · #${esc(r.id)}</p></div><span class="chev">${I.chev}</span></a>`).join('')}</div>`
      : `<div class="empty small"><p>Things you buy on Stall show up here.</p></div>`}
    <div class="box">
      <div><h3>New phone?</h3><p class="muted">Sign with the wallet you paid from and we'll bring back every receipt.</p></div>
      <button class="btn sm" id="recover">Recover with my wallet</button>
    </div>
  </main>`, 'buy')
  $('#recover').onclick = async (e) => {
    const btn = e.currentTarget as HTMLButtonElement
    if (!(await nimiq())) { openOutsideSheet('/purchases'); return }
    btn.disabled = true; btn.textContent = 'Check Nimiq Pay…'
    try {
      const sig = await walletSignature()
      const r = await api('/api/purchases/recover', { method: 'POST', json: sig })
      receipts.merge(r.receipts)
      toast(r.receipts.length ? `Found ${r.receipts.length} ${r.receipts.length === 1 ? 'purchase' : 'purchases'}` : 'No purchases from this wallet yet')
      purchasesPage()
    } catch (er) {
      const w = walletError(er); toast(w.message, w.cancelled ? 'ok' : 'err')
      btn.disabled = false; btn.textContent = 'Recover with my wallet'
    }
  }
}

// ---------- creator stall page ----------

async function stallPage(key: string) {
  loading()
  const { creator: c, products, sold } = await api('/api/stall/' + key)
  const hue = hueOf(c.name)
  const url = origin() + (c.handle ? '/@' + c.handle : '/s/' + c.id)
  render(`${header()}
  <div class="stall-banner" style="--h:${hue}"></div>
  <main class="wrap stall">
    <section class="stall-head"><div class="avatar" style="--h:${hue}">${esc(c.name.slice(0, 1).toUpperCase())}</div>
      <div><h1>${esc(c.name)}</h1>${c.handle ? `<p class="muted">@${esc(c.handle)}</p>` : ''}</div>
      <button class="icon-btn" id="sh" aria-label="Share stall">${I.share}</button></section>
    ${c.bio ? `<p class="lede">${esc(c.bio)}</p>` : ''}
    <div class="stall-stats"><span><b>${products.length}</b> ${products.length === 1 ? 'product' : 'products'}</span>${sold ? `<span><b>${nf(sold)}</b> sold</span>` : ''}<span>Paid in NIM${c.acceptsUsdt ? ' or USDT' : ''}</span></div>
    ${products.length ? `<div class="grid">${products.map(card).join('')}</div>` : `<div class="empty small"><p>The shelf is empty for now.</p></div>`}
  </main>${footer()}`, 'home')
  $('#sh').onclick = () => shareSheet(url, c.name + "'s stall", 'paid in NIM')
}

route()
