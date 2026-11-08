# Stall

**Sell your files inside Nimiq Pay. Buyers pay in NIM or USDT, and you keep 100%.**

Live: **https://stall.nerom.site** · open in Nimiq Pay: `https://nimpay.app/miniapps/open/stall.nerom.site`

Stall is a Nimiq Pay mini app for creators who sell digital things: Lightroom presets, e-books, beats, notes, templates, design files. You upload the file, set a price in naira, dollars or NIM, and share one link. The buyer taps it, pays from Nimiq Pay, and downloads the file a few seconds later.

Payments go wallet to wallet. Stall never holds anyone's money and takes no cut. The server only reads the blockchain to confirm a payment before it unlocks the file.

Built for the Nimiq Pay Mini Apps Competition, Cycle III (**Earn** category).

## Why

Creators in places like Nigeria have a hard time getting paid online. Card checkouts like Stripe aren't available to them, local platforms take 5–10%, and payouts take days. Stall turns anything a creator has already made into income they receive instantly, in a wallet they control.

## How it works

1. **Open your stall.** Inside Nimiq Pay, tap *Open your stall*. Stall asks Nimiq Pay to `sign()` a one-time message, then checks the ed25519 signature and derives your address on the server. There's no email or password, and your keys never leave the wallet.
2. **Add a product.** Upload the file (up to 50 MB), name it, and set a price in ₦, $ or NIM. You can also turn on USDT on Polygon and pick your Nimiq Pay EVM address for it.
3. **Share the link.** Product pages have proper social previews for WhatsApp and X. Anyone who opens the link outside Nimiq Pay gets an *Open in Nimiq Pay* deeplink.
4. **The buyer pays.** Stall quotes the live NIM price (from CoinGecko) and holds it for 20 minutes. Nimiq Pay then sends `sendBasicTransactionWithData` straight to the creator, with a message such as `STALL 8fK2…` that ties the payment to the order. USDT goes as an ERC-20 `transfer` on Polygon via `window.ethereum`.
5. **Stall checks the payment on-chain.** The server reads the transaction from a Nimiq RPC node (`getTransactionByHash`) and checks the recipient, the amount, the message, the execution result and the confirmation. For USDT it checks the Polygon receipt's `Transfer` log. Each payment hash can unlock one order only.
6. **The buyer gets a receipt.** It's a paper-style receipt with a download link, kept on the device under *My purchases*.
7. **The creator sees earnings.** The dashboard shows total earned (NIM, USDT and the $ value), sales this week, buyers, and every sale with a link to the explorer.

Anyone can still pay with a different Nimiq wallet. The product page shows the amount, address and message to send, then takes the transaction hash.

## Nimiq Pay integration

| Feature | API |
|---|---|
| Wallet sign-in (proof of ownership) | `nimiq.sign()` + server-side ed25519 / Blake2b address derivation |
| NIM checkout with an order message | `nimiq.sendBasicTransactionWithData()` |
| USDT checkout | `window.ethereum`: `eth_requestAccounts`, `wallet_switchEthereumChain` (0x89), `eth_sendTransaction` with a viem-encoded `transfer` |
| Network awareness | `getHostNetwork()`, so testnet listings are kept apart and labelled |
| Errors | `NimiqProviderError` types: cancelling is calm and the screen stays usable |
| Sharing | `nimpay.app/miniapps/open/…` deeplinks |

## Stack

- `server/`: Node 22+ with Hono and the built-in `node:sqlite`. Files live on a Railway volume. There are no keys or secrets in the repo, and none are needed.
- `src/`: Vite with vanilla TypeScript, `@nimiq/mini-app-sdk` and viem. It's mobile-first with 48px tap targets.
- `server/chain.js`: Nimiq address and signature checks plus NIM and Polygon payment checks, with no Nimiq SDK on the server.

## Run it

```bash
npm install
npm run dev:api   # API on :8787
npm run dev:web   # app on :5180 (also on your LAN for Nimiq Pay's Custom URL)
```

To try Stall in Nimiq Pay during development, open the Network URL that Vite prints in **Mini Apps → Custom URL**. To use testnet, long-press Settings for 10 seconds.

**Desktop test wallet (dev only):** start the API with `DEV_WALLET=1` and open `http://localhost:5180/?devwallet=creator` (or `?devwallet=buyer`). This fakes the Nimiq Pay injection with two throwaway testnet wallets held by the local server, so you can run the whole sign-in → list → pay → unlock loop on a laptop. `POST /dev/faucet?who=buyer` funds a wallet from the Nimiq testnet faucet. None of this is included in production builds.

## Deploy

```bash
railway up   # Dockerfile; mount a volume at /data
```

Environment: `PUBLIC_URL`, and optionally `NIM_RPC_MAINNET`, `NIM_RPC_TESTNET` and `POLYGON_RPC`.

## License

MIT
