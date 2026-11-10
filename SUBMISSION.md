# Nimiq Pay Mini Apps Competition, Cycle III: Stall

**Category:** Earn
**Live:** https://stall.nerom.site (in Nimiq Pay: Mini Apps → Custom URL → stall.nerom.site)
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

**Tagline:** Sell your files for NIM. Paid wallet to wallet, 0% fees.
**Icon:** brand/stall-icon-1024.png · **Share image:** public/og.png
**Privacy:** https://stall.nerom.site/privacy

## Deadlines (Cycle III)

- **Nov 11, 15:00 UTC (4 PM Lagos):** Demo Day. Builders play their demo videos live. Register in Skool to demo (and enter the $25 USDC raffle): https://www.skool.com/miniappscompetition/demo-day-register-below-to-win-25-usdc-on-nov-11th
- **Nov 11, 23:59 UTC (00:59 Nov 12 Lagos):** submissions close. Submit through the Registration Dashboard (the link is in the email you got when you registered at miniappscompetition.com).

## Form checklist

- [ ] Category: **Earn**
- [ ] App name: Stall. Tagline: as above
- [ ] Live URL: https://stall.nerom.site
- [ ] Mini app URL: https://stall.nerom.site (open in Nimiq Pay via Mini Apps → Custom URL)
- [ ] GitHub repo: https://github.com/neromtoobad/stall (public, MIT)
- [ ] Lead: neromtoobad, GitHub https://github.com/neromtoobad
- [ ] Payout wallet: your own Nimiq Pay address (NQ…). Prizes are paid in USDC on Polygon to the wallet given at submission, so check what the form asks for.
- [ ] Description: the 226 words above
- [ ] Demo video (optional, but Demo Day plays them)

## Promo posts (builder checklist, 5 points)

X, launch post (tag @miniappscomp and @NimiqCommunity):

> I built Stall for the Nimiq Pay Mini Apps competition.
>
> Upload a file (presets, an e-book, beats, class notes), set a price in naira or dollars, share one link. Buyers pay in NIM inside Nimiq Pay and the download unlocks in seconds.
>
> Money goes straight to your wallet. 0% fees.
>
> stall.nerom.site
>
> @miniappscomp @NimiqCommunity

X, reply with the how:

> How it works under the hood:
> - sign in with your wallet, no email
> - checkout sends NIM directly to the creator with an order message
> - the server checks the payment on-chain before unlocking
> - idle earnings can be staked in one tap
>
> Open source (MIT): github.com/neromtoobad/stall

Skool: post the same text in the Cycle III showcase thread with the icon or a screenshot.
