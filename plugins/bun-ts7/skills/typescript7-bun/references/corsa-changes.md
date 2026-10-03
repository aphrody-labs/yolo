# Strada to Corsa: intentional differences

Condensed from `packages/typescript/tsc/CHANGES.md` (TypeScript repository commit `09b1db06`, 2026-10-01). "Strada" is the JavaScript-based compiler (TypeScript 6 and earlier); "Corsa" is the native Go compiler (TypeScript 7). Re-read the original file for exact wording and examples.

## JavaScript support: intent

Corsa exposes TypeScript features in `.js` files, working exactly as in TypeScript with different syntax. Strada had many JavaScript-only features and subtly different rules (for example it let calls skip parameters typed `any`); Corsa uses the TypeScript rule in both. Supported categories: JSDoc tags, expando declarations, CommonJS syntax. Closure-specific features are mostly removed.

## Declaration emit

Core parts of declaration emit and JavaScript parsing were rewritten. `.d.ts` output from `.js` input changes substantially; matching Strada exactly is a non-goal. Output in the presence of errors (including `ts-ignore` / `ts-expect-error`) differs. Incorrect `.d.ts` from a `.js` file should be reported as a bug.

## Removed or changed JSDoc tags and types

| Strada | Corsa |
| --- | --- |
| `?` (unknown type) | use `any` |
| `Module:file~id` namepath | use `import("file").id` |
| `@class` / `@constructor` | no constructor function; use `class` |
| `@enum` | use `@typedef` plus `@type {Record<string, E>}` |
| `@author` | parsed as a generic tag (`@treehouse` now starts a new tag) |
| identifier-named typedef (`/** @typedef {T} */ name;`) | `/** @typedef {T} name */` |
| Closure `function(string): void` | `(s: string) => void` |
| automatic `typeof` insertion for value names | write `typeof o` |

JSDoc types are no longer parsed for Closure `function(...)`, standalone `?` and `module:` namepaths (parse error instead of grammar error). `@class`, `@constructor`, `@author` and `@enum` now parse as generic `JSDocTag` nodes.

## Expando and CommonJS

- Constructor functions (assigning `this.x` in a function, or assigning to `.prototype`) are not supported: use classes.
- Fallback initialisers (`f.x = f.x || init`), nested undeclared expandos (`N.X.Y = {}` without `N.X = {}`), identifier declarations in constructors (`/** @type {T} */ this.id;`), `this` aliases (`var that = this`), and `this` as `globalThis` or `module.exports` at top level are no longer recognised.
- Assigning `void 0` to an expando creates a property of type `undefined`.
- A `this`-property expression with only a type annotation in a constructor no longer creates a property: add an initializer or a class-body declaration.
- CommonJS: nested undeclared `exports.N.X.p`, empty `module.exports = {}`, single-property `require('fs').readFile` and aliasing `var mod = module.exports` are unsupported. Multiple assignments to the same export now union instead of narrowing by control flow. A module must either assign `module.exports` or assign `module.exports.x` properties, not both.

## Scanner and parser

1. Node positions are UTF-8 offsets from the start of the file (greater than before for non-ASCII text).
2. Malformed `...T?` at the end of a tuple is a parse error.
3. Malformed string import specifiers (`import x as "OOPS" from "y"`) keep the string text.
4. Empty binding elements are `BindingElement` with nil initializer, name and dot-dot-dot token (no `OmittedExpression` kind).
5. `ShorthandPropertyAssignment` has no `EqualsToken` child when it has an object assignment initializer.
6. JSDoc nodes include leading whitespace in their location; a `JSDocText` is always parsed for comments (the `comment` type no longer includes `string`); `JSDocMemberName` is parsed as `QualifiedName`.

## Checker

- **`--skipLibCheck`**: conflicting declarations error at all contributing sites (TypeScript 6 sometimes errored at one). Projects whose declaration conflicts were silenced may now see errors in non-`.d.ts` files.
- **Template literal inference** with an empty placeholder consumes a full Unicode code point: `Head<"😀abc">` is `"😀"` (Strada: a lone surrogate).
- **`strict: false`**: omitting arguments for parameters typed `undefined`, `unknown` or `any` is an error. `void` parameters stay omissible.
- **JSDoc positions**: values are no longer resolved as types (`@typedef {FORWARD | BACKWARD}` needs `typeof FORWARD | typeof BACKWARD`).
- **`arguments`** in a JS function body no longer implies `...args: any[]`; declare a rest parameter.
- **Variadic JSDoc types** (`...number`) are synonyms for array types only; the parameter must still use rest syntax. Postfix `=` (`number=`) no longer adds `undefined` with `strictNullChecks` off, but still makes `@param` optional.
- **`asserts` on an arrow function** must be written on the declaring variable (`@type {(a: A) => asserts a is B}`).
- **Async functions returning non-Promises** report the same error as TypeScript.
- **`@typedef` / `@callback` in a class body** are hoisted outside the class and may conflict with outer names.
- **`@param`** applies to at most one function (the first); with `strict` expect `noImplicitAny` on the others.
- **`@type` assertions** prevent narrowing, as TypeScript's `as` does.
- **`@overload`** on arrow functions and function expressions is ignored; write a call-signature `@type` instead (works with TypeScript 6 and 7).
