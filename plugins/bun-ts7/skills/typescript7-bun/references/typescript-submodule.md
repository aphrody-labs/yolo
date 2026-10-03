# Working in the TypeScript repository

Applies when the working directory is the TypeScript source, for example the `packages/typescript` submodule (branch `main`, commit `f9f8d012`). It holds the native compiler and language server (Go). Sources: `.github/copilot-instructions.md`, `CONTRIBUTING.md`, `packages/typescript/README.md`. Re-read them for exact rules.

## Layout

- `tsc/internal` - compiler and language-server code (most development happens here).
- `packages/typescript` - the JavaScript API and npm package sources.
- `packages/vscode-typescript` - the VS Code extension.
- `tools` - repository tools, generators, pipelines.
- The root has a Go workspace (`go.work`) with modules in `tsc/` and `tools/`.

## Prerequisites

Go 1.27, Node.js 24, npm (the version in `packageManager`), Git. On Windows enable long paths: `git config --global core.longpaths true`. Setup: `npm ci`.

## Tasks (`hereby`)

```bash
npx hereby --tasks         # list tasks
npx hereby build           # native compiler to built/local/tsc
npx hereby test            # compiler and language-service Go tests
npx hereby test:all        # plus benchmarks, tools and API tests
npx hereby lint
npx hereby format          # npx hereby check:format checks without changing files
npx hereby generate        # regenerate sources, assets, localization, vendored files
npx hereby validate        # build, test, lint, format
npx hereby validate --api  # also the TypeScript API tests (needed when touching packages/typescript API code)
npx hereby validate --all  # when editing tools, benchmarks or other ancillary parts
npx hereby baseline-accept # accept new baselines
go -C ./tsc test -run='TestLocal/<test name>' ./internal/testrunner
```

## Tests

- New compiler tests are `.ts`/`.tsx` files in `tsc/testdata/tests/cases/compiler/` with `// @option: value` directives (`@target`, `@module`, `@moduleResolution`, `@strict`, `@checkJs`) and `// @filename:` only for multi-file tests or single JavaScript files. A comma list runs several settings.
- Output goes to `tsc/testdata/baselines/local`; accepted baselines live in `tsc/testdata/baselines/reference`. A diff against `reference` is a failure to review, not necessarily a bug.
- Order of work: write a minimal failing test, run it, accept baselines, implement, run again, accept baselines. Commit after each step.
- Editor features cannot be tested with compiler tests; they need language-server integration tests.

## Rules for changes

1. Run `npx hereby validate` (and `--api` when relevant) at the end of a session; failures from it are the first priority.
2. Do not add or change dependencies unless asked.
3. Do not remove debug assertions or panic calls.
4. Do not wrap test or build commands in `timeout` unless debugging a hang.
5. Pull requests need a cited issue number (`Fixes #N`), an analysis, a fix description and the validate checklist, in the repository's PR template.

## AI-assistance policy (upstream contributions)

`CONTRIBUTING.md` allows AI-assisted patches provided the contributor read and understands them, can discuss them in review, **and discloses AI authorship in the pull request description**; an undisclosed AI-looking PR is closed without review. The project does not accept bulk, agent-driven contributions (agents sweeping issues or labels to open PRs), nor automated comments. An autonomous agent must not open pull requests as part of a queue-driven workflow; a pull request is acceptable only when a specific human chose the issue and will shepherd it through review.

This differs from the repository's own rule for its private branches (commits under `aphrody-dev`, no agent attribution). Do not open an upstream pull request on the user's behalf without an explicit instruction naming the issue, and apply the upstream disclosure rule to it.
