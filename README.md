# AIAssist-CICD

Shared GitHub Actions workflows for the [AIAssist](https://github.com/cstuart-loomconnect/AIAssist) Salesforce package. The package repo keeps only thin caller workflows; everything that actually runs lives here.

## What is in here

| Path | What it is |
|---|---|
| `.github/workflows/pr-validation.yml` | Reusable. Every check for a pull request between branches: Prettier + ESLint, SLDS lint, Salesforce Code Analyzer, npm audit, naming conventions, then a scratch org deploy with all local Apex tests and a coverage gate. Posts one results comment on the PR. |
| `.github/workflows/scratch-org-tests.yml` | Reusable. Creates a scratch org, deploys, assigns permission sets, runs `RunLocalTests`, enforces coverage and deletes the org. Called by the two workflows either side of it. |
| `.github/workflows/pr-hygiene.yml` | Reusable. Labels the PR by area and checks the title is `type: subject` with a lowercase subject. |
| `.github/workflows/nightly.yml` | Reusable. Scratch org test run against a branch; opens an issue in the package repo if it fails. |
| `.github/workflows/self-check.yml` | Runs on this repo: lints the workflow YAML and syntax-checks the scripts. |
| `scripts/` | `check-naming.js`, `check-coverage.js`, `assign-permsets.js`, `pr-comment.js`. |
| `config/` | `code-analyzer.yml`, `labeler.yml`, `naming-exceptions.txt`. |

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

## Releasing a change

Callers pin `@v1`, so a change here does nothing to the package repo until the tag moves.

1. Open a PR here and merge it into `main` once `self-check` passes.
2. Move the tag: `git tag -f v1 && git push -f origin v1`.
3. For a breaking change (a new required input or secret, a renamed workflow), tag `v2` instead and update the callers in AIAssist, plus the nested `@v1` references inside `pr-validation.yml` and `nightly.yml`.

## One-off setup

- **Visibility.** A public repo can only call reusable workflows from a public repo. AIAssist is public, so this repo must be public too. If you make AIAssist private, this one can be private as well; then go to **Settings > Actions > General > Access** here and allow access from your other repositories.
- **Secret.** The scratch org jobs need `DEVHUB_SFDX_AUTH_URL` in the **calling** repo (AIAssist), created with `sf org auth show-sfdx-auth-url --target-org <devhub> --no-prompt`. Callers pass it with `secrets: inherit`.
- **Required checks.** To block merges on failures, add the PR Validation and PR Hygiene jobs as required status checks in AIAssist's branch protection for `development` and `master`.

## Running the checks locally

Clone this repo next to AIAssist, then from the AIAssist folder:

```bash
node ../AIAssist-CICD/scripts/check-naming.js force-app ../AIAssist-CICD/config/naming-exceptions.txt
sf code-analyzer run --workspace force-app --config-file ../AIAssist-CICD/config/code-analyzer.yml --rule-selector Recommended --rule-selector AppExchange
```
