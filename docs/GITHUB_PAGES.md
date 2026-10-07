# GitHub Pages Deployment

README-Glassfolio is a static site, so it can be deployed directly to GitHub Pages without a frontend build system.

## Deployment workflow

The repository includes:

    .github/workflows/pages.yml

The workflow:

1. runs on pushes to `main`
2. can also be started manually with **Run workflow**
3. checks out the repository
4. configures GitHub Pages
5. uploads the repository root as the Pages artifact
6. deploys that artifact to the `github-pages` environment

The workflow uses official GitHub Actions for checkout and Pages deployment.

## Required repository setting

After the workflow is merged, open:

**Repository → Settings → Pages**

Under **Build and deployment**, select:

**Source → GitHub Actions**

The Pages environment should be named:

    github-pages

GitHub's Pages deployment model requires the deployment job to have `pages: write` and `id-token: write` permissions and an environment for the deployment. The workflow in this repository already declares these permissions.

## Expected URL

For this repository, the project site is expected at:

    https://sandeepkomal.github.io/README-Glassfolio/

The URL is based on the repository owner and repository name. GitHub may take a short period to publish the first deployment.

## Why no build step is needed

The repository already contains:

    index.html
    css/style.css
    js/*.js

There is no frontend bundler or generated `dist/` directory. Pages can therefore publish the repository root directly.

## Deployment verification

After merging the PR:

1. Open the **Actions** tab.
2. Open the **Deploy README-Glassfolio to GitHub Pages** workflow.
3. Confirm the run succeeds.
4. Open the Pages URL from the workflow environment.
5. Test the sample-data flow first.
6. Test a real GitHub profile.
7. Verify the preview, theme controls, downloads, and publishing UI.

## Common deployment problems

### 404 from the Pages URL

Check that:

- the workflow completed successfully
- **Settings → Pages → Source** is set to **GitHub Actions**
- the workflow deployed the `github-pages` environment

### CSS or JavaScript files return 404

README-Glassfolio uses repository-relative paths. Keep:

    index.html
    css/
    js/

at the repository root.

### The site loads but a feature is blocked by CSP

The site intentionally uses a strict Content-Security-Policy. Do not loosen the policy casually. Review [SECURITY.md](../SECURITY.md) and the existing page-security tests before introducing any new browser capability.

### A future code change breaks Pages

Run the existing test suite before merging:

    npm test

Then manually verify the site after deployment.

## Maintenance

When changing the application:

- keep the root entry point at `index.html`
- preserve relative asset paths unless the HTML is updated together
- keep security-sensitive changes covered by tests
- keep the Pages workflow limited to deployment responsibilities
- do not add application secrets to the Pages workflow

## Custom domains

A custom domain is not enabled by this workflow. Configure a custom domain separately through repository Pages settings and follow GitHub's custom-domain guidance.

## Documentation assets

Existing screenshots under `docs/` are independent of Pages deployment and should not be deleted or replaced as part of deployment changes.
