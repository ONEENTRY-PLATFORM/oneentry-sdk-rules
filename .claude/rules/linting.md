<!-- META
type: rules
fileName: linting.md
rulePaths: ["**/*.ts","**/*.tsx"]
paths:
  - "**/*.ts"
  - "**/*.tsx"
-->

# Linter — rules (eslint.config.mjs)

Config: `next/core-web-vitals` + `next/typescript`
This means: `@typescript-eslint/recommended` + Next.js-specific rules.

## Required before writing code

Read `eslint.config.mjs` to know the active rules. Code must pass the linter without errors or warnings.

## Key rules

### TypeScript

- `@typescript-eslint/no-explicit-any` — `any` is forbidden (see `rules/typescript.md`)
- `@typescript-eslint/no-unused-vars` — unused variables and imports are forbidden

### React Hooks

- `react-hooks/rules-of-hooks` — hooks only at the top level of a component
- `react-hooks/exhaustive-deps` — all `useEffect` dependencies must be in the deps array

```typescript
// ❌ WRONG — formIdentifier is used in useEffect but not in deps
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
// ❌ WRONG
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
- `'use server'` Server Actions must not be called directly for auth methods with fingerprint (see `rules/auth-provider.md`)
