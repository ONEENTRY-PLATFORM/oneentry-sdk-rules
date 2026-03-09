<!-- META
type: rules
fileName: linting.md
rulePaths: ["**/*.ts","**/*.tsx"]
paths:
  - "**/*.ts"
  - "**/*.tsx"
-->

# Linter — Rules (eslint.config.mjs)

Config: `next/core-web-vitals` + `next/typescript`  
This means: `@typescript-eslint/recommended` + Next.js specific rules.

## Mandatory Before Writing Code

Read `eslint.config.mjs` to know the active rules. The code must pass the linter without errors and warnings.

## Key Rules

### TypeScript

- `@typescript-eslint/no-explicit-any` — `any` is prohibited (see `rules/typescript.md`)
- `@typescript-eslint/no-unused-vars` — unused variables and imports are prohibited

### React Hooks

- `react-hooks/rules-of-hooks` — hooks can only be called at the top level of a component
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

### Next.js — Images and Links

- `@next/next/no-img-element` — `<img>` is prohibited, use `next/image`
- `@next/next/no-html-link-for-pages` — `<a href="/">` is prohibited, use `next/link`

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

- Do not import server modules in `'use client'` files
- `'use server'` Server Actions cannot be called directly for auth methods with fingerprint (see `rules/auth-provider.md`)
