// Thin wrapper over the two Nimiq Pay providers.
import { init, NimiqProviderError, getHostNetwork } from '@nimiq/mini-app-sdk'
import { encodeFunctionData } from 'viem'

export const USDT_POLYGON = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
type Nimiq = Awaited<ReturnType<typeof init>>

let nimiqP: Promise<Nimiq | null> | null = null
export function nimiq(): Promise<Nimiq | null> {
  if (!nimiqP) {
    nimiqP = (async () => {
      // Outside Nimiq Pay nothing is injected; give up fast instead of the SDK's 10s default.
      const likely = typeof window !== 'undefined' && (window.nimiq || window.nimiqPay)
      try { return await init({ timeout: likely ? 8000 : 1200 }) } catch { return null }
    })()
  }
  return nimiqP
}

export const inNimiqPay = () => !!(window.nimiqPay || window.nimiq)
export const network = (): 'mainnet' | 'testnet' => (getHostNetwork() === 'testnet' ? 'testnet' : 'mainnet')

export function walletError(e: unknown): { cancelled: boolean; message: string } {
  if (NimiqProviderError.is(e)) {
    if (e.type === 'PERMISSION_DENIED') return { cancelled: true, message: 'You cancelled in Nimiq Pay. Nothing was sent.' }
    if (e.type === 'NETWORK_ERROR') return { cancelled: false, message: 'Nimiq Pay could not reach the network. Check your connection, then try again.' }
    if (e.type === 'INVALID_TRANSACTION') return { cancelled: false, message: 'Nimiq Pay rejected the payment details: ' + e.message }
    return { cancelled: false, message: e.message || 'Nimiq Pay could not finish that.' }
  }
  const any = e as { code?: number; message?: string }
  if (any?.code === 4001) return { cancelled: true, message: 'You cancelled in Nimiq Pay. Nothing was sent.' }
  return { cancelled: false, message: any?.message || 'Something went wrong in the wallet.' }
}

export async function signIn(message: string) {
  const n = await nimiq()
  if (!n) throw new Error('Open Stall inside Nimiq Pay to sign in.')
  return n.sign(message)
}

export async function payNim(recipient: string, luna: number, data: string) {
  const n = await nimiq()
  if (!n) throw new Error('Open Stall inside Nimiq Pay to pay with NIM.')
  return n.sendBasicTransactionWithData({ recipient, value: luna, data })
}

// ---------- EVM (USDT on Polygon) ----------

const eth = () => (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<any> } }).ethereum

export async function evmAccount(): Promise<string> {
  const p = eth()
  if (!p) throw new Error('Open Stall inside Nimiq Pay to use USDT.')
  const accts: string[] = await p.request({ method: 'eth_requestAccounts' })
  if (!accts?.[0]) throw new Error('No EVM account was shared.')
  return accts[0]
}

export async function payUsdt(to: string, units: bigint): Promise<string> {
  const p = eth()
  if (!p) throw new Error('Open Stall inside Nimiq Pay to use USDT.')
  const from = await evmAccount()
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] })
  } catch (e: any) {
    if (e?.code === 4902) throw new Error('Polygon is not set up in your wallet yet.')
    throw e
  }
  const data = encodeFunctionData({
    abi: [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
    functionName: 'transfer',
    args: [to as `0x${string}`, units],
  })
  return p.request({ method: 'eth_sendTransaction', params: [{ from, to: USDT_POLYGON, data, value: '0x0' }] })
}

export async function usdtBalance(addr: string): Promise<number | null> {
  const p = eth()
  if (!p) return null
  try {
    const data = encodeFunctionData({
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
      functionName: 'balanceOf', args: [addr as `0x${string}`],
    })
    const raw = await p.request({ method: 'eth_call', params: [{ to: USDT_POLYGON, data }, 'latest'] })
    return Number(BigInt(raw)) / 1e6
  } catch { return null }
}

export async function nimBalance(addr: string): Promise<number | null> {
  const n = await nimiq()
  if (!n || typeof n.getBalance !== 'function') return null
  try { return (await n.getBalance(addr)) / 100_000 } catch { return null }
}
