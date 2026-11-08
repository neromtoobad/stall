# Nimiq Pay Mini Apps Competition, Cycle III: Stall

**Category:** Earn
**Live:** https://stall.nerom.site (in Nimiq Pay: https://nimpay.app/miniapps/open/stall.nerom.site)
**Repo:** https://github.com/neromtoobad/stall (MIT)
**Team lead:** neromtoobad
**Payout wallet:** _(user adds their Nimiq address)_

## Description (≤250 words)

Stall lets anyone in Nimiq Pay earn from what they've already made. Creators upload a digital file, such as Lightroom presets, an e-book, beats, notes or a template. They set a price in naira, dollars or NIM and share one link. Buyers open it inside Nimiq Pay, pay in NIM (or USDT on Polygon), and download the file a few seconds later.

It's built for creators who struggle to get paid online. Card checkouts aren't open to them, local platforms take 5–10%, and payouts take days. On Stall, money goes wallet to wallet straight to the creator, and Stall takes 0%.

How it uses Nimiq Pay:
- **Sign-in:** `sign()` replaces email and password. The server checks the signature and derives the creator's address.
- **Checkout:** `sendBasicTransactionWithData()` pays the creator directly, with an order message attached. The price is quoted live from the NIM rate.
- **Verification:** before a file unlocks, the server confirms every payment on-chain: recipient, amount, message, execution result and confirmation. Each transaction can unlock one order only.
- **USDT:** creators can also accept USDT on Polygon through `window.ethereum`.
- **Sharing:** product links open the app straight in Nimiq Pay, and buyers on other Nimiq wallets can pay with the message and a transaction hash.

Creators get a dashboard with what they've earned in NIM, USDT and dollars, sales this week, buyers, and every sale with an explorer link. Buyers get a paper-style receipt saved on their device.
