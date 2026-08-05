<!-- META
type: rules
fileName: isr-config.md
rulePaths: ["app/**/page.tsx","app/**/layout.tsx","lib/isr.ts","lib/**/cache*.ts"]
paths:
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
  - "lib/isr.ts"
  - "lib/**/cache*.ts"
-->

# ISR and Custom TTL — Three Limitations of Next.js

Caching strategies (what to cache and for how long) — in `.claude/rules/performance.md`. Here are the limitations you encounter on the **very first** attempt to move TTL to the config, which are not diagnosed by an error message.

---

## 1. `export const revalidate` cannot be imported or computed

Next AST parses the route segment config **at build time**, before executing the code. Import, arithmetic, ternary, `process.env` — all of this fails with `Invalid segment configuration export detected`.

```typescript
// ❌ app/product/[id]/page.tsx — will not build
import { REVALIDATE_PRODUCT } from '@/lib/isr'
export const revalidate = REVALIDATE_PRODUCT

// ❌ will also not build
export const revalidate = Number(process.env.ISR_PRODUCT_TTL_SEC) || 120

// ✅ in the route shell — only a literal
export const revalidate = 120
```

**Consequence for architecture:** customizable TTLs live not in the route shell, but **inside** `unstable_cache({ revalidate })` in loaders. The literal in `page.tsx` controls how long the HTML page lives; the constant in the loader — how long the OneEntry response is reused. These are two different caches, and confusing them is costly: changing the env variable will not shift the literal in the route.

```typescript
// lib/isr.ts — consumer ONLY of unstable_cache, not segment config
export const REVALIDATE_PRODUCT = ttl('ISR_PRODUCT_TTL_SEC', 120)

// lib/oneentry/product.ts
export const getProduct = unstable_cache(
  async (id: number) => { /* … */ },
  ['product'],
  { revalidate: REVALIDATE_PRODUCT, tags: ['product'] },
)
```

> At the top of `lib/isr.ts`, keep a comment with a list of literals from routes (`app/page.tsx → 300`, `app/product/[id] → 120`, …) — otherwise, no one will find the second half of the configuration.

---

## 2. `unstable_cache` does not accept `revalidate: 0`

This is a runtime invariant: `Invariant revalidate: 0 can not be passed to unstable_cache()`. A "disabled" ISR is emulated with one.

```typescript
const disabled = process.env.ISR_DISABLED === '1'

export function ttl(envKey: string, fallback: number): number {
  if (disabled) return 1        // ← NOT 0: 1 second is functionally equivalent
  const raw = process.env[envKey]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
```

The env parser must be resilient: an empty string, `"abc"`, `"-5"`, `"0"` → fallback, not `NaN` in the cache config.

---

## 3. A handle without a consumer — a handle that silently does nothing

Create an env override TTL only where there is a **live import** of the constant. A constant that no one imports looks like a configuration, but twisting it changes nothing — and this is discovered weeks later, in the middle of an incident.

Check before committing: `grep -rn 'REVALIDATE_' app lib components` — each exported constant must have at least one consumer, besides the declaration. Loaders with their literal `revalidate: 60` do not need a constant.

---

## What to Choose for TTL

| Data | Guideline | Why |
| --- | --- | --- |
| Main page blocks, showcases | 300 s | content changes rarely, LCP is important |
| Product card (price, availability) | 60–120 s | stale price → paid order at an incorrect amount. Insurance — `Orders.previewOrder` at checkout (see `.claude/rules/orders.md`) |
| Catalog lists, discounts | 60 s | often changed, but not critical |
| Stores, delivery methods, schedule | 3600 s | change once a month |
| Cart, wishlist, profile, orders | do not cache | user/guest-scoped, `x-guest-id`/`Authorization` in the header |

---

## Checklist

1. In `page.tsx` / `layout.tsx` — only the literal `export const revalidate`.
2. Customizable TTLs — in `unstable_cache({ revalidate })`, not in the route shell.
3. "Disabled" = `1`, never `0`.
4. The env parser returns a fallback on an empty/non-numeric/non-positive string.
5. Each exported `REVALIDATE_*` has an import in the loader.
6. User data is not under `unstable_cache` — otherwise, the buyer will see someone else's cart.

> Related rules: `.claude/rules/performance.md` (caching strategies), `.claude/rules/performance-streaming.md` (`generateMetadata` and React `cache()`), `.claude/rules/observability.md` (measuring cache hits/misses).
