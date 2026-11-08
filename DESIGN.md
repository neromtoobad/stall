# Stall: design direction

References (principles only, nothing copied):
- Gumroad (gumroad.com): off-white body (#f4f4f0), 1px solid ink borders, small radii, pill buttons, one loud accent.
- Selar (selar.com): the Nigerian creator-store leader. Deep navy ink, plain product pages, price up top.
- Lemon Squeezy (lemonsqueezy.com): quiet grey borders (#d1d1db), monospace for numbers.

Shared principles: the product sits at the centre with nothing around it, the price is the second thing you read, one clear pay button, and the receipt reads like a receipt.

Stall's own metaphor is a **market stall**. A striped awning crowns every page (gold and paper stripes with a scalloped edge), products are goods on a shelf, and a purchase ends in a paper **receipt** with a torn zig-zag edge and monospace figures.

Tokens
- paper `#F6F3EC` (body), card `#FFFFFF`, ink `#1F2348` (Nimiq navy), muted `#6A6D86`, line `#1F2348` at 1px, soft line `#DCD8CC`
- accent: gold `#E9B213` (Nimiq gold) for the awning and highlights, never for long text; success `#1E9E8A`; error `#C8412F`
- type: Mulish (Nimiq's brand face) for UI; Bricolage Grotesque 700 for headings and prices; JetBrains Mono for amounts, hashes and addresses
- radius: 12px cards, 999px buttons, 8px inputs; shadow: a 3px flat ink offset on the main pay button only
- tap targets 48px; one column at 375px, max width 520px

## v3 "Ledger" (Nov 8): the look of a professional money app

References I studied (Dribbble, Nov 2026): Fireart's savings app, SavingPro, Plum, Goalie, Yieldo, plus the [Phenomenon fintech pattern breakdown](https://phenomenonstudio.com/article/fintech-design-breakdown-the-most-common-design-patterns/).
These patterns repeat across them:
- An off-white canvas with white cards (radius 20 to 24), **no outlines**, and only a whisper of shadow.
- One huge balance number with a tiny green growth pill, then a row of round quick actions.
- Charts with soft, rounded bars where the current period is highlighted.
- Lists with round icon avatars, a title and subtitle, and the amount right-aligned in green.
- A dark pill as the primary button, and a floating pill bottom nav.
- A single neutral grotesk typeface with tabular figures and tight tracking on big numbers.

What changed for Stall:
- Mulish and Bricolage are replaced by **Geist** and Geist Mono. Bricolage stays only in the wordmark.
- Gone: the 1.5px navy outlines, the hard gold offset shadows, mono-font money, and the awning on every page. The awning now appears only on the landing page.
- Navy (#1F2348) is the primary colour, gold is a sparing brand accent, green (#13A05F) means money in.
- The dashboard is now a money-app home screen: a greeting, the balance card with chart and quick actions, stat tiles, the staking card, products, and activity.
- The receipt is now a success screen (check, amount, recipient) above a clean detail card.
