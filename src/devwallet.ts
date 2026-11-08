// DEV ONLY (stripped from production builds): fakes the Nimiq Pay injection
// using two testnet wallets held by the local dev server.
// Use ?devwallet=creator or ?devwallet=buyer on localhost.
export function installDevWallet() {
  const qs = new URLSearchParams(location.search).get('devwallet')
  if (qs) sessionStorage.setItem('devwallet', qs)
  const who = sessionStorage.getItem('devwallet')
  if (!who) return
  const call = async (path: string, body?: unknown) => {
    const r = await fetch(`/dev/${path}?who=${who}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
    if (!r.ok) throw new Error('dev wallet ' + path + ' failed')
    return r.json()
  }
  const w = window as any
  w.nimiqPay = { language: 'en', network: 'testnet' }
  w.nimiq = {
    listAccounts: async () => [(await call('wallet')).address],
    sign: async (m: string) => call('sign', { message: typeof m === 'string' ? m : (m as any).message }),
    sendBasicTransactionWithData: async (a: any) => (await call('send', a)).hash,
    sendBasicTransaction: async (a: any) => (await call('send', a)).hash,
    getBalance: async () => (await call('wallet')).balance,
    sendNewStakerTransaction: async (a: any) => (await call('stake', { ...a, kind: 'new' })).hash,
    sendStakeTransaction: async (a: any) => (await call('stake', { ...a, kind: 'add' })).hash,
    isConsensusEstablished: async () => true,
    getBlockNumber: async () => 0,
    disconnect() {},
    on() { return this },
  }
  const tag = document.createElement('div')
  tag.textContent = 'DEV WALLET: ' + who
  tag.style.cssText = 'position:fixed;top:0;right:0;background:#C8412F;color:#fff;font:700 11px monospace;padding:3px 8px;z-index:99'
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tag))
  if (document.body) document.body.appendChild(tag)
}
