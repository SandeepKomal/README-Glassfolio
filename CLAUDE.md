# CLAUDE.md

Guidance for Claude Code (and anyone else) working in this repository.

README Glassfolio turns a GitHub username into a designed profile README: SVG cards, an animated showpiece and optional daily updates. It ships as a static website (readme-glassfolio.in, on GitHub Pages), a CLI (`cli.js`) and a GitHub Action (`action.yml`). Everything is plain JavaScript with **no runtime dependencies** and no build step.

## Commands

```bash
npm test             # the full suite (node --test); must pass before any push
npm run serve        # the website at http://localhost:8080
node cli.js --sample # the CLI with built-in sample data, no network
```

Node 18 or later. CI runs the suite on Node 18, 20 and 22.

## Layout

- `index.html`, `css/style.css`, `js/site.js`, `js/app.js`: the website and studio
- `js/core.js`: the generator (README text, model, options, share links); shared by the site, CLI and daily workflow
- `js/cards.js`, `js/worlds.js`, `js/showpieces.js`, `js/universe.js`: the SVG images
- `js/preview.js`: the README preview, built from a strict whitelist of tags and attributes
- `js/github.js`, `js/publish.js`: GitHub API reads and publishing; `js/automation.js`: the daily-update workflows
- `js/canonical.js`: runs first in the head (the `/index.html` redirect and the anti-framing check)
- `privacy/`, `terms/`, `how-to-use/`, `license/`: the other pages (the `.html` files beside `index.html` only redirect to them)
- `test/`: the suite; `tools/`: optional Playwright helpers (pinned in `tools/package-lock.json`), not shipped to users

## Security rules (non-negotiable)

These protect a live site where people paste GitHub tokens. `test/page.test.js` and `test/preview.test.js` enforce most of them; change the policy, `SECURITY.md` and the tests together, and say why in the pull request.

- **Content-Security-Policy stays strict.** No inline scripts, inline styles, `style=""` attributes, inline event handlers, `eval`, `new Function`, `innerHTML` or `document.write`. Scripts come from this site only, as `js/<file>.js?v=dev` (the deploy stamps the version).
- **No new network destinations.** The homepage may talk to `api.github.com` only; everything else (scripts, styles, images) comes from this site, and there are no web fonts. Adding a host needs a strong reason.
- **Tokens are never stored or shared:** not in `localStorage`, share links, options, logs, commits or test fixtures. They are sent only to `api.github.com`, in the `Authorization` header (never a URL), and publishing writes only to the signed-in user's own `<user>/<user>` repository. A token must look like one (`[A-Za-z0-9_]{20,255}`) before any request is made, and both token boxes are emptied when the page is hidden. Test fixtures use obviously fake tokens of that shape.
- **Untrusted text is escaped where it lands.** Profile data, repo descriptions and share-link fields (`role`, `tagline`, `stack`, `openTo`, `certs`, `impact`, …) can be hostile:
  - Markdown prose goes through `mdText()`, table cells through `cell()`, HTML attributes and SVG through `esc()`.
  - Links must be `https?:` (or `mailto:` in the preview).
  - Maps keyed by user input use `Map`, never a plain object (prototype pollution).
- **SVG cards** use CSS animation only (no scripts), and a still frame that is the finished design, respecting `prefers-reduced-motion`.
- **Use the sample identity** (`DevopsNimbus`) or placeholders (`your-username`) in examples, tests and docs, never a real person's account. `test/names.test.js` checks this (the only real accounts linked are the project's own repositories and the author's profile in the copyright line).

## Workflows

- `ci.yml`: tests on every PR and push to `main`, plus a zizmor audit of the workflows.
- `codeql.yml`: CodeQL `security-extended` for JavaScript and Actions.
- `browsers.yml`: `tools/browser-check.js`, in Playwright's container image (pinned by digest; keep its tag on the Playwright version in `tools/`), in Chromium, Firefox and WebKit on desktop, tablet and phone profiles: no script or console errors, no policy violations, no requests to other sites, no sideways scroll or wrapping header, images load, the sample README builds, and the page hides itself when framed.
- `pages.yml` ("Deploy"): runs the tests, then deploys. Only the deploy job holds `pages: write` / `id-token: write`.
- `release.yml`: pushing a tag like `v1.0.0` (it must match `package.json`) runs the tests, then publishes a GitHub release with generated notes. Only the release job holds `contents: write`.

When editing workflows:

- Pin every action to a full commit SHA with the tag as a comment (`uses: owner/action@<sha> # v1`).
- Set `persist-credentials: false` on checkouts.
- Keep `permissions` least-privilege, at job level.
- Never interpolate `${{ … }}` from untrusted input straight into `run:`; pass it through `env:`.
- Run `actionlint` and `zizmor .github/workflows/` before pushing.

## Before a change reaches users

1. `npm test` passes locally (all of it, not a filtered subset).
2. For page or CSS changes: run `node tools/browser-check.js` (after `npm ci --prefix tools`), and look at the page at desktop and phone widths.
3. For anything touching input, output, tokens, network or workflows, re-read the diff against the security rules above, and add a test for any new rule or fixed hole.
4. Open a pull request; CI (tests, browsers, zizmor, CodeQL) must be green before merging. The deploy runs the tests again and won't publish on failure.
