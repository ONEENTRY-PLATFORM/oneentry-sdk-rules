---
name: setup-vitest
description: Set up Vitest for a Next.js + OneEntry project and cover the data adapters with fixture tests
---
# Set Up Vitest and Cover OneEntry Adapters

Installs Vitest, configures the pool and aliases, creates fixtures for OneEntry responses, and the first tests for the adapters.

> Rule: `.claude/rules/unit-testing.md`. E2E — separately, `/setup-playwright`.

---

## Step 1: Check What to Test

Find the layer parsing OneEntry responses:

```bash
grep -rln 'attributeValues' lib src app --include=*.ts --include=*.tsx | head -20
```

First round candidates (in this order):

1. `getImageUrl` / `getImageUrls` — all forms of `value`;
2. product/page adapter (`attributeValues` → domain object);
3. `sanitizeHtml`, if `dangerouslySetInnerHTML` is present in the project;
4. env parser for TTL (`src/lib/isr.ts`), if any;
5. loaders — `isError` branch.

If there is no parsing at all and `attributeValues` are read directly in JSX — first extract the parsing into a function, otherwise there is nothing to test.

---

## Step 2: Installation

```bash
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

`package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

---

## Step 3: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Vitest does not read tsconfig.paths — without this the collection fails
  // on "Failed to resolve import" for tests whose graph reaches the alias
  resolve: { alias: { '@': path.resolve(dirname, 'src') } },
  test: {
    name: 'unit',
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/lib/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'e2e', '.next', 'playwright-report'],
    // ⚠️ The default fork pool on the jsdom set fails with "Timeout waiting for
    // worker to respond", and affected files are NOT BUILT — the run is green
    // on a subset. A third of the cores: everything builds and ~5x faster.
    maxWorkers: Math.max(2, Math.ceil(cpus().length / 3)),
    sequence: { groupOrder: 0 },
  },
})
```

If the project has Storybook with `@storybook/addon-vitest` — move both sets to `projects` and give them **different** `groupOrder`: Vitest rejects projects with the same `groupOrder`, but different `maxWorkers`.

---

## Step 4: Real Response Fixtures

Take fixtures from a **live project**, do not invent: `/inspect-api products` will show real markers and forms.

```typescript
// src/__fixtures__/product.ts
export const productFixture = (attrs: Record<string, unknown> = {}) => ({
  id: 1,
  localizeInfos: { title: 'Test product', plainContent: 'plain text' },
  attributeValues: {
    pic: { type: 'image', value: { downloadLink: 'https://cdn/a.jpg' } },
    price: { type: 'float', value: 100 },
    ...attrs,
  },
  rating: { value: 4.5, count: 10 },
})
```

Keep one fixture for each form: single file (object), multiple (array), `null`, empty string.

---

## Step 5: First Tests

```typescript
import { describe, expect, it, vi } from 'vitest'
import { getImageUrl } from '@/lib/oneentry'

describe('getImageUrl', () => {
  it('object (1 file)', () => expect(getImageUrl({ downloadLink: 'a.jpg' })).toBe('a.jpg'))
  it('array (2+ files)', () => expect(getImageUrl([{ downloadLink: 'a.jpg' }])).toBe('a.jpg'))
  it('attribute instead of value', () => expect(getImageUrl({ value: { downloadLink: 'a.jpg' } })).toBe('a.jpg'))
  it('fallback to previewLink (orders, form-data)', () =>
    expect(getImageUrl({ previewLink: 'p.jpg' })).toBe('p.jpg'))
  it('null → empty string', () => expect(getImageUrl(null)).toBe(''))
})
```

Loader test for `isError`:

```typescript
it('returns an empty list on IError, does not throw', async () => {
  vi.mocked(api.Products.getProducts).mockResolvedValue({ statusCode: 403, message: 'Resource is closed' })
  await expect(loadProducts()).resolves.toEqual({ items: [], total: 0 })
})
```

---

## Step 6: Check That ALL Files Are Built

```bash
npm test
git ls-files '*.test.ts' '*.test.tsx' | wc -l    # should match the number of files in the report
```

A discrepancy means quietly skipped tests due to the pool — return to `maxWorkers`.

---

## Step 7: Recall Key Rules

```md
1. Adapters and loaders are tested, not the SDK: response fixtures are substituted
2. For each field — four forms of value: object, array, null, empty string
3. The isError branch is covered separately: empty result, NOT an exception
4. Cache keys: different filters → different keys, the order of keys does not matter
5. DO NOT cover a flat copy of SDK types with tests — domain aggregation is tested
6. maxWorkers is limited, otherwise files are silently not built
7. resolve.alias is duplicated from tsconfig.json
8. include does not capture e2e/** — this is a Playwright run
```
