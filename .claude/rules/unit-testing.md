---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "vitest.config.ts"
---
# Unit Tests for OneEntry Adapters

Skill recipe: **`/setup-vitest`**. E2E discipline — a separate rule `.claude/rules/playwright-e2e.md`; here we discuss the lower level.

**Why.** 90% of integration errors with OneEntry are not scenarios, but **data forms**: `image` is an object with one file, an array with two; an empty `integer` = `null`, not `0`; `text` comes as an array or object; `form.attributes` of an empty form = `{}`, not `[]`. These regressions are caused by **content editing, not code** — E2E catches them late and at a high cost, while a unit test on a fixture catches them instantly.

---

## 1. What to Test: Adapters and Loaders, Not SDK

You test **your** layer of response parsing — the function that transforms `attributeValues` into a domain object. The SDK and network are not mocked line by line: fixture responses are substituted.

Each adapter must have a test for **all forms of `value`**:

```typescript
describe('adaptProduct', () => {
  it('a single image comes as an object', () => {
    expect(adaptProduct(fixture({ pic: { value: { downloadLink: 'a.jpg' } } })).image).toBe('a.jpg')
  })
  it('two or more come as an array', () => {
    expect(adaptProduct(fixture({ pic: { value: [{ downloadLink: 'a.jpg' }, { downloadLink: 'b.jpg' }] } })).image).toBe('a.jpg')
  })
  it('an unfilled attribute is null, not 0 and not {}', () => {
    expect(adaptProduct(fixture({ price: { value: null } })).price).toBe(0)   // ?? 0, not || 0
  })
  it('an empty string is not returned as a URL', () => {
    expect(adaptProduct(fixture({ pic: { value: '' } })).image).toBe('')
  })
})
```

The mandatory minimum of fixtures for each field: **object, array, `null`, empty string**. Exactly these four break when editing content.

---

## 2. The `isError` Branch — Separate Test

The loader contract: in case of an SDK error, it returns an empty result, **not throws**. This is exactly what graceful degradation relies on (`.claude/rules/error-handling.md`), and exactly what can easily be broken by refactoring.

```typescript
it('returns an empty list on IError, does not throw', async () => {
  vi.mocked(api.Products.getProducts).mockResolvedValue({ statusCode: 403, message: 'Resource is closed' })
  await expect(loadProducts()).resolves.toEqual({ items: [], total: 0 })
})
```

---

## 3. Cache Keys — Test for Canonicalization

`unstable_cache` builds a key from **positional arguments**. Two calls with different filters that yield the same serialization silently share one cache entry — and the user sees someone else's output. A test for signature canonicalization takes ten lines and is cheaper than investigating such an incident.

```typescript
it('different filters yield different cache keys', () => {
  expect(cacheKey({ color: 'red' })).not.toBe(cacheKey({ color: 'blue' }))
})
it('the order of filter keys does not affect the cache key', () => {
  expect(cacheKey({ a: 1, b: 2 })).toBe(cacheKey({ b: 2, a: 1 }))
})
```

TTL and limitations of `unstable_cache` — `.claude/rules/isr-config.md`.

---

## 4. What NOT to Test: DTO Layer

`.claude/rules/typescript.md` prohibits flat copies of SDK types — and testing such a copy does not legitimize it, but rather solidifies it. Test **domain aggregation**: merging product variants by color/size, calculating the final price with a discount, normalizing schedules. This is the case of "merging two entities" that `typescript.md` recognizes as permissible.

Good candidates for unit tests in the OneEntry project:

- `getImageUrl` / `getImageUrls` — all forms of `value` (`.claude/rules/attribute-values.md`);
- `sanitizeHtml` — payloads from `.claude/rules/security.md` (`javascript:` with all encodings, `>` in quotes, duplicate attribute, `svg`/`template`);
- `readInitialValue` — flat and language-keyed forms (`.claude/rules/attribute-sets.md`);
- env parser for TTL — empty string, `"abc"`, `"0"`, `"-5"`;
- adapters for catalog, order, form.

---

## 5. ⚠️ Vitest Next to Storybook — Default Pool Breaks Run Silently

The most dangerous setup trap. The default pool size of forks (`~cores-1`) on the jsdom set exhausts resources: forks crash with `Timeout waiting for worker to respond`, and **affected files simply do not compile**. The run appears green — on a subset (for example, 47 files out of 67), without a single red line.

```typescript
// vitest.config.ts
import { cpus } from 'node:os'

test: {
  name: 'unit',
  environment: 'jsdom',
  // One third of cores: all files compile, and in ~5 times faster than default
  maxWorkers: Math.max(2, Math.ceil(cpus().length / 3)),
  // Projects with a common groupOrder must match in maxWorkers — Vitest
  // rejects the config. Different orders also separate jsdom forks from chromium
  // Storybook by time, to avoid fighting for cores.
  sequence: { groupOrder: 0 },
}
```

**Check after setup:** the number of compiled files in the report should match `git ls-files '*.test.*' | wc -l`. Discrepancy = quietly skipped tests.

## 6. ⚠️ Alias `@` Duplicated in `vitest.config.ts`

`tsconfig.paths` is not read by Vitest. Without an explicit `resolve.alias`, the collection fails with `Failed to resolve import` — and only for those tests whose import graph reaches the module with the alias, which looks random.

```typescript
resolve: { alias: { '@': path.resolve(dirname, 'src') } }
```

---

## Checklist

1. Each OneEntry adapter/loader has a test for four forms of `value`: object, array, `null`, empty string.
2. The `isError` branch is covered separately: empty result, not an exception.
3. Cache keys: different inputs → different keys, the order of keys does not affect.
4. Domain aggregation is tested, not a copy of SDK types.
5. `maxWorkers` is limited; the number of compiled files is checked against the number of files in the repository.
6. `resolve.alias` is duplicated from `tsconfig.json`.
7. `include` does not capture `e2e/**` — this is a separate Playwright run.

> Related rules: `.claude/rules/playwright-e2e.md` (scenarios and test data), `.claude/rules/typescript.md` (what is considered a permissible domain model), `.claude/rules/attribute-values.md` (value forms, for which all this is done).
