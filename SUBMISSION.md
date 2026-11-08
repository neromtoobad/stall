# Nimiq Pay Mini Apps Competition, Cycle III: Stall

**Category:** Earn
**Live:** https://stall.nerom.site (in Nimiq Pay: https://nimpay.app/miniapps/open/stall.nerom.site)
**Repo:** https://github.com/neromtoobad/stall (MIT)
**Team lead:** neromtoobad
**Payout wallet:** _(user adds their Nimiq address)_

## Description (≤250 words)

Stall lets anyone in Nimiq Pay earn from what they've already made. Creators upload a file (presets, an e-book, beats, notes) or a private link such as a class invite. They set a price in naira, dollars or NIM and share one link. Buyers pay inside Nimiq Pay in NIM (or USDT on Polygon) and unlock it a few seconds later.

It's built for creators who struggle to get paid online. Card checkouts aren't open to them, local platforms take 5–10%, and payouts take days. On Stall, money goes wallet to wallet straight to the creator, and Stall takes 0%.

How it uses Nimiq Pay:
- **Sign-in:** `sign()` replaces email and password, and the server verifies the signature.
- **Checkout:** `sendBasicTransactionWithData()` pays the creator directly, with an order message and an optional tip.
- **Verification:** the server confirms each payment on-chain (recipient, amount, message, confirmation) before unlocking. Each transaction unlocks one order only.
- **Staking:** one tap stakes idle earnings with a top-scored pool (`sendNewStakerTransaction`), so earnings keep growing.
- **USDT:** creators can also accept USDT on Polygon through `window.ethereum`.
- **Recovery:** on a new phone, buyers sign with their wallet and every purchase comes back.

Creators get a dashboard with a 14-day earnings chart, tips, and views and conversion for each product. Buyers get a paper-style receipt and a share sheet for WhatsApp and X.
