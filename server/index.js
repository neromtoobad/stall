import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { bodyLimit } from 'hono/body-limit'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { db, one, all, run, FILES_DIR, COVERS_DIR } from './db.js'
import {
  addressFromPublicKey, verifyNimiqSignature, checkNimPayment, checkUsdtPayment,
  nimRates, prettyAddr, LUNA, USDT_POLYGON,
} from './chain.js'

const PORT = Number(process.env.PORT || 8787)
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://stall.nerom.site').replace(/\/$/, '')
const DIST = path.resolve('dist')
const MAX_FILE = 50 * 1024 * 1024
const ORDER_TTL = 20 * 60_000

const app = new Hono()
const id = (n = 10) => crypto.randomBytes(16).toString('base64url').replace(/[-_]/g, '').slice(0, n)
const now = () => Date.now()
const err = (c, status, message) => c.json({ error: message }, status)
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max)
const NET = (n) => (n === 'testnet' ? 'testnet' : 'mainnet')

app.use('/api/*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', c.req.header('origin') || '*')
  c.header('Access-Control-Allow-Headers', 'content-type, authorization')
  c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  if (c.req.method === 'OPTIONS') return c.body(null, 204)
  await next()
})

// ---------- helpers ----------

function auth(c) {
  const h = c.req.header('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  const s = one('SELECT * FROM sessions WHERE token = ?', token)
  if (!s) return null
  const creator = one('SELECT * FROM creators WHERE id = ?', s.creator_id)
  return creator ? { ...creator, session_network: s.network } : null
}

async function quote(product) {
  const r = await nimRates()
  let usd
  if (product.price_currency === 'USD') usd = product.price_amount
  else if (product.price_currency === 'NGN') usd = product.price_amount * (r.usd / r.ngn)
  else usd = product.price_amount * r.usd
  const nim = product.price_currency === 'NIM' ? product.price_amount : usd / r.usd
  return {
    usd: Math.round(usd * 100) / 100,
    ngn: Math.round(usd * (r.ngn / r.usd)),
    nim: Math.ceil(nim * 100) / 100,
    luna: Math.ceil(nim * LUNA),
    usdtUnits: Math.ceil(usd * 1e6),
    rate: { usd: r.usd, ngn: r.ngn },
  }
}

const soldCount = (pid) => one("SELECT COUNT(*) n FROM orders WHERE product_id = ? AND status = 'paid'", pid).n

function publicCreator(cr) {
  if (!cr) return null
  return { id: cr.id, name: cr.name || 'A Stall creator', handle: cr.handle, bio: cr.bio, address: cr.address, acceptsUsdt: !!cr.evm_address }
}

function publicProduct(p, extra = {}) {
  return {
    id: p.id, title: p.title, description: p.description, kind: p.kind,
    price: { amount: p.price_amount, currency: p.price_currency },
    acceptUsdt: !!p.accept_usdt, hue: p.hue, network: p.network, active: !!p.active,
    cover: p.cover_path ? `/api/cover/${p.id}` : null,
    file: p.file_name ? { name: p.file_name, size: p.file_size, mime: p.file_mime } : null,
    sold: soldCount(p.id), createdAt: p.created_at, ...extra,
  }
}

async function saveUpload(file, dir, maxBytes) {
  if (!file || typeof file === 'string' || !file.size) return null
  if (file.size > maxBytes) throw Object.assign(new Error(`File is over ${Math.round(maxBytes / 1048576)} MB`), { status: 413 })
  const name = id(16)
  const dest = path.join(dir, name)
  const buf = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(dest, buf)
  return { path: name, name: clean(file.name, 140) || 'file', size: buf.length, mime: clean(file.type, 100) || 'application/octet-stream' }
}

// ---------- config + auth ----------

app.get('/api/config', async (c) => {
  let rate = null
  try { rate = await nimRates() } catch {}
  return c.json({ rate: rate && { usd: rate.usd, ngn: rate.ngn }, publicUrl: PUBLIC_URL, usdt: USDT_POLYGON })
})

app.get('/api/auth/challenge', (c) => {
  const nonce = id(16)
  const message = `Sign in to Stall\n\nThis proves you own this wallet. It costs nothing and sends no money.\n\nCode: ${nonce}`
  run('INSERT INTO challenges (nonce, message, created_at) VALUES (?, ?, ?)', nonce, message, now())
  run('DELETE FROM challenges WHERE created_at < ?', now() - 15 * 60_000)
  return c.json({ nonce, message })
})

app.post('/api/auth/verify', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const ch = one('SELECT * FROM challenges WHERE nonce = ?', String(b.nonce || ''))
  if (!ch) return err(c, 400, 'This sign-in code expired. Try again.')
  run('DELETE FROM challenges WHERE nonce = ?', ch.nonce)
  if (!verifyNimiqSignature(ch.message, String(b.publicKey || ''), String(b.signature || '')))
    return err(c, 401, 'The signature did not check out.')
  const address = addressFromPublicKey(b.publicKey)
  let creator = one('SELECT * FROM creators WHERE address = ?', address)
  if (!creator) {
    const cid = id(10)
    run('INSERT INTO creators (id, address, created_at) VALUES (?, ?, ?)', cid, address, now())
    creator = one('SELECT * FROM creators WHERE id = ?', cid)
  }
  const token = id(32)
  run('INSERT INTO sessions (token, creator_id, network, created_at) VALUES (?, ?, ?, ?)', token, creator.id, NET(b.network), now())
  return c.json({ token, creator: publicCreator(creator), isNew: !creator.name })
})

// ---------- creator ----------

app.get('/api/me', async (c) => {
  const me = auth(c)
  if (!me) return err(c, 401, 'Sign in first.')
  const products = all('SELECT * FROM products WHERE creator_id = ? AND active = 1 ORDER BY created_at DESC', me.id)
  const sales = all(`SELECT o.id, o.chain, o.network, o.amount_luna, o.amount_usdt, o.usd_value, o.tx_hash, o.buyer_address, o.paid_at, p.title
    FROM orders o JOIN products p ON p.id = o.product_id
    WHERE o.creator_id = ? AND o.status = 'paid' ORDER BY o.paid_at DESC LIMIT 50`, me.id)
  const tot = one(`SELECT COUNT(*) n, COALESCE(SUM(amount_luna),0) luna, COALESCE(SUM(amount_usdt),0) usdt, COALESCE(SUM(usd_value),0) usd,
    COUNT(DISTINCT buyer_address) buyers FROM orders WHERE creator_id = ? AND status = 'paid'`, me.id)
  const week = one(`SELECT COALESCE(SUM(usd_value),0) usd, COUNT(*) n FROM orders WHERE creator_id = ? AND status = 'paid' AND paid_at > ?`, me.id, now() - 7 * 86400_000)
  return c.json({
    creator: { ...publicCreator(me), name: me.name, evmAddress: me.evm_address },
    network: me.session_network,
    products: products.map((p) => publicProduct(p)),
    sales,
    totals: { sales: tot.n, nim: tot.luna / LUNA, usdt: tot.usdt / 1e6, usd: Math.round(tot.usd * 100) / 100, buyers: tot.buyers, weekUsd: Math.round(week.usd * 100) / 100, weekSales: week.n },
  })
})

app.patch('/api/me', async (c) => {
  const me = auth(c)
  if (!me) return err(c, 401, 'Sign in first.')
  const b = await c.req.json().catch(() => ({}))
  const name = b.name !== undefined ? clean(b.name, 60) : me.name
  const bio = b.bio !== undefined ? clean(b.bio, 240) : me.bio
  let handle = me.handle
  if (b.handle !== undefined) {
    handle = clean(b.handle, 30).toLowerCase().replace(/^@/, '')
    if (handle && !/^[a-z0-9_]{3,30}$/.test(handle)) return err(c, 400, 'Handles use 3–30 letters, numbers or _.')
    if (handle && one('SELECT id FROM creators WHERE handle = ? AND id != ?', handle, me.id)) return err(c, 409, 'That handle is taken.')
    if (!handle) handle = null
  }
  let evm = me.evm_address
  if (b.evmAddress !== undefined) {
    evm = b.evmAddress ? String(b.evmAddress).toLowerCase() : null
    if (evm && !/^0x[0-9a-f]{40}$/.test(evm)) return err(c, 400, 'That is not an EVM address.')
  }
  run('UPDATE creators SET name = ?, bio = ?, handle = ?, evm_address = ? WHERE id = ?', name, bio, handle, evm, me.id)
  if (!evm) run('UPDATE products SET accept_usdt = 0 WHERE creator_id = ?', me.id)
  return c.json({ ok: true, creator: publicCreator(one('SELECT * FROM creators WHERE id = ?', me.id)) })
})

app.post('/api/products', bodyLimit({ maxSize: MAX_FILE + 8 * 1024 * 1024, onError: (c) => err(c, 413, 'That upload is too big (50 MB max).') }), async (c) => {
  const me = auth(c)
  if (!me) return err(c, 401, 'Sign in first.')
  const b = await c.req.parseBody()
  const title = clean(b.title, 90)
  if (!title) return err(c, 400, 'Give it a name.')
  const currency = ['USD', 'NGN', 'NIM'].includes(b.currency) ? b.currency : 'USD'
  const amount = Number(b.amount)
  if (!Number.isFinite(amount) || amount <= 0) return err(c, 400, 'Set a price above zero.')
  const min = { USD: 0.1, NGN: 100, NIM: 100 }[currency]
  if (amount < min) return err(c, 400, `The lowest price is ${min} ${currency}.`)
  let file, cover
  try {
    file = await saveUpload(b.file, FILES_DIR, MAX_FILE)
    cover = await saveUpload(b.cover, COVERS_DIR, 6 * 1024 * 1024)
  } catch (e) { return err(c, e.status || 400, e.message) }
  if (!file) return err(c, 400, 'Attach the file buyers will get.')
  if (cover && !/^image\//.test(cover.mime)) return err(c, 400, 'The cover must be an image.')
  const pid = id(8)
  const hue = crypto.createHash('sha1').update(title).digest()[0] * 360 / 256 | 0
  run(`INSERT INTO products (id, creator_id, title, description, price_amount, price_currency, accept_usdt, file_path, file_name, file_size, file_mime, cover_path, hue, network, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    pid, me.id, title, clean(b.description, 2000), amount, currency, b.acceptUsdt === 'true' && me.evm_address && currency !== 'NIM' ? 1 : 0,
    file.path, file.name, file.size, file.mime, cover?.path || null, hue, me.session_network, now())
  return c.json({ product: publicProduct(one('SELECT * FROM products WHERE id = ?', pid)) })
})

app.patch('/api/products/:id', async (c) => {
  const me = auth(c)
  if (!me) return err(c, 401, 'Sign in first.')
  const p = one('SELECT * FROM products WHERE id = ? AND creator_id = ?', c.req.param('id'), me.id)
  if (!p) return err(c, 404, 'Not found.')
  const b = await c.req.json().catch(() => ({}))
  const title = b.title !== undefined ? clean(b.title, 90) || p.title : p.title
  const description = b.description !== undefined ? clean(b.description, 2000) : p.description
  const amount = b.amount !== undefined && Number(b.amount) > 0 ? Number(b.amount) : p.price_amount
  const currency = ['USD', 'NGN', 'NIM'].includes(b.currency) ? b.currency : p.price_currency
  const acceptUsdt = b.acceptUsdt !== undefined ? (b.acceptUsdt && me.evm_address && currency !== 'NIM' ? 1 : 0) : p.accept_usdt
  run('UPDATE products SET title = ?, description = ?, price_amount = ?, price_currency = ?, accept_usdt = ? WHERE id = ?', title, description, amount, currency, acceptUsdt, p.id)
  return c.json({ product: publicProduct(one('SELECT * FROM products WHERE id = ?', p.id)) })
})

app.delete('/api/products/:id', (c) => {
  const me = auth(c)
  if (!me) return err(c, 401, 'Sign in first.')
  const r = run('UPDATE products SET active = 0 WHERE id = ? AND creator_id = ?', c.req.param('id'), me.id)
  return r.changes ? c.json({ ok: true }) : err(c, 404, 'Not found.')
})

// ---------- public ----------

app.get('/api/products/:id', async (c) => {
  const p = one('SELECT * FROM products WHERE id = ?', c.req.param('id'))
  if (!p) return err(c, 404, 'This item is not on the shelf.')
  const cr = one('SELECT * FROM creators WHERE id = ?', p.creator_id)
  let q = null
  try { q = await quote(p) } catch {}
  return c.json({ product: publicProduct(p, { acceptUsdt: !!(p.accept_usdt && cr.evm_address) }), creator: publicCreator(cr), quote: q })
})

app.get('/api/stall/:handle', (c) => {
  const key = c.req.param('handle').toLowerCase().replace(/^@/, '')
  const cr = one('SELECT * FROM creators WHERE handle = ? OR id = ?', key, key)
  if (!cr) return err(c, 404, 'No stall by that name.')
  const products = all('SELECT * FROM products WHERE creator_id = ? AND active = 1 ORDER BY created_at DESC', cr.id)
  const sold = one("SELECT COUNT(*) n FROM orders WHERE creator_id = ? AND status = 'paid'", cr.id).n
  return c.json({ creator: publicCreator(cr), products: products.map((p) => publicProduct(p)), sold })
})

app.get('/api/explore', (c) => {
  const products = all(`SELECT p.*, c.name cname, c.handle chandle FROM products p JOIN creators c ON c.id = p.creator_id
    WHERE p.active = 1 AND p.network = 'mainnet' ORDER BY p.created_at DESC LIMIT 24`)
  const stats = one(`SELECT COUNT(*) sales, COALESCE(SUM(usd_value),0) usd, COUNT(DISTINCT creator_id) creators FROM orders WHERE status = 'paid' AND network = 'mainnet'`)
  return c.json({
    products: products.map((p) => publicProduct(p, { creator: { name: p.cname || 'A Stall creator', handle: p.chandle } })),
    stats: { sales: stats.sales, usd: Math.round(stats.usd * 100) / 100, creators: stats.creators },
  })
})

app.get('/api/cover/:id', (c) => {
  const p = one('SELECT cover_path FROM products WHERE id = ?', c.req.param('id'))
  if (!p?.cover_path) return c.notFound()
  const f = path.join(COVERS_DIR, p.cover_path)
  if (!fs.existsSync(f)) return c.notFound()
  const buf = fs.readFileSync(f)
  const sig = buf.subarray(0, 12).toString('hex')
  const type = sig.startsWith('89504e47') ? 'image/png' : sig.startsWith('ffd8') ? 'image/jpeg' : sig.startsWith('47494638') ? 'image/gif'
    : buf.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : 'application/octet-stream'
  c.header('Cache-Control', 'public, max-age=86400')
  c.header('Content-Type', type)
  return c.body(buf)
})

// ---------- orders ----------

app.post('/api/orders', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const p = one('SELECT * FROM products WHERE id = ? AND active = 1', String(b.productId || ''))
  if (!p) return err(c, 404, 'This item is not on the shelf any more.')
  const cr = one('SELECT * FROM creators WHERE id = ?', p.creator_id)
  const chain = b.chain === 'usdt' ? 'usdt' : 'nim'
  if (chain === 'usdt' && !(p.accept_usdt && cr.evm_address)) return err(c, 400, 'This creator takes NIM only.')
  let q
  try { q = await quote(p) } catch { return err(c, 503, 'Could not get the NIM price right now. Try again in a minute.') }
  const oid = id(10)
  const memo = `STALL ${oid}`
  const payTo = chain === 'nim' ? cr.address : cr.evm_address
  run(`INSERT INTO orders (id, product_id, creator_id, chain, network, amount_luna, amount_usdt, usd_value, memo, pay_to, receipt_key, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    oid, p.id, cr.id, chain, p.network, chain === 'nim' ? q.luna : null, chain === 'usdt' ? q.usdtUnits : null, q.usd, memo, payTo, id(24), now(), now() + ORDER_TTL)
  const o = one('SELECT * FROM orders WHERE id = ?', oid)
  return c.json({ order: orderView(o, true), quote: q })
})

function orderView(o, withKey = false) {
  return {
    id: o.id, chain: o.chain, network: o.network, status: o.status, memo: o.memo, payTo: o.chain === 'nim' ? prettyAddr(o.pay_to) : o.pay_to,
    luna: o.amount_luna, usdtUnits: o.amount_usdt, usd: o.usd_value, txHash: o.tx_hash, buyer: o.buyer_address,
    expiresAt: o.expires_at, paidAt: o.paid_at, downloads: o.downloads, ...(withKey ? { key: o.receipt_key } : {}),
  }
}

const claiming = new Set()
app.post('/api/orders/:id/claim', async (c) => {
  const o = one('SELECT * FROM orders WHERE id = ?', c.req.param('id'))
  const b = await c.req.json().catch(() => ({}))
  if (!o || b.key !== o.receipt_key) return err(c, 404, 'Order not found.')
  if (o.status === 'paid') return c.json({ state: 'paid', order: orderView(o, true) })
  const hash = String(b.hash || '').trim()
  const taken = hash && one('SELECT id FROM orders WHERE tx_hash = ? AND id != ?', hash.toLowerCase(), o.id)
  if (taken) return c.json({ state: 'invalid', reason: 'That payment already unlocked another order.' })
  if (claiming.has(o.id)) return c.json({ state: 'pending', reason: 'Checking…' })
  claiming.add(o.id)
  try {
    const r = o.chain === 'nim'
      ? await checkNimPayment({ hash, network: o.network, to: o.pay_to, minLuna: Math.floor(o.amount_luna * 0.995), memo: o.memo, notBefore: o.created_at })
      : await checkUsdtPayment({ hash, to: o.pay_to, minUnits: o.amount_usdt, notBefore: o.created_at })
    if (r.state === 'paid') {
      try {
        run("UPDATE orders SET status = 'paid', tx_hash = ?, buyer_address = ?, paid_at = ? WHERE id = ? AND status = 'pending'", hash.toLowerCase(), r.tx.from, now(), o.id)
      } catch { return c.json({ state: 'invalid', reason: 'That payment already unlocked another order.' }) }
      return c.json({ state: 'paid', order: orderView(one('SELECT * FROM orders WHERE id = ?', o.id), true) })
    }
    return c.json({ state: r.state, reason: r.reason })
  } finally { claiming.delete(o.id) }
})

app.get('/api/orders/:id', (c) => {
  const o = one('SELECT * FROM orders WHERE id = ?', c.req.param('id'))
  if (!o || c.req.query('k') !== o.receipt_key) return err(c, 404, 'Receipt not found.')
  const p = one('SELECT * FROM products WHERE id = ?', o.product_id)
  const cr = one('SELECT * FROM creators WHERE id = ?', o.creator_id)
  return c.json({ order: orderView(o, true), product: publicProduct(p), creator: publicCreator(cr) })
})

app.get('/api/download/:id', (c) => {
  const o = one('SELECT * FROM orders WHERE id = ?', c.req.param('id'))
  if (!o || c.req.query('k') !== o.receipt_key) return err(c, 404, 'Receipt not found.')
  if (o.status !== 'paid') return err(c, 402, 'This order is not paid yet.')
  const p = one('SELECT * FROM products WHERE id = ?', o.product_id)
  const f = path.join(FILES_DIR, p.file_path)
  if (!fs.existsSync(f)) return err(c, 410, 'The creator removed this file. Contact them for a copy.')
  run('UPDATE orders SET downloads = downloads + 1 WHERE id = ?', o.id)
  const inline = c.req.query('view') === '1'
  c.header('Content-Type', p.file_mime || 'application/octet-stream')
  c.header('Content-Length', String(p.file_size))
  c.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(p.file_name)}`)
  c.header('Cache-Control', 'private, no-store')
  return c.body(Readable.toWeb(fs.createReadStream(f)))
})

if (process.env.DEV_WALLET === '1' && process.env.NODE_ENV !== 'production') {
  const { mountDevWallet } = await import('./devwallet.js')
  await mountDevWallet(app)
}

// ---------- web app ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
let indexHtml = null
function shell(meta) {
  if (!indexHtml || process.env.NODE_ENV !== 'production') {
    try { indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8') } catch { return null }
  }
  if (!meta) return indexHtml
  const tags = `<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(meta.url)}">
${meta.image ? `<meta property="og:image" content="${esc(meta.image)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}`
  return indexHtml.replace(/<title>[\s\S]*?<\/title>/, tags)
}

app.get('/assets/*', async (c) => {
  const f = path.join(DIST, c.req.path)
  if (!f.startsWith(DIST) || !fs.existsSync(f)) return c.notFound()
  const ext = path.extname(f)
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' }
  c.header('Content-Type', types[ext] || 'application/octet-stream')
  c.header('Cache-Control', 'public, max-age=31536000, immutable')
  return c.body(fs.readFileSync(f))
})

app.get('*', (c) => {
  const p = c.req.path
  const pub = path.join(DIST, p)
  if (p !== '/' && pub.startsWith(DIST) && fs.existsSync(pub) && fs.statSync(pub).isFile()) {
    const ext = path.extname(pub)
    const types = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.jpg': 'image/jpeg' }
    c.header('Content-Type', types[ext] || 'application/octet-stream')
    return c.body(fs.readFileSync(pub))
  }
  let meta = null
  const pm = p.match(/^\/p\/([A-Za-z0-9]+)/)
  const sm = p.match(/^\/@([a-z0-9_]+)/i)
  if (pm) {
    const prod = one('SELECT * FROM products WHERE id = ?', pm[1])
    if (prod) {
      const cr = one('SELECT * FROM creators WHERE id = ?', prod.creator_id)
      const price = prod.price_currency === 'USD' ? `$${prod.price_amount}` : prod.price_currency === 'NGN' ? `₦${prod.price_amount.toLocaleString('en-NG')}` : `${prod.price_amount} NIM`
      meta = { title: `${prod.title} · ${price} on Stall`, description: `${cr?.name || 'A creator'} sells this on Stall. Pay with NIM in Nimiq Pay and download it straight away.`, url: PUBLIC_URL + p, image: prod.cover_path ? `${PUBLIC_URL}/api/cover/${prod.id}` : `${PUBLIC_URL}/og.png` }
    }
  } else if (sm) {
    const cr = one('SELECT * FROM creators WHERE handle = ?', sm[1].toLowerCase())
    if (cr) meta = { title: `${cr.name || '@' + cr.handle}'s stall`, description: cr.bio || `Files, templates and guides from ${cr.name || cr.handle}, paid in NIM.`, url: PUBLIC_URL + p, image: `${PUBLIC_URL}/og.png` }
  }
  const html = shell(meta)
  if (!html) return c.text('Build the web app first: npm run build', 503)
  c.header('Cache-Control', 'no-cache')
  return c.html(html)
})

serve({ fetch: app.fetch, port: PORT }, () => console.log(`stall on :${PORT}`))
