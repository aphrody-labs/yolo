---
name: typescript7-bun
description: This skill should be used when the user asks about "TypeScript 7", "tsc 7", "tsgo", "Corsa", "upgrade to TypeScript 7", "TypeScript 7 breaking changes", "tsconfig for Bun", "Cannot find name 'Bun'", "bun-types with TypeScript 7.1", or is editing the TypeScript source repository (packages/typescript). Not for general TypeScript typing questions.
version: 0.1.0
---

# TypeScript 7 with Bun

TypeScript 7 is the native port of the compiler, written in Go (code name **Corsa**), replacing the JavaScript-based compiler of TypeScript 6 and earlier (**Strada**). Bun transpiles TypeScript but never type-checks it: type-checking is `tsc --noEmit`.

## Verify before asserting

1. Run `tsc --version` (or `bunx tsc --version`) and read `node_modules/typescript/package.json`. Version 7.0.2 is installed in the repository.
2. Run `tsc --help --all` for the live option list and defaults, and report what it prints. In 7.0.2 it showed `--target` defaulting to `es2025`, `--strict` and `--esModuleInterop` to `true`, and no default for `--module`.
3. For options not on disk (the handbook and tsconfig reference are not shipped), fetch `https://www.typescriptlang.org/tsconfig` or use Context7.

## Command and packaging facts

1. Use `tsc` exactly as with TypeScript 6 from 7.0 RC onward. The native-preview package README reserves the `tsgo` command for other builds.
2. The `typescript` npm package ships `bin/tsc`; the compiled binary and the `lib.*.d.ts` files come from a platform package such as `@typescript/typescript-linux-x64`.
3. The programmatic API is reachable only through explicitly unstable entry points: `typescript/unstable/sync`, `/async`, `/fs`, `/proto`, `/ast` (with `is`, `factory`, `utils`, `scanner`, `visitor`, `clone`). The root export is a version shim. Do not build durable tooling on `unstable/*` without pinning the version.
4. Common commands: `tsc --noEmit`, `tsc -p ./path/tsconfig.json`, `tsc -b`, `tsc --showConfig`, `tsc --ignoreConfig file.ts`, `tsc --init`, `tsc --watch`.
5. Passing files on the command line while a `tsconfig.json` exists fails with `error TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline`. Add `--ignoreConfig` to compile those files with command-line options only (observed with `tsc` 7.0.2 when type-checking a single script).

## Options removed in 7.0 (verified with `tsc` 7.0.2)

Each of these fails with `TS5102` or `TS5108` ("has been removed. Please remove it from your configuration"), checked one at a time on a minimal tsconfig: `baseUrl` (use `paths` with relative targets), `esModuleInterop: false`, `alwaysStrict: false`, `moduleResolution: node10`, `target: es5`, `module: amd`, `downlevelIteration`, `outFile`. A file using a Node global such as `process` fails with `TS2591` until `types` lists the package (the empty `types` default). New flags present in `tsc --help --all`: `--checkers`, `--builders` (parallel project builds under `-b`), `--singleThreaded`, `--stableTypeOrdering`; `--libReplacement` and `--noUncheckedSideEffectImports` also exist. Default values for the new flags are not printed by `tsc --showConfig`: read the official 7.0 release notes before stating them.

## tsconfig for Bun

TypeScript 6 and later (including 7) default `types` to an empty array. List the packages explicitly or `Bun`, `Request` and other globals disappear ("Cannot find name 'Bun'"):

```jsonc
{ "compilerOptions": { "types": ["bun"] } }
```

Keep `@types/bun` (which pulls `bun-types`) installed: `types` selects packages, it does not install them. Copy `examples/tsconfig.bun.example.jsonc` as the baseline; it mirrors the template `bun init` generates (`src/runtime/cli/init/tsconfig.default.json` in the Bun source). Add `"DOM"` to `lib` only for browser-facing code.

Type environment variables by interface merging:

```ts
declare module "bun" {
  interface Env {
    AWESOME: string;
  }
}
```

## bun-types and TypeScript 7.1

`bun-types` routes TypeScript 7.1 and newer, through `typesVersions`, to `ts7.1/index.d.ts`. That entry adds pattern ambient modules for import attributes (`declare module "*" with { type: "text" }`): `text`, `file`, `md`, `markdown`, `toml`, `yaml`, `jsonc`, `json5`, `xml`, `sqlite` and `html`. `json` and `macro` are deliberately absent so a JSON import keeps its precise type. Older compilers (7.0.x included) never see these declarations. Check the installed pair (`typescript`, `bun-types`) before relying on typed `with { type: … }` imports.

## Differences from TypeScript 6 that affect code

The documented differences concentrate on JavaScript with JSDoc, CommonJS and a few checker rules. The most relevant ones (condensed from `packages/typescript/tsc/CHANGES.md` in `references/corsa-changes.md`):

1. **`skipLibCheck`**: conflicting declarations now error at every contributing site, so errors that were hidden in non-`.d.ts` files can appear.
2. **Positions** are UTF-8 offsets, not UTF-16 (affects tools that map offsets).
3. **JavaScript**: constructor functions and prototype expandos are no longer recognised (use `class`); Closure syntax is dropped, `@class` and `@enum` lose their special meaning and `@author` parses as a generic tag; `arguments` no longer implies a rest parameter; values are not types in JSDoc (`typeof` is required); `@overload` on arrow functions is ignored.
4. **CommonJS**: a module cannot mix `module.exports = …` with `module.exports.x = …`.
5. **Template literal inference** consumes full Unicode code points, so an emoji is no longer split into surrogate halves.
6. With `strict: false`, omitting arguments for parameters typed `undefined`, `unknown` or `any` is an error (`void` is still optional).

## Upgrade checklist

1. Install `typescript@^7` and keep `@types/bun`; add `"types": ["bun"]`.
2. Run `tsc --noEmit` on the project and fix the new diagnostics (declaration conflicts first).
3. Replace `tsgo` scripts and wrappers with `tsc` when the project is on 7.0 RC or later.
4. Check editor integration: the language server is native too (`packages/vscode-typescript` in the TypeScript repository).
5. Pin or document the `typescript` and `bun-types` versions together (for example a `catalog:` entry) so the 7.1 import-attribute typings do not appear by accident.
6. Report the exact `tsc --version` and the command exit codes when stating that the type-check passes.

## Working inside the TypeScript repository

When the working directory is the TypeScript source (the `packages/typescript` submodule), read `references/typescript-submodule.md` before editing: it covers `npx hereby` tasks, baseline tests, contribution rules and the AI-disclosure policy.

## Additional resources

- **`references/corsa-changes.md`** - Strada to Corsa differences, condensed
- **`references/typescript-submodule.md`** - build, test and contribution rules for the TypeScript repository
- **`examples/tsconfig.bun.example.jsonc`** - recommended baseline tsconfig for Bun
- `bun-docs-router` skill - Bun's own `typescript` and `typescript-6` pages
