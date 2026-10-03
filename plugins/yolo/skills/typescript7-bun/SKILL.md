---
name: typescript7-bun
description: "TypeScript 7.0.2 (Go Corsa native compiler) integration with Bun runtime and @types/bun."
metadata:
  version: "1.0.0"
  author: "aphrody-code"
  license: "Apache-2.0"
---

# TypeScript 7.0.2 with Bun

TypeScript 7.0.2 adopts the Corsa native Go compiler. Bun transpiles TypeScript code instantly without type checking; type verification is performed via `tsc --noEmit`.

## Mandatory tsconfig.json Options

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "types": ["bun"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```
