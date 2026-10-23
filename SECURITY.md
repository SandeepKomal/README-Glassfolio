# Security Policy

README Glassfolio is a browser-first application that reads GitHub data and can optionally write generated profile files to a user's own GitHub profile repository.

## Supported version

Security fixes are targeted at the latest state of the `main` branch.

## Security model

The application has two distinct trust levels.

### Public/read-only mode

Profile generation can use public GitHub data without a credential. Generated content is created in the browser.

### Authenticated mode

A GitHub token is only needed for higher API limits, expanded contribution data, or publishing generated files.

Publishing is restricted to the authenticated user's own profile repository. The application checks the authenticated account before writing.

## Token guidance

Use a **fine-grained personal access token** with the narrowest possible scope.

For normal profile publishing, restrict repository access to:

    <username>/<username>

Required repository permission:

- **Contents: Read and write**

Avoid granting access to unrelated repositories.

For optional daily-update automation in a user's profile repository, the generated workflow may also require workflow-file write capability when the user initially publishes that workflow. The application explains this requirement when applicable.

Never paste a real token into source code, commit messages, issues, documentation, screenshots, or test fixtures.

## Browser security controls

The current page security posture includes:

- a restrictive Content-Security-Policy
- no inline scripts
- no inline event handlers
- no string evaluation such as `eval`
- restricted network destinations
- protection against arbitrary HTML injection in the profile preview
- no token storage in browser local storage; tokens are checked to look like GitHub tokens before any request, and the token boxes are emptied when the page is hidden
- no token inclusion in share links
- a no-referrer policy
- refusing to be framed: GitHub Pages can't send `X-Frame-Options` or `frame-ancestors`, so `js/canonical.js` hides the page and breaks out when another site loads it in a frame (clickjacking)

The existing `test/page.test.js` suite validates key parts of this posture. Security changes should update the documentation and tests together.

## GitHub Pages workflow security

The Pages workflow in `.github/workflows/pages.yml`:

- runs only for pushes to `main` or manual dispatch
- runs the full test suite first; the deploy job starts only if it passes
- grants `pages: write` and `id-token: write` to the deploy job only; everything else gets `contents: read`
- uses the dedicated `github-pages` environment
- does not require application secrets
- does not execute profile-generated content
- uses official GitHub Actions for checkout and Pages deployment, each pinned to a full commit SHA, with checkout credentials not persisted

## Continuous checks

Every pull request and every push to `main` runs:

- `.github/workflows/ci.yml`: the full test suite on Node 18, 20 and 22, and a zizmor audit of the workflow files
- `.github/workflows/browsers.yml`: every page in Chromium, Firefox and WebKit on desktop, tablet and phone profiles, failing on script errors, policy violations, requests to other sites, layout breakage, or a page that stays visible inside another site's frame
- `.github/workflows/codeql.yml`: CodeQL with the `security-extended` queries, for the JavaScript and for the workflows

CodeQL also runs weekly. Dependabot proposes updates to the pinned actions.

Do not place user tokens or other secrets into the Pages workflow.

## Daily profile-update workflow

The application has an optional feature that can generate a workflow for the user's own profile repository. That workflow is separate from this repository's Pages deployment.

Before enabling it, understand that:

- it can write to the profile repository
- it periodically rebuilds README assets
- managed files may be overwritten
- the generated workflow is intended to be readable and self-contained
- the user should review the generated workflow before enabling it

## Reporting a vulnerability

Please do not publish credentials, tokens, or a working exploit in a public issue.

For a suspected security problem, provide the maintainers with:

1. the affected component or file
2. a concise description of the impact
3. reproducible steps
4. a safe proof of concept that does not expose real credentials

Use GitHub's private security-reporting mechanisms when enabled for the repository. When private reporting is unavailable, contact the repository maintainer privately before public disclosure.

## Security maintenance checklist

Before merging security-sensitive changes:

- run `npm test` (CI runs it too, and the deploy refuses to publish without it)
- inspect changes to Content-Security-Policy directives
- review every new network destination
- verify tokens are not persisted
- verify publishing still targets only the authenticated user's profile
- verify GitHub Actions permissions remain least-privilege
- check that documentation matches the actual behavior

## License

README Glassfolio is released under the MIT License. See [LICENSE](LICENSE).
