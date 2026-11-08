import './style.css'
import { installDevWallet } from './devwallet'
if (import.meta.env.DEV) installDevWallet()
import { nimiq, inNimiqPay, network, walletError, signIn, payNim, payUsdt, evmAccount } from './wallet'

// ---------- tiny utils ----------

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
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
const short = (a: string, n = 4) => a.length > 14 ? a.replace(/\s/g, '').slice(0, n + 2) + '…' + a.replace(/\s/g, '').slice(-n) : a
const nimWatch = (net: string, hash: string) => `https://${net === 'testnet' ? 'test.' : ''}nimiq.watch/#${hash}`
const polyScan = (hash: string) => `https://polygonscan.com/tx/${hash}`
const origin = () => location.origin
const openInPay = (path: string) => `https://nimpay.app/miniapps/open/${location.host}${path}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function api<T = any>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string> || {}) }
  const token = store.get('token')
  if (token) headers.authorization = 'Bearer ' + token
  let body = opts.body
  if (opts.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.json) }
  let res: Response
  try { res = await fetch(path, { ...opts, headers, body }) } catch { throw new Error('No connection to Stall. Check your internet and try again.') }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && token) { store.del('token') }
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status })
  return data
}

function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t = document.createElement('div')
  t.className = 'toast ' + kind
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.classList.add('out'), 2600)
  setTimeout(() => t.remove(), 3000)
}

async function copy(text: string, label = 'Link copied') {
  try { await navigator.clipboard.writeText(text); toast(label) } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); toast(label) } catch { toast('Could not copy', 'err') }
    ta.remove()
  }
}

async function share(url: string, title: string) {
  if (navigator.share) { try { await navigator.share({ url, title }); return } catch { /* cancelled */ } }
  copy(url)
}

// receipts the buyer owns, kept on this device
type Saved = { id: string; key: string; title: string; at: number }
const receipts = {
  list(): Saved[] { try { return JSON.parse(store.get('receipts') || '[]') } catch { return [] } },
  add(r: Saved) { const l = receipts.list().filter((x) => x.id !== r.id); l.unshift(r); store.set('receipts', JSON.stringify(l.slice(0, 50))) },
}

// ---------- shared chrome ----------

const awning = `<div class="awning" aria-hidden="true"></div>`
function header(right = '') {
  return `${awning}<header class="bar"><a href="/" class="logo" data-link><span class="logo-mark">S</span>Stall</a><div class="bar-right">${right}</div></header>`
}
const netBadge = (net: string) => net === 'testnet' ? `<span class="badge test">Testnet</span>` : ''

function cover(p: { cover: string | null; title: string; hue: number }, cls = '') {
  if (p.cover) return `<div class="cover ${cls}"><img src="${esc(p.cover)}" alt="" loading="lazy"></div>`
  const init = esc(p.title.trim().slice(0, 1).toUpperCase() || 'S')
  return `<div class="cover gen ${cls}" style="--h:${p.hue}"><span>${init}</span></div>`
}

function render(html: string) {
  app.innerHTML = html
  window.scrollTo(0, 0)
}

// ---------- router ----------

const routes: [RegExp, (m: RegExpMatchArray) => void | Promise<void>][] = [
  [/^\/$/, () => home()],
  [/^\/new$/, () => newProduct()],
  [/^\/setup$/, () => setup()],
  [/^\/p\/([A-Za-z0-9]+)$/, (m) => productPage(m[1])],
  [/^\/r\/([A-Za-z0-9]+)$/, (m) => receiptPage(m[1])],
  [/^\/@([A-Za-z0-9_]+)$/, (m) => stallPage(m[1])],
  [/^\/s\/([A-Za-z0-9]+)$/, (m) => stallPage(m[1])],
  [/^\/purchases$/, () => purchasesPage()],
]

let navToken = 0
async function route() {
  const t = ++navToken
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
export function go(path: string) { history.pushState(null, '', path); route() }
window.addEventListener('popstate', route)
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-link]') as HTMLAnchorElement | null
  if (a && a.origin === location.origin && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.pathname + a.search) }
})

function errorPage(msg: string) {
  render(`${header()}<main class="wrap"><div class="empty"><h1>Hmm.</h1><p>${esc(msg)}</p><a class="btn" href="/" data-link>Back to Stall</a></div></main>`)
}

function loading() { render(`${header()}<main class="wrap"><div class="skeleton"></div><div class="skeleton short"></div></main>`) }

// ---------- sign in ----------

async function doSignIn(btn?: HTMLButtonElement) {
  if (!inNimiqPay() && !(await nimiq())) { openOutsideSheet('/'); return false }
  const label = btn?.innerHTML
  if (btn) { btn.disabled = true; btn.innerHTML = 'Check Nimiq Pay…' }
  try {
    const ch = await api('/api/auth/challenge')
    const signed = await signIn(ch.message)
    const r = await api('/api/auth/verify', { method: 'POST', json: { nonce: ch.nonce, publicKey: signed.publicKey, signature: signed.signature, network: network() } })
    store.set('token', r.token)
    go(r.isNew ? '/setup' : '/')
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
  const url = openInPay(path)
  const sheet = document.createElement('div')
  sheet.className = 'sheet-bg'
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-label="Open in Nimiq Pay">
    <h3>Stall lives inside Nimiq Pay</h3>
    <p>Your wallet does the signing and paying, so Stall never touches your keys. Open this page in the Nimiq Pay app on your phone.</p>
    <a class="btn primary block" href="${esc(url)}">Open in Nimiq Pay</a>
    <button class="btn ghost block" data-copy>Copy link</button>
    <p class="fine">No Nimiq Pay yet? It's free on the App Store and Google Play.</p>
  </div>`
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.remove()
    if ((e.target as HTMLElement).closest('[data-copy]')) { copy(origin() + path); sheet.remove() }
  })
  document.body.appendChild(sheet)
}

// ---------- home: landing or dashboard ----------

async function home() {
  if (store.get('token')) {
    try { return await dashboard() } catch (e: any) { if (e.status !== 401) throw e }
  }
  return landing()
}

async function landing() {
  render(`${header(`<a class="link" href="/purchases" data-link>My purchases</a>`)}
  <main class="wrap">
    <section class="hero">
      <p class="eyebrow">For creators in Nimiq Pay</p>
      <h1>Sell your files.<br>Get paid in NIM.</h1>
      <p class="lede">Put up presets, e-books, beats, templates or notes. Share one link. Buyers pay from Nimiq Pay and get the file straight away. The money lands in your wallet, and Stall takes nothing.</p>
      <button class="btn primary block lg" id="open">Open your stall</button>
      <p class="fine center">Sign in with your wallet. No email, no password.</p>
    </section>
    <section class="steps">
      <div class="step"><b>1</b><div><h3>Add a product</h3><p>Upload the file, set a price in naira, dollars or NIM.</p></div></div>
      <div class="step"><b>2</b><div><h3>Share the link</h3><p>WhatsApp, X, your bio. It opens right inside Nimiq Pay.</p></div></div>
      <div class="step"><b>3</b><div><h3>Earn on every sale</h3><p>Payments go wallet to wallet, checked on-chain before the file unlocks.</p></div></div>
    </section>
    <section id="shelf"></section>
  </main>${footer()}`)
  $('#open').onclick = (e) => doSignIn(e.currentTarget as HTMLButtonElement)
  try {
    const ex = await api('/api/explore')
    if (ex.products.length) {
      $('#shelf').innerHTML = `<div class="sec-head"><h2>On the shelf</h2>${ex.stats.sales ? `<span class="muted">${nf(ex.stats.sales)} sold so far</span>` : ''}</div>
        <div class="grid">${ex.products.map(card).join('')}</div>`
    }
  } catch {}
}

function card(p: any) {
  return `<a class="card" href="/p/${p.id}" data-link>${cover(p)}<div class="card-body"><h3>${esc(p.title)}</h3>
    <div class="card-meta"><span class="price">${fmtPrice(p.price)}</span>${p.creator ? `<span class="muted">${esc(p.creator.name)}</span>` : ''}</div></div></a>`
}

function footer() {
  return `<footer class="foot"><p>Stall is open source (MIT). Payments go straight from buyer to creator on the Nimiq blockchain.</p>
  <p><a href="https://github.com/neromtoobad/stall" target="_blank" rel="noopener">GitHub</a> · Built for Nimiq Pay</p></footer>`
}

async function dashboard() {
  const me = await api('/api/me')
  const c = me.creator
  if (!c.name) return go('/setup')
  const t = me.totals
  const stallUrl = origin() + (c.handle ? '/@' + c.handle : '/s/' + c.id)
  render(`${header(`<button class="link" id="out">Sign out</button>`)}
  <main class="wrap">
    <div class="hello"><div><p class="eyebrow">Your stall ${netBadge(me.network)}</p><h1>${esc(c.name)}</h1></div>
      <button class="chip" id="share-stall">Share stall</button></div>
    <section class="earn">
      <p class="label">Earned so far</p>
      <p class="big">${fmtUsd(t.usd)}</p>
      <div class="earn-row">
        <div><span class="num">${fmtNim(t.nim)}</span><span class="muted">in NIM</span></div>
        ${t.usdt ? `<div><span class="num">${nf(t.usdt, 2)} USDT</span><span class="muted">on Polygon</span></div>` : ''}
        <div><span class="num">${t.sales}</span><span class="muted">${t.sales === 1 ? 'sale' : 'sales'}</span></div>
        <div><span class="num">${t.buyers}</span><span class="muted">${t.buyers === 1 ? 'buyer' : 'buyers'}</span></div>
      </div>
      ${t.weekSales ? `<p class="week">+${fmtUsd(t.weekUsd)} from ${t.weekSales} ${t.weekSales === 1 ? 'sale' : 'sales'} this week</p>` : `<p class="week">Every sale lands in <span class="mono">${esc(short(c.address))}</span></p>`}
    </section>
    <a class="btn primary block lg" href="/new" data-link>+ Add a product</a>
    <section>
      <div class="sec-head"><h2>Products</h2><span class="muted">${me.products.length}</span></div>
      ${me.products.length ? `<div class="list">${me.products.map((p: any) => `
        <div class="row">
          <a href="/p/${p.id}" data-link class="row-main">${cover(p, 'sm')}<div><h3>${esc(p.title)}</h3><p class="muted">${fmtPrice(p.price)} · ${p.sold} sold${p.acceptUsdt ? ' · USDT on' : ''}</p></div></a>
          <button class="icon-btn" data-share="${p.id}" data-title="${esc(p.title)}" aria-label="Share ${esc(p.title)}">↗</button>
        </div>`).join('')}</div>`
      : `<div class="empty small"><p>Nothing on the shelf yet. Add your first product, then share the link wherever your people are.</p></div>`}
    </section>
    <section>
      <div class="sec-head"><h2>Recent sales</h2></div>
      ${me.sales.length ? `<div class="list">${me.sales.map((s: any) => `
        <a class="row sale" href="${s.chain === 'nim' ? nimWatch(s.network, s.tx_hash) : polyScan(s.tx_hash)}" target="_blank" rel="noopener">
          <div><h3>${esc(s.title)}</h3><p class="muted mono">${esc(short(s.buyer_address || ''))} · ${ago(s.paid_at)}</p></div>
          <span class="amt">+${s.chain === 'nim' ? fmtNim(s.amount_luna / 1e5) : nf(s.amount_usdt / 1e6, 2) + ' USDT'}</span>
        </a>`).join('')}</div>`
      : `<div class="empty small"><p>Sales show up here the moment they confirm on-chain.</p></div>`}
    </section>
    <section class="settings-link"><a href="/setup" data-link class="link">Edit profile and payout options</a> · <a href="/purchases" data-link class="link">My purchases</a></section>
  </main>${footer()}`)
  $('#out').onclick = () => { store.del('token'); nimiq().then((n) => n?.disconnect?.()); go('/') }
  $('#share-stall').onclick = () => share(stallUrl, c.name + "'s stall")
  app.querySelectorAll<HTMLButtonElement>('[data-share]').forEach((b) => b.onclick = () => share(origin() + '/p/' + b.dataset.share, b.dataset.title!))
}

// ---------- profile setup ----------

async function setup() {
  if (!store.get('token')) return go('/')
  const me = await api('/api/me')
  const c = me.creator
  render(`${header()}
  <main class="wrap narrow">
    <p class="eyebrow">${c.name ? 'Profile' : 'Step 1 of 2'}</p>
    <h1>${c.name ? 'Your profile' : 'Name your stall'}</h1>
    <form id="f" class="form">
      <label>Display name<input name="name" required maxlength="60" value="${esc(c.name)}" placeholder="e.g. Tolu Presets"></label>
      <label><span>Handle <span class="muted">(your stall link)</span></span>
        <div class="prefix"><span>${esc(location.host)}/@</span><input name="handle" maxlength="30" value="${esc(c.handle || '')}" placeholder="tolupresets" autocapitalize="off" autocomplete="off"></div></label>
      <label><span>One line about you <span class="muted">(optional)</span></span><textarea name="bio" maxlength="240" rows="2" placeholder="Lightroom presets shot in Lagos light.">${esc(c.bio)}</textarea></label>
      <div class="box">
        <div class="box-head"><div><h3>Also take USDT</h3><p class="muted">Buyers can pay in USDT on Polygon. It goes to your Nimiq Pay EVM address.</p></div></div>
        <div id="usdt">${c.evmAddress ? `<p class="mono small">${esc(c.evmAddress)}</p><button type="button" class="btn ghost sm" id="usdt-off">Turn off</button>` : `<button type="button" class="btn ghost sm" id="usdt-on">Connect USDT address</button>`}</div>
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
      go(c.name ? '/' : '/new')
    } catch (er: any) { toast(er.message, 'err') } finally { btn.disabled = false }
  }
}

// ---------- new product ----------

let rateCache: { usd: number; ngn: number } | null = null
async function rates() {
  if (!rateCache) { try { rateCache = (await api('/api/config')).rate } catch {} }
  return rateCache
}

async function newProduct() {
  if (!store.get('token')) return go('/')
  const me = await api('/api/me')
  const hasUsdt = !!me.creator.evmAddress
  render(`${header()}
  <main class="wrap narrow">
    <p class="eyebrow">${me.products.length ? 'New product' : 'Step 2 of 2'}</p>
    <h1>What are you selling?</h1>
    <form id="f" class="form">
      <label class="drop" id="drop"><input type="file" name="file" required hidden>
        <span class="drop-in"><b>Choose the file</b><span class="muted">PDF, ZIP, images, audio, anything up to 50 MB. Buyers get this after paying.</span></span></label>
      <label>Name<input name="title" required maxlength="90" placeholder="Lagos Golden Hour preset pack"></label>
      <label><span>Describe it <span class="muted">(what's inside, who it's for)</span></span><textarea name="description" rows="4" maxlength="2000" placeholder="12 Lightroom presets tuned for warm skin tones and harmattan haze. Works on mobile and desktop."></textarea></label>
      <div class="price-row">
        <label class="grow">Price<input name="amount" required inputmode="decimal" placeholder="2,000"></label>
        <label>In<select name="currency"><option value="NGN">₦ naira</option><option value="USD">$ dollars</option><option value="NIM">NIM</option></select></label>
      </div>
      <p class="fine" id="conv">Buyers always pay in NIM (or USDT) at the live rate when they check out.</p>
      ${hasUsdt ? `<label class="check"><input type="checkbox" name="acceptUsdt" checked> Also accept USDT on Polygon</label>` : ''}
      <label class="drop small" id="cdrop"><input type="file" name="cover" accept="image/*" hidden><span class="drop-in"><b>Add a cover image</b><span class="muted">Optional. We'll make one if you skip it.</span></span></label>
      <button class="btn primary block lg">Put it on the shelf</button>
    </form>
  </main>`)
  const form = $<HTMLFormElement>('#f')
  const fileIn = form.querySelector<HTMLInputElement>('input[name=file]')!
  const coverIn = form.querySelector<HTMLInputElement>('input[name=cover]')!
  fileIn.onchange = () => {
    const f = fileIn.files?.[0]
    $('#drop .drop-in').innerHTML = f ? `<b>${esc(f.name)}</b><span class="muted">${fmtSize(f.size)} · tap to change</span>` : ''
    $('#drop').classList.toggle('has', !!f)
    const title = form.querySelector<HTMLInputElement>('input[name=title]')!
    if (f && !title.value) title.value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
  }
  coverIn.onchange = () => {
    const f = coverIn.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    $('#cdrop .drop-in').innerHTML = `<img src="${url}" alt="" class="thumb"><span class="muted">${esc(f.name)} · tap to change</span>`
  }
  const amountIn = form.querySelector<HTMLInputElement>('input[name=amount]')!
  const curIn = form.querySelector<HTMLSelectElement>('select[name=currency]')!
  const updConv = async () => {
    const r = await rates()
    const a = Number(amountIn.value.replace(/,/g, ''))
    if (!r || !a) { $('#conv').textContent = 'Buyers always pay in NIM (or USDT) at the live rate when they check out.'; return }
    const usd = curIn.value === 'USD' ? a : curIn.value === 'NGN' ? a * (r.usd / r.ngn) : a * r.usd
    $('#conv').innerHTML = `Today that's about <b>${fmtNim(usd / r.usd)}</b> · ${fmtUsd(usd)} · ${fmtNgn(usd * r.ngn / r.usd)}`
  }
  amountIn.oninput = updConv; curIn.onchange = updConv
  form.onsubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    fd.set('amount', String(amountIn.value).replace(/,/g, ''))
    fd.set('acceptUsdt', String(!!form.querySelector<HTMLInputElement>('input[name=acceptUsdt]')?.checked))
    if (!coverIn.files?.length) fd.delete('cover')
    const btn = form.querySelector<HTMLButtonElement>('button.primary')!
    btn.disabled = true; btn.textContent = 'Uploading…'
    try {
      const r = await api('/api/products', { method: 'POST', body: fd })
      toast('On the shelf')
      go('/p/' + r.product.id + '?new=1')
    } catch (er: any) { toast(er.message, 'err'); btn.disabled = false; btn.textContent = 'Put it on the shelf' }
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
  render(`${header(mine ? `<a class="link" href="/" data-link>Dashboard</a>` : `<a class="link" href="/purchases" data-link>My purchases</a>`)}
  <main class="wrap product">
    ${isNew ? `<div class="notice"><b>It's live.</b> Share this link and you'll see each sale on your dashboard.<div class="notice-actions"><button class="btn sm primary" data-share>Share</button><button class="btn sm ghost" data-copy>Copy link</button></div></div>` : ''}
    ${cover(p, 'hero')}
    <div class="p-head">
      <div><h1>${esc(p.title)}</h1>
      <a class="by" href="${stallHref}" data-link>by <b>${esc(c.name)}</b></a></div>
      ${netBadge(p.network)}
    </div>
    <div class="price-box">
      <div><span class="big-price">${fmtPrice(p.price)}</span>${q ? `<span class="muted">≈ ${fmtNim(q.nim)}${p.price.currency !== 'USD' ? ' · ' + fmtUsd(q.usd) : ''}${p.price.currency !== 'NGN' ? ' · ' + fmtNgn(q.ngn) : ''}</span>` : ''}</div>
      ${p.sold ? `<span class="sold">${nf(p.sold)} sold</span>` : ''}
    </div>
    ${!p.active ? `<div class="notice warn">The creator took this off the shelf.</div>` : `
    <div id="pay" class="pay">
      <button class="btn primary block lg pay-btn" data-pay="nim"><span>Pay with NIM</span>${q ? `<span class="mono">${fmtNim(q.nim)}</span>` : ''}</button>
      ${p.acceptUsdt ? `<button class="btn ghost block" data-pay="usdt"><span>Pay with USDT</span>${q ? `<span class="mono">${nf(q.usd, 2)} USDT</span>` : ''}</button><p class="fine center">USDT goes over Polygon, so you need a little POL for gas.</p>` : ''}
      ${!inNimiqPay() ? `<button class="link center block" data-manual>Paying from another Nimiq wallet?</button>` : ''}
    </div>`}
    ${p.description ? `<section class="desc"><h2>About this</h2><p>${esc(p.description).replace(/\n/g, '<br>')}</p></section>` : ''}
    ${p.file ? `<section class="file-line"><span class="file-ic">⤓</span><div><b>${esc(p.file.name)}</b><span class="muted">${fmtSize(p.file.size)} · instant download after payment</span></div></section>` : ''}
    <section class="trust">
      <p>Your payment goes straight to the creator's wallet <span class="mono">${esc(short(c.address))}</span>. Stall checks it on the Nimiq blockchain, then unlocks the file. The receipt stays on this device.</p>
    </section>
    ${!mine ? `<div class="center"><button class="link" data-share>Share this</button></div>` : `<div class="center"><button class="link danger" data-remove>Take off the shelf</button></div>`}
  </main>${footer()}`)

  app.querySelectorAll<HTMLButtonElement>('[data-share]').forEach((b) => b.onclick = () => share(link, p.title))
  app.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => b.onclick = () => copy(link))
  const rm = app.querySelector<HTMLButtonElement>('[data-remove]')
  if (rm) rm.onclick = async () => {
    if (!confirm('Take this off the shelf? Past buyers keep their downloads.')) return
    try { await api('/api/products/' + p.id, { method: 'DELETE' }); toast('Removed'); go('/') } catch (e: any) { toast(e.message, 'err') }
  }
  app.querySelectorAll<HTMLButtonElement>('[data-pay]').forEach((b) => b.onclick = () => checkout(p, b.dataset.pay as 'nim' | 'usdt', b))
  const man = app.querySelector<HTMLButtonElement>('[data-manual]')
  if (man) man.onclick = () => manualPay(p)
}

async function createOrder(p: any, chain: 'nim' | 'usdt') {
  const r = await api('/api/orders', { method: 'POST', json: { productId: p.id, chain } })
  receipts.add({ id: r.order.id, key: r.order.key, title: p.title, at: Date.now() })
  return r.order
}

async function checkout(p: any, chain: 'nim' | 'usdt', btn: HTMLButtonElement) {
  if (!(await nimiq()) && chain === 'nim') { openOutsideSheet('/p/' + p.id); return }
  if (p.network !== network() && chain === 'nim') {
    toast(`This item is on ${p.network}. Switch Nimiq Pay to ${p.network} to buy it.`, 'err'); return
  }
  const label = btn.innerHTML
  const all = app.querySelectorAll<HTMLButtonElement>('[data-pay]')
  all.forEach((b) => (b.disabled = true))
  btn.innerHTML = '<span>Confirm in Nimiq Pay…</span>'
  let order: any
  try {
    order = await createOrder(p, chain)
    const hash = chain === 'nim'
      ? await payNim(order.payTo, order.luna, order.memo)
      : await payUsdt(order.payTo, BigInt(order.usdtUnits))
    await waitForPayment(order, hash)
  } catch (e) {
    const w = walletError(e)
    toast(w.message, w.cancelled ? 'ok' : 'err')
    all.forEach((b) => (b.disabled = false))
    btn.innerHTML = label
  }
}

async function waitForPayment(order: any, hash: string) {
  const pay = $('#pay')
  pay.innerHTML = `<div class="checking"><div class="spinner"></div><div><b>Payment sent</b><p class="muted" id="ck">Checking it on-chain. This takes a few seconds.</p></div></div>`
  const started = Date.now()
  while (Date.now() - started < 3 * 60_000) {
    try {
      const r = await api(`/api/orders/${order.id}/claim`, { method: 'POST', json: { key: order.key, hash } })
      if (r.state === 'paid') { go(`/r/${order.id}?k=${order.key}&fresh=1`); return }
      if (r.state === 'invalid') {
        pay.innerHTML = `<div class="notice warn"><b>That payment doesn't match.</b> ${esc(r.reason)}<br><span class="muted">Order ${esc(order.id)} · keep this page, or contact the creator.</span></div>`
        return
      }
      const ck = document.getElementById('ck'); if (ck && r.reason) ck.textContent = r.reason
    } catch {}
    await sleep(2500)
  }
  pay.innerHTML = `<div class="notice warn"><b>Still waiting for the network.</b> Your receipt is saved under <a href="/purchases" data-link>My purchases</a>. Open it later and it will unlock once the payment confirms.</div>`
}

async function manualPay(p: any) {
  const pay = $('#pay')
  pay.innerHTML = `<div class="checking"><div class="spinner"></div><p class="muted">Getting today's price…</p></div>`
  let order: any
  try { order = await createOrder(p, 'nim') } catch (e: any) { pay.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; return }
  const nim = order.luna / 1e5
  pay.innerHTML = `<div class="manual">
    <h3>Send exactly this from any Nimiq wallet</h3>
    <div class="kv"><span>Amount</span><b class="mono">${nf(nim, 5)} NIM</b><button class="link" data-c="${nim}">copy</button></div>
    <div class="kv"><span>To</span><b class="mono">${esc(order.payTo)}</b><button class="link" data-c="${esc(order.payTo)}">copy</button></div>
    <div class="kv"><span>Message</span><b class="mono">${esc(order.memo)}</b><button class="link" data-c="${esc(order.memo)}">copy</button></div>
    <p class="fine">The message matters: it's how Stall knows the payment is yours. Price held for 20 minutes.</p>
    <label>Then paste the transaction hash<input id="hash" placeholder="e.g. 57dab851a5f7…" autocomplete="off" autocapitalize="off"></label>
    <button class="btn primary block" id="check">Check my payment</button>
  </div>`
  pay.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => b.onclick = () => copy(b.dataset.c!, 'Copied'))
  $('#check').onclick = () => { const h = $<HTMLInputElement>('#hash').value.trim(); if (h) waitForPayment(order, h) }
}

// ---------- receipt ----------

async function receiptPage(oid: string) {
  const k = new URLSearchParams(location.search).get('k') || receipts.list().find((r) => r.id === oid)?.key || ''
  loading()
  const { order: o, product: p, creator: c } = await api(`/api/orders/${oid}?k=${encodeURIComponent(k)}`)
  receipts.add({ id: o.id, key: o.key, title: p.title, at: o.paidAt || Date.now() })
  const fresh = new URLSearchParams(location.search).has('fresh')
  const dl = `/api/download/${o.id}?k=${encodeURIComponent(o.key)}`
  const dlFull = origin() + dl
  const viewable = p.file && /^(image\/|application\/pdf|audio\/|video\/|text\/)/.test(p.file.mime)
  const paid = o.status === 'paid'
  render(`${header(`<a class="link" href="/purchases" data-link>My purchases</a>`)}
  <main class="wrap narrow">
    ${fresh ? `<p class="eyebrow center">Paid. It's yours.</p>` : ''}
    <article class="receipt ${paid ? 'paid' : ''}">
      <div class="r-top"><span class="logo-mark">S</span><div><b>Stall receipt</b><span class="mono">#${esc(o.id)}</span></div>${paid ? `<span class="stamp">PAID</span>` : `<span class="stamp pending">PENDING</span>`}</div>
      <div class="r-item">${cover(p, 'sm')}<div><h3>${esc(p.title)}</h3><p class="muted">from ${esc(c.name)}</p></div></div>
      <dl class="r-lines">
        <div><dt>Paid</dt><dd class="mono">${o.chain === 'nim' ? nf(o.luna / 1e5, 2) + ' NIM' : nf(o.usdtUnits / 1e6, 2) + ' USDT'}</dd></div>
        <div><dt>Worth</dt><dd class="mono">${fmtUsd(o.usd)}</dd></div>
        ${o.buyer ? `<div><dt>From</dt><dd class="mono">${esc(short(o.buyer, 6))}</dd></div>` : ''}
        <div><dt>To</dt><dd class="mono">${esc(short(o.payTo, 6))}</dd></div>
        ${o.paidAt ? `<div><dt>Date</dt><dd>${new Date(o.paidAt).toLocaleString()}</dd></div>` : ''}
        ${o.txHash ? `<div><dt>On-chain</dt><dd><a class="mono" target="_blank" rel="noopener" href="${o.chain === 'nim' ? nimWatch(o.network, o.txHash) : polyScan(o.txHash)}">${esc(short(o.txHash, 6))} ↗</a></dd></div>` : ''}
      </dl>
      <div class="zig" aria-hidden="true"></div>
    </article>
    ${paid ? `
      <a class="btn primary block lg" href="${dl}" download>Download the file</a>
      <p class="fine center mono">${esc(p.file?.name || '')}${p.file ? ' · ' + fmtSize(p.file.size) : ''}</p>
      ${viewable ? `<a class="btn ghost block" href="${dl}&view=1" target="_blank" rel="noopener">Open it here</a>` : ''}
      <button class="link center block" id="cp">Copy download link (open it in your browser)</button>
      <p class="fine center">Saved on this device under My purchases. Anyone with this link can download the file, so keep it to yourself.</p>
    ` : `<div class="notice">This payment hasn't confirmed yet. <a href="/p/${p.id}" data-link>Back to the product</a></div>`}
  </main>`)
  const cp = document.getElementById('cp')
  if (cp) cp.onclick = () => copy(dlFull, 'Download link copied')
}

async function purchasesPage() {
  const list = receipts.list()
  render(`${header()}
  <main class="wrap narrow">
    <h1>My purchases</h1>
    ${list.length ? `<div class="list">${list.map((r) => `<a class="row" href="/r/${r.id}?k=${encodeURIComponent(r.key)}" data-link><div><h3>${esc(r.title)}</h3><p class="muted">${ago(r.at)} · #${esc(r.id)}</p></div><span class="chev">›</span></a>`).join('')}</div>`
      : `<div class="empty small"><p>Things you buy on Stall show up here, on this device.</p></div>`}
  </main>`)
}

// ---------- creator stall page ----------

async function stallPage(key: string) {
  loading()
  const { creator: c, products, sold } = await api('/api/stall/' + key)
  render(`${header()}
  <main class="wrap">
    <section class="stall-head"><div class="avatar" style="--h:${(c.name.charCodeAt(0) * 7) % 360}">${esc(c.name.slice(0, 1).toUpperCase())}</div>
      <div><h1>${esc(c.name)}</h1>${c.handle ? `<p class="muted">@${esc(c.handle)}</p>` : ''}</div></section>
    ${c.bio ? `<p class="lede">${esc(c.bio)}</p>` : ''}
    <p class="muted small">${products.length} ${products.length === 1 ? 'product' : 'products'}${sold ? ` · ${nf(sold)} sold` : ''} · paid in NIM${c.acceptsUsdt ? ' or USDT' : ''}</p>
    ${products.length ? `<div class="grid">${products.map(card).join('')}</div>` : `<div class="empty small"><p>The shelf is empty for now.</p></div>`}
  </main>${footer()}`)
}

route()
