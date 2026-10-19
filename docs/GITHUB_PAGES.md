# GitHub Pages deployment

The website is static files with no build step, so GitHub Pages serves the repository root directly.

## How it deploys

`.github/workflows/pages.yml` runs on every push to `main` (and from **Run workflow**). It:

1. checks out the repository,
2. stamps a build number into the asset links of `index.html`, `privacy.html`, `terms.html` and `how-to-use.html`, and writes the same number to `version.txt`,
3. uploads the repository root and deploys it to the `github-pages` environment.

The build stamp gives every deploy new asset addresses, so browsers load the new scripts and styles instead of cached ones. A page that was itself cached compares its build with `version.txt` and reloads once if they differ.

The workflow needs `contents: read`, `pages: write` and `id-token: write`, uses only GitHub's official actions, and has no secrets.

## Host your own copy

1. Fork the repository.
2. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` or run the workflow. The site appears at `https://<owner>.github.io/<repository>/`.

To use a custom domain, add it under **Settings → Pages** and follow GitHub's custom-domain guide. The project's own site is served at [readme-glassfolio.in](https://readme-glassfolio.in/).

## Keep in mind

- Pages and assets use relative paths, so keep `index.html`, `css/` and `js/` at the repository root.
- The pages ship a strict Content-Security-Policy. A new network host or browser capability needs the policy, [SECURITY.md](../SECURITY.md) and `test/page.test.js` updated together.
- Run `npm test` before merging. After a deploy, check the sample profile, a real username, and the publish panel.

## Troubleshooting

| Problem | Check |
| --- | --- |
| The site returns 404 | The workflow run succeeded, and **Settings → Pages → Source** is **GitHub Actions**. |
| CSS or scripts return 404 | `css/` and `js/` are still at the repository root next to `index.html`. |
| A feature is blocked in the browser console | The Content-Security-Policy blocks it. Allow it deliberately, as described above, or don't use it. |
| Visitors still see the old version | They are seeing a cached page; it reloads itself once, or a hard refresh (Ctrl+Shift+R) fixes it. |
