// Waits for a sale on the mainnet test shop, then checks it independently:
// the tx on a Nimiq mainnet node, and that the same hash cannot unlock a second order.
import fs from 'node:fs'
const BASE = process.env.STALL_URL || 'https://stall.nerom.site'
const st = JSON.parse(fs.readFileSync('data/mainnet-creator.json', 'utf8'))
const H = { authorization: 'Bearer ' + st.token }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = Date.now() + Number(process.env.WAIT_MIN || 180) * 60_000
let me
for (;;) {
  me = await fetch(BASE + '/api/me', { headers: H }).then((r) => r.json()).catch(() => null)
  if (me?.sales?.length) break
  if (Date.now() > until) { console.log('no sale yet, stopped waiting'); process.exit(2) }
  await sleep(15_000)
}
const s = me.sales[0]
console.log('SALE', JSON.stringify(s))
const rpc = await fetch('https://rpc.nimiqwatch.com', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransactionByHash', params: [s.tx_hash] }) }).then((r) => r.json())
const tx = rpc.result?.data
console.log('CHAIN', JSON.stringify({ to: tx?.to, value: tx?.value / 1e5, data: Buffer.from(tx?.recipientData || '', 'hex').toString(), block: tx?.blockNumber, confirmations: tx?.confirmations, ok: tx?.executionResult, network: tx?.network }))
const o = await fetch(BASE + '/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: st.productId, chain: 'nim' }) }).then((r) => r.json())
const replay = await fetch(BASE + `/api/orders/${o.order.id}/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: o.order.key, hash: s.tx_hash }) }).then((r) => r.json())
console.log('REPLAY', JSON.stringify(replay))
console.log('TOTALS', JSON.stringify(me.totals))
