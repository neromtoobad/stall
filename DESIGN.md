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
