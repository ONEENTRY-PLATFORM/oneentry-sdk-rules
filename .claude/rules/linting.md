---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# Linter and Prettier — rules (eslint.config.mjs + .prettierrc)

ESLint config: `next/core-web-vitals` + `next/typescript`
This means: `@typescript-eslint/recommended` + Next.js specific rules.

## Mandatory before writing code

Read `eslint.config.mjs` and `.prettierrc` to know the active rules. The code must pass ESLint and Prettier **without errors, warnings, and without the need for auto-formatting** — consider both linter rules and formatting rules at the writing stage, not after.

It is forbidden to write code "as convenient" with the expectation of subsequent `eslint --fix` / `prettier --write`. Each line should be ready for commit immediately.

## Prettier (`.prettierrc`)

Current project settings:

```json
{
  "singleQuote": true,
  "endOfLine": "auto",
  "trailingComma": "all",
  "tabWidth": 2,
  "semi": true,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

What this means in practice:

- **Single quotes** for strings in JS/TS (`'text'`, not `"text"`). In JSX attributes — double (default Prettier behavior).
- **Semicolons are mandatory** at the end of statements.
- **Trailing commas everywhere** where allowed by syntax (objects, arrays, function parameters, generics, imports).
- **Indentation of 2 spaces**, not tabs.
- **`endOfLine: "auto"`** — do not enforce a specific EOL, leave it as in the file.
- **`prettier-plugin-tailwindcss`** — Tailwind classes should be in the canonical order of the plugin (layout → spacing → typography → colors → state variants). Do not sort manually "as it looks nice" — write in the order expected by the plugin so that Prettier does not rearrange them.

```typescript
// ❌ INCORRECT — double quotes, no ; , no trailing comma
import { useState } from "react"
const obj = {
  a: 1,
  b: 2
}

// ✅ CORRECT
import { useState } from 'react';
const obj = {
  a: 1,
  b: 2,
};
```

## Key rules

### TypeScript

- `@typescript-eslint/no-explicit-any` — `any` is forbidden (see `.claude/rules/typescript.md`)
- `@typescript-eslint/no-unused-vars` — unused variables and imports are forbidden

### React Hooks

- `react-hooks/rules-of-hooks` — hooks only at the top level of the component
- `react-hooks/exhaustive-deps` — all dependencies of `useEffect` must be in the deps array

```typescript
// ❌ INCORRECT — formIdentifier is used in useEffect, but not in deps
useEffect(() => {
  getFormByMarker(formIdentifier)
}, [])

// ✅ CORRECT
useEffect(() => {
  getFormByMarker(formIdentifier)
}, [formIdentifier])
```

### Next.js — images and links

- `@next/next/no-img-element` — `<img>` is forbidden, use `next/image`
- `@next/next/no-html-link-for-pages` — `<a href="/">` is forbidden, use `next/link`

```typescript
// ❌ INCORRECT
<img src={product.image} alt="..." />
<a href="/catalog">Catalog</a>

// ✅ CORRECT
import Image from 'next/image'
import Link from 'next/link'
<Image src={product.image} alt="..." width={400} height={300} />
<Link href="/catalog">Catalog</Link>
```

### Server/Client Components

- Do not import server modules into `'use client'` files
- `'use server'` Server Actions cannot be called directly for auth methods with fingerprint (see `.claude/rules/auth-provider.md`)
