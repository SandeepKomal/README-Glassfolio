# Contributing to README Glassfolio

Thanks for helping. Bug reports, fixes, new designs and showpieces, and documentation improvements are all welcome.

## Getting started

You need Node 18 or later. There are no dependencies to install.

```bash
git clone https://github.com/SandeepKomal/README-Glassfolio.git
cd README-Glassfolio
npm test             # the full test suite
npm run serve        # the website at http://localhost:8080
node cli.js --sample # the CLI with built-in sample data, no network
```

## Making a change

1. Open an issue first for anything large, such as a new design or a change to how publishing works, so we can agree on the approach.
2. Keep pull requests focused on one change, with tests for new behaviour.
3. Run `npm test` before you push. Every test must pass.
4. Describe in the pull request what changed and how you checked it. Add a screenshot for anything visual.

## Ground rules

- **No runtime dependencies.** The website and CLI run as plain JavaScript files. Development tools that need Playwright live in `tools/` and are optional.
- **Keep the security policy intact.** The pages ship a strict Content-Security-Policy, and `test/page.test.js` guards it. Don't add inline scripts or styles, `innerHTML`, `eval`, new network hosts or stored tokens. If a change really needs one of these, update the policy, `SECURITY.md` and the tests together and explain why in the pull request.
- **Use the sample identity in examples.** Screenshots, tests and docs use the `DevopsNimbus` sample profile or obvious placeholders such as `your-username`, never a real person's account. `test/names.test.js` checks this.
- **Images must stay safe and small.** Cards are SVG files that GitHub shows as images: CSS animation only, no scripts, and a still frame that is the finished design. Motion must respect `prefers-reduced-motion`.
- **Keep text readable.** New colours must pass the contrast checks in the tests, in light and dark.

## Adding a design or a showpiece

- Designs live in `js/worlds.js` and are listed in `WORLDS` in `js/core.js`. Each needs a palette for light and dark, a card frame, headings, heatmap cells, a streak ring, a banner, a section divider and a footer. `test/worlds.test.js` runs every design through the same checks.
- Showpieces live in `js/showpieces.js` and are listed in `SHOWPIECES` in `js/core.js`. Draw from the profile's own data and use the README's theme colours. `test/showpieces.test.js` checks every showpiece.

## Reporting security problems

Please don't open a public issue for a security problem. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
