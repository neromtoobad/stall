// Sets up a throwaway mainnet "test shop" on the live Stall and lists one cheap item,
// so a real Nimiq Pay purchase can be checked end to end. Sends no money.
// Key lives in data/mainnet-creator.json (gitignored). Usage:
//   node scripts/mainnet-shop.mjs setup     sign in, name the shop, list the item
//   node scripts/mainnet-shop.mjs status    show sales on the test shop
import fs from 'node:fs'
import path from 'node:path'
const BASE = process.env.STALL_URL || 'https://stall.nerom.site'
const core = await import('@nimiq/core')
const { KeyPair, PrivateKey, Hash, Signature, BufferUtils } = core
const file = path.resolve('data/mainnet-creator.json')
let st = {}
try { st = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
if (!st.key) { st.key = BufferUtils.toHex(KeyPair.generate().privateKey.serialize()); fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(file, JSON.stringify(st, null, 2)) }
const save = () => fs.writeFileSync(file, JSON.stringify(st, null, 2))
const kp = KeyPair.derive(PrivateKey.fromHex(st.key))
const address = kp.toAddress().toUserFriendlyAddress()
const api = async (p, opt = {}) => {
  const r = await fetch(BASE + p, { ...opt, headers: { ...(opt.headers || {}), ...(st.token ? { authorization: 'Bearer ' + st.token } : {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${p} ${r.status} ${JSON.stringify(j)}`)
  return j
}
async function signIn() {
  const { nonce, message } = await api('/api/auth/challenge')
  const data = '\x16Nimiq Signed Message:\n' + message.length + message
  const sig = Signature.create(kp.privateKey, kp.publicKey, Hash.computeSha256(BufferUtils.fromUtf8(data)))
  const r = await api('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nonce, publicKey: BufferUtils.toHex(kp.publicKey.serialize()), signature: BufferUtils.toHex(sig.serialize()), network: 'mainnet' }) })
  st.token = r.token; save()
}
const cmd = process.argv[2] || 'status'
console.log('creator', address)
if (cmd === 'setup') {
  await signIn()
  await api('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Stall Test Shop', handle: 'stalltest', bio: 'Our own mainnet test listing. Not a real product.' }) })
  if (!st.productId) {
    const fd = new FormData()
    fd.set('title', 'Stall mainnet test: icon pack')
    fd.set('description', 'A test listing we use to check real Nimiq Pay payments end to end. You get the Stall app icon as a 1024px PNG.')
    fd.set('kind', 'file'); fd.set('amount', '1000'); fd.set('currency', 'NIM'); fd.set('pwyw', 'false')
    fd.set('file', new Blob([fs.readFileSync('brand/stall-icon-1024.png')], { type: 'image/png' }), 'stall-icon-1024.png')
    fd.set('cover', new Blob([fs.readFileSync('public/og.png')], { type: 'image/png' }), 'cover.png')
    const r = await api('/api/products', { method: 'POST', body: fd })
    st.productId = r.product.id; save()
  }
  console.log('product', `${BASE}/p/${st.productId}`)
  console.log('nimiq pay', `https://nimpay.app/miniapps/open/${new URL(BASE).host}/p/${st.productId}`)
}
const me = await api('/api/me').catch(async () => { await signIn(); return api('/api/me') })
console.log('network', me.network, '| sales', me.totals.sales, '| NIM', me.totals.nim)
for (const s of me.sales) console.log(' sale', s.id, s.network, s.amount_luna / 1e5, 'NIM from', s.buyer_address, 'tx', s.tx_hash)
