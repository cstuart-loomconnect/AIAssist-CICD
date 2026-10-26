# AIAssist-CICD

Shared GitHub Actions workflows for the [AIAssist](https://github.com/cstuart-loomconnect/AIAssist) Salesforce package. The package repo keeps only thin caller workflows; everything that actually runs lives here.

## What is in here

| Path | What it is |
|---|---|
| `.github/workflows/pr-validation.yml` | Reusable. Every check for a pull request between branches: Prettier + ESLint, SLDS lint, Salesforce Code Analyzer, naming conventions, API version consistency and hardcoded IDs/URLs, then one scratch org that runs all local Apex tests, the coverage gate and the browser tests. |
| `.github/workflows/scratch-org-tests.yml` | Reusable. Creates a scratch org, deploys, assigns permission sets, runs `RunLocalTests` and enforces coverage. If the calling repo has an `e2e/` Playwright suite, it then runs those browser tests in the **same org** whenever the deploy succeeded (input `e2e`, on by default), so the org is created and deployed once, and attaches the report as `e2e-report`. Set `apex-tests: false` for a browser-tests-only run. Deletes the org at the end. Called by the two workflows either side of it. |
| `.github/workflows/weekly-build.yml` | Reusable. Scratch org run (Apex and browser tests) against a branch; opens an issue in the package repo if it fails. Weekly, because each run uses one of the Dev Hub's daily scratch org creations. |
| `.github/workflows/self-check.yml` | Runs on this repo: lints the workflow YAML and syntax-checks the scripts. |
| `scripts/` | `check-naming.js`, `check-api-version.js`, `check-hardcoded.js`, `check-coverage.js`, `assign-permsets.js`, and `actionlint-annotations.js` for the self-check. |
| `config/` | `code-analyzer.yml`, `naming-exceptions.txt`, `hardcoded-exceptions.txt`. |

## The checks

| Check | Fails when |
|---|---|
| Prettier + ESLint | Files aren't formatted, or LWC/Aura JavaScript has lint errors. |
| SLDS Validator | LWC HTML/CSS breaks SLDS rules. The linter version is pinned in `SLDS_LINTER_VERSION`; bump it deliberately. |
| Salesforce Code Analyzer | A High (severity 2) or worse finding from the `Recommended` rules, including CRUD/FLS and SOQL injection. |
| Naming conventions | An API name has underscores, spaces or the wrong case. |
| API version consistency | Any `-meta.xml` file's `apiVersion` differs from `sourceApiVersion` in `sfdx-project.json`. |
| Hardcoded IDs and URLs | Apex, LWC, Aura, Visualforce or a Flow contains a 15/18-character record ID or an org-specific URL (My Domain, Lightning, Experience Cloud, Visualforce or instance hosts). Comments are ignored, test classes may use made-up IDs, and Named/External Credentials, Remote Site Settings and CSP Trusted Sites may hold URLs. |
| Scratch org + Apex and browser tests | The deploy fails, an Apex test fails, org-wide coverage is under 75%, or a browser test fails. Only runs once every check above passes. |

Each reusable workflow checks out the calling repo at the root and this repo into `.cicd/`, so the scripts and config here run against the package's `force-app` folder.

## How the package repo calls it

```yaml
# AIAssist: .github/workflows/pr-validation.yml
on:
  pull_request:
    branches: [development, master]
jobs:
  validate:
    uses: cstuart-loomconnect/AIAssist-CICD/.github/workflows/pr-validation.yml@v1
    with:
      cicd-ref: v1
    secrets: inherit
```

`cicd-ref` must match the `@ref` in `uses:`. GitHub loads the workflow file from the `@ref`, but the scripts and config are checked out separately, so both need to point at the same version.

## Browser tests on their own

PR validation and the weekly build already run the browser tests in the same scratch org as the Apex tests, so you don't need a separate browser-test workflow on pull requests. For an on-demand browser-only run (for example while writing a new Playwright test), call `scratch-org-tests.yml` directly with `apex-tests: false`. That creates its own scratch org, so trigger it manually (`workflow_dispatch`) rather than on every PR:

```yaml
jobs:
  browser-tests:
    uses: cstuart-loomconnect/AIAssist-CICD/.github/workflows/scratch-org-tests.yml@v1
    with:
      cicd-ref: v1
      apex-tests: false
    secrets: inherit
```

## Releasing a change

Callers pin `@v1`, which is a **branch** here (GitHub resolves `@v1` to a branch or a tag). A change on `main` does nothing to the package repo until `v1` moves.

1. Open a PR here into `main` and merge it once `self-check` passes.
2. Release it by bringing `v1` up to `main`: `git checkout v1 && git merge --ff-only main && git push origin v1`.
3. For a breaking change (a new required input or secret, a renamed workflow), create a `v2` branch from `main` instead, and update the callers in AIAssist plus the nested `@v1` references inside `pr-validation.yml` and `weekly-build.yml`.

Don't also create a `v1` tag: a branch and a tag with the same name make the reference ambiguous.

## One-off setup

- **Visibility.** A public repo can only call reusable workflows from a public repo. AIAssist is public, so this repo must be public too. If you make AIAssist private, this one can be private as well; then go to **Settings > Actions > General > Access** here and allow access from your other repositories.
- **Secret.** The scratch org jobs need `DEVHUB_SFDX_AUTH_URL` in the **calling** repo (AIAssist), created with `sf org auth show-sfdx-auth-url --target-org <devhub> --no-prompt`. Callers pass it with `secrets: inherit`.
- **Required checks.** To block merges on failures, add the PR Validation jobs as required status checks in AIAssist's branch protection for `development` and `master`.

## Running the checks locally

Clone this repo next to AIAssist, then from the AIAssist folder:

```bash
node ../AIAssist-CICD/scripts/check-naming.js force-app ../AIAssist-CICD/config/naming-exceptions.txt
node ../AIAssist-CICD/scripts/check-api-version.js force-app sfdx-project.json
node ../AIAssist-CICD/scripts/check-hardcoded.js force-app ../AIAssist-CICD/config/hardcoded-exceptions.txt
sf code-analyzer run --workspace force-app --config-file ../AIAssist-CICD/config/code-analyzer.yml --rule-selector Recommended
```
