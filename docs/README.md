# README-Glassfolio Documentation

README-Glassfolio is a static, browser-first GitHub profile README generator. It creates themed README content and SVG assets from GitHub profile data and can optionally publish the result to a user's own profile repository.

## Documentation

| Guide | Purpose |
| --- | --- |
| [How to use](HOW_TO_USE.md) ([PDF](Patch-your-profile-guide.pdf)) | Step-by-step guide with screenshots: profile repository, token, generating, publishing and daily updates |
| [GitHub Pages](GITHUB_PAGES.md) | Deployment, configuration, verification, and maintenance of the hosted site |
| [Security](../SECURITY.md) | Security model, token handling, CSP, publishing permissions, and reporting guidance |

## Existing visual documentation

The `docs/` directory also contains the project's existing screenshots and previews:

- `website-preview.jpg`
- `mobile-preview.jpg`
- `example-readme-dark-and-light.jpg`
- `guide/`: the numbered screenshots used by the how-to guide

These assets are part of the project documentation and should be preserved when documentation is updated.

## Runtime model

The project is intentionally static:

- `index.html` is the browser entry point.
- `css/` contains the site styles.
- `js/` contains the generator, GitHub API integration, preview, publishing, automation, and download logic.
- No application build step is required for the hosted site.
- Public profile data is read directly from GitHub's API.

## Local development

Use the existing project command:

    npm run serve

Then open:

    http://localhost:8080

Run the test suite with:

    npm test

## License

The repository is distributed under the MIT License. See the root [LICENSE](../LICENSE) file.

## Scope of the Pages deployment

The GitHub Pages deployment is only for hosting the README-Glassfolio web application. It does not publish generated profile files to your account automatically.

Profile publishing is a separate feature inside the application and uses the GitHub API with a user-supplied credential.
