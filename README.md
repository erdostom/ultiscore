# UltiScore

A mobile-first Hungarian Ulti score sheet. [Open the calculator](https://ulti.tamaserdos.com/).

Enter an integer game score for each of up to four players. Leave unused slots empty. For each player, the calculator adds the differences between their game score and every other participant’s score, adds their individual adjustment, and multiplies that total by the selected multiplier. Individual adjustments must sum to zero. Blank adjustments count as zero.

The multiplier defaults to 0.25. Choose a preset or enter a custom number, including zero or a negative value. The last valid setting is saved in the browser. Scores stay in memory for the current page.

## Development

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Run `npm test` for scoring tests. Run `npm run build` to generate the static site in `dist/`, then `npm run preview` to serve the production build locally.

## Deployment

Push to `master` to test, build, and publish to GitHub Pages. You can also run the **Deploy UltiScore to Pages** workflow manually. The production domain is `ulti.tamaserdos.com`.
