// On-chain checks for Stall. Nothing here holds keys: the server only reads
// public chain data to confirm that a buyer really paid a creator.
import crypto from 'node:crypto'
import blake from 'blakejs'

export const NIM_RPC = {
  mainnet: process.env.NIM_RPC_MAINNET || 'https://rpc.nimiqwatch.com',
  testnet: process.env.NIM_RPC_TESTNET || 'https://rpc.testnet.nimiqwatch.com',
}
const POLYGON_RPCS = (process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com,https://polygon.drpc.org').split(',')
export const USDT_POLYGON = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
export const LUNA = 100_000

async function rpc(url, method, params = [], timeoutMs = 10_000) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`rpc ${method} http ${res.status}`)
  const body = await res.json()
  if (body.error) throw Object.assign(new Error(body.error.message || 'rpc error'), { rpcError: body.error })
  return body.result
}

async function polygon(method, params) {
  let last
  for (const url of POLYGON_RPCS) {
    try { return await rpc(url, method, params) } catch (e) { last = e }
  }
  throw last
}

// ---------- Nimiq addresses + signatures ----------

const B32 = '0123456789ABCDEFGHJKLMNPQRSTUVXY'
export const normAddr = (a) => String(a || '').replace(/\s+/g, '').toUpperCase()
export const prettyAddr = (a) => normAddr(a).replace(/(.{4})/g, '$1 ').trim()

function ibanCheck(str) {
  const num = str.toUpperCase().split('').map((c) => String(parseInt(c, 36))).join('')
  let r = 0
  for (const ch of num) r = (r * 10 + Number(ch)) % 97
  return r
}

export function addressFromPublicKey(pubHex) {
  const pub = Buffer.from(pubHex, 'hex')
  if (pub.length !== 32) throw new Error('bad public key')
  const a = blake.blake2b(pub, null, 32).slice(0, 20)
  let bits = ''
  for (const b of a) bits += b.toString(2).padStart(8, '0')
  let b32 = ''
  for (let i = 0; i < 160; i += 5) b32 += B32[parseInt(bits.slice(i, i + 5), 2)]
  const cs = String(98 - ibanCheck(b32 + 'NQ00')).padStart(2, '0')
  return prettyAddr('NQ' + cs + b32)
}

export function isValidNimAddress(a) {
  const n = normAddr(a)
  if (!/^NQ[0-9]{2}[0-9A-HJ-NP-VXY]{32}$/.test(n)) return false
  return ibanCheck(n.slice(4) + n.slice(0, 4)) === 1
}

// Nimiq Pay's sign(): ed25519 over sha256("\x16Nimiq Signed Message:\n" + len + msg)
export function verifyNimiqSignature(message, pubHex, sigHex) {
  try {
    const pub = Buffer.from(pubHex, 'hex')
    const sig = Buffer.from(sigHex, 'hex')
    if (pub.length !== 32 || sig.length !== 64) return false
    const key = crypto.createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub]),
      format: 'der',
      type: 'spki',
    })
    const data = '\x16Nimiq Signed Message:\n' + message.length + message
    const hash = crypto.createHash('sha256').update(Buffer.from(data, 'utf8')).digest()
    return crypto.verify(null, hash, key, sig)
  } catch {
    return false
  }
}

// ---------- payment verification ----------

const hexToUtf8 = (h) => { try { return Buffer.from(h || '', 'hex').toString('utf8') } catch { return '' } }

/**
 * Returns { state: 'paid' | 'pending' | 'invalid', reason?, tx? }
 * pending = not visible on-chain yet (keep polling); invalid = will never satisfy this order.
 */
export async function checkNimPayment({ hash, network, to, minLuna, memo, notBefore }) {
  if (!/^[0-9a-f]{64}$/i.test(hash || '')) return { state: 'invalid', reason: 'That does not look like a NIM transaction hash.' }
  let tx
  try {
    const r = await rpc(NIM_RPC[network] || NIM_RPC.mainnet, 'getTransactionByHash', [hash.toLowerCase()])
    tx = r?.data
  } catch (e) {
    const msg = String(e.rpcError?.message || e.message || '')
    if (/not found|unknown/i.test(msg) || e.rpcError) return { state: 'pending', reason: 'Waiting for the network to include the payment.' }
    return { state: 'pending', reason: 'Could not reach the Nimiq network, retrying.' }
  }
  if (!tx) return { state: 'pending', reason: 'Waiting for the network to include the payment.' }
  if (normAddr(tx.to) !== normAddr(to)) return { state: 'invalid', reason: 'This payment went to a different address.' }
  if (Number(tx.value) < minLuna) return { state: 'invalid', reason: 'This payment is smaller than the price.' }
  const data = hexToUtf8(tx.recipientData)
  if (memo && !data.includes(memo)) return { state: 'invalid', reason: `The payment message must contain ${memo}.` }
  if (tx.executionResult === false) return { state: 'invalid', reason: 'The transaction failed on-chain.' }
  if (notBefore && tx.timestamp && tx.timestamp < notBefore - 10 * 60_000) return { state: 'invalid', reason: 'This payment was made before the order existed.' }
  if (!tx.blockNumber || (tx.confirmations ?? 0) < 1) return { state: 'pending', reason: 'Payment seen, waiting for confirmation.', tx }
  return { state: 'paid', tx: { hash: tx.hash, from: prettyAddr(tx.from), value: Number(tx.value), block: tx.blockNumber, timestamp: tx.timestamp } }
}

export async function checkUsdtPayment({ hash, to, minUnits, notBefore }) {
  if (!/^0x[0-9a-f]{64}$/i.test(hash || '')) return { state: 'invalid', reason: 'That does not look like a Polygon transaction hash.' }
  let receipt
  try { receipt = await polygon('eth_getTransactionReceipt', [hash]) } catch { return { state: 'pending', reason: 'Could not reach Polygon, retrying.' } }
  if (!receipt) return { state: 'pending', reason: 'Waiting for Polygon to include the payment.' }
  if (receipt.status !== '0x1') return { state: 'invalid', reason: 'The transaction failed on Polygon.' }
  const want = to.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const log = (receipt.logs || []).find((l) =>
    l.address?.toLowerCase() === USDT_POLYGON && l.topics?.[0] === TRANSFER_TOPIC && l.topics?.[2]?.toLowerCase().endsWith(want))
  if (!log) return { state: 'invalid', reason: 'No USDT transfer to the creator in this transaction.' }
  const value = BigInt(log.data)
  if (value < BigInt(minUnits)) return { state: 'invalid', reason: 'This USDT payment is smaller than the price.' }
  if (notBefore) {
    try {
      const block = await polygon('eth_getBlockByNumber', [receipt.blockNumber, false])
      if (Number(BigInt(block.timestamp)) * 1000 < notBefore - 10 * 60_000) return { state: 'invalid', reason: 'This payment was made before the order existed.' }
    } catch { /* timestamp check is best effort */ }
  }
  const from = '0x' + log.topics[1].slice(-40)
  return { state: 'paid', tx: { hash, from, value: Number(value), block: Number(BigInt(receipt.blockNumber)) } }
}

// ---------- price feed ----------

let rateCache = { at: 0, usd: 0, ngn: 0 }
export async function nimRates() {
  if (Date.now() - rateCache.at < 60_000 && rateCache.usd) return rateCache
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd,ngn', { signal: AbortSignal.timeout(8000) })
    const j = await r.json()
    const usd = j['nimiq-2']?.usd, ngn = j['nimiq-2']?.ngn
    if (usd && ngn) rateCache = { at: Date.now(), usd, ngn }
  } catch { /* keep last good rate */ }
  if (!rateCache.usd) throw new Error('price feed unavailable')
  return rateCache
}
