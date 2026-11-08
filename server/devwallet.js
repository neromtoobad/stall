// DEV ONLY. Two throwaway testnet wallets (creator + buyer) so the whole
// sign-in → list → pay → unlock loop can be exercised in a desktop browser.
// Mounted only when DEV_WALLET=1 and never in production.
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './db.js'
import { NIM_RPC } from './chain.js'

export async function mountDevWallet(app) {
  const core = await import('@nimiq/core')
  const { KeyPair, PrivateKey, Hash, Signature, BufferUtils, TransactionBuilder, Address } = core
  const file = path.join(DATA_DIR, 'dev-wallets.json')
  let keys = {}
  try { keys = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  const kp = (who) => {
    if (!keys[who]) { keys[who] = BufferUtils.toHex(KeyPair.generate().privateKey.serialize()); fs.writeFileSync(file, JSON.stringify(keys)) }
    return KeyPair.derive(PrivateKey.fromHex(keys[who]))
  }
  const rpc = async (method, params) => {
    const r = await fetch(NIM_RPC.testnet, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
    const j = await r.json()
    if (j.error) throw new Error(j.error.message)
    return j.result.data
  }
  const who = (c) => (c.req.query('who') === 'buyer' ? 'buyer' : 'creator')

  app.get('/dev/wallet', async (c) => {
    const k = kp(who(c))
    const address = k.toAddress().toUserFriendlyAddress()
    let balance = null
    try { balance = (await rpc('getAccountByAddress', [address])).balance } catch {}
    return c.json({ address, balance })
  })
  app.post('/dev/faucet', async (c) => {
    const address = kp(who(c)).toAddress().toUserFriendlyAddress()
    const r = await fetch('https://faucet.pos.nimiq-testnet.com/tapit', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ address }) })
    return c.json(await r.json().catch(() => ({ success: false })))
  })
  app.post('/dev/sign', async (c) => {
    const { message } = await c.req.json()
    const k = kp(who(c))
    const data = '\x16Nimiq Signed Message:\n' + message.length + message
    const sig = Signature.create(k.privateKey, k.publicKey, Hash.computeSha256(BufferUtils.fromUtf8(data)))
    return c.json({ publicKey: BufferUtils.toHex(k.publicKey.serialize()), signature: BufferUtils.toHex(sig.serialize()) })
  })
  app.post('/dev/send', async (c) => {
    const { recipient, value, data } = await c.req.json()
    const k = kp(who(c))
    const height = await rpc('getBlockNumber', [])
    const tx = TransactionBuilder.newBasicWithData(k.toAddress(), Address.fromUserFriendlyAddress(recipient), new TextEncoder().encode(data || ''), BigInt(value), 0n, height, 5)
    tx.sign(k)
    const hash = await rpc('sendRawTransaction', [tx.toHex()])
    return c.json({ hash })
  })
  app.post('/dev/stake', async (c) => {
    const { delegation, value, kind } = await c.req.json()
    const k = kp(who(c))
    const height = await rpc('getBlockNumber', [])
    const tx = kind === 'add'
      ? TransactionBuilder.newAddStake(k.toAddress(), k.toAddress(), BigInt(value), 0n, height, 5)
      : TransactionBuilder.newCreateStaker(k.toAddress(), Address.fromUserFriendlyAddress(delegation), BigInt(value), 0n, height, 5)
    tx.sign(k)
    return c.json({ hash: await rpc('sendRawTransaction', [tx.toHex()]) })
  })
  console.log('dev wallet mounted at /dev/*')
}
