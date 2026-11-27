# UltiScore

A mobile-first Hungarian Ulti score sheet. [Open the calculator](https://ulti.tamaserdos.com/).

Enter an integer game score for each of up to four players. Leave unused slots empty. For each player, the calculator adds the differences between their game score and every other participant’s score, adds their individual adjustment, and multiplies that total by the selected multiplier. Individual adjustments must sum to zero. Blank adjustments count as zero.

The multiplier defaults to 0.25. Choose a preset or enter a custom number, including zero or a negative value. The last valid setting is saved in the browser. Manually entered calculator scores stay in memory for the current page.

## Partinapló

The hand log saves the session in local storage. Enter two to four names in dealing order and choose the first dealer. Tap the declarer’s name under **Parti rögzítése**, enter the játékpont and any balanced egyéni pontok, then save. After a passed-out hand, enter the next result at its agreed value. A zero result passes the deal and keeps any earned marks without using up a parti.

A buli ends after six counted hands per player by default, or as soon as everyone has earned every enabled mark. With both marks disabled, only the hand limit applies. At closing, review the missing-mark penalties and make any final játékpont corrections. The highest and lowest adjusted játékpont totals share the positive and negative bonus respectively. A complete tie has zero net bonus.

Starting another buli carries forward the dealing order and overall standings. The buli selector also lets you correct earlier entries. Finalized session totals can be transferred to Elszámoló with their player names and individual points. Split bonuses transfer as exact fractions.

## Development

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Run `npm test` for scoring tests. Run `npm run build` to generate the static site in `dist/`, then `npm run preview` to serve the production build locally.

## Deployment

Push to `master` to test, build, and publish to GitHub Pages. You can also run the **Deploy UltiScore to Pages** workflow manually. The production domain is `ulti.tamaserdos.com`.
