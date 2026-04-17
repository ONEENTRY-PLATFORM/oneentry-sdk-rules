# Playwright E2E — OneEntry Rules

Rules for writing E2E tests for Next.js + OneEntry projects. Verified on a live project.

---

## `.env.local` in tests — load manually via `dotenv`

The Playwright runner **does not read** `.env.local` by itself (unlike the Next.js webServer, which starts inside the runner). `process.env.E2E_*` in specs will be `undefined`, all `test.skip(!ENV_VAR, ...)` will always skip tests.

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });  // ← must be before defineConfig

export default defineConfig({ /* ... */ });
```

```bash
npm install -D dotenv
```

**How to check that the variables were picked up:** running `npx playwright test --reporter=list` will show `◇ injected env (N) from .env.local` from the dotenv-like runtime. If `N=0` — the path is incorrect or the file does not exist.

---

## Authorized tests with a single user — serial

OneEntry uses a one-time refresh token (rotation via `saveFunction`). If two workers simultaneously execute `AuthProvider.auth()` with the same user — one of them will receive a 401 on the subsequent `Users.getUser()`, and the test will fail due to a timeout on `waitForURL('**/profile')`.

```typescript
test.describe('Profile', () => {
  test.describe('authorized', () => {
    test.describe.configure({ mode: 'serial' });  // ← must be
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD not set');

    test.beforeEach(async ({ page }) => {
      // login flow with TEST_EMAIL/TEST_PASSWORD
    });

    test('...', async () => { /* ... */ });
  });
});
```

> ⚠️ `mode: 'serial'` only applies **within the file**. If authorized tests are in different spec files (`auth.spec.ts:signin success` + `profile.spec.ts:authenticated`), they will still run in different workers in parallel. **Do not duplicate login tests between files** — leave one file responsible for the authorized flow.

**An alternative for complex cases** — `storageState` through global project setup, but for simple cases, serial is sufficient.

---

## `notFound()` in Server Component with `force-dynamic` — status 200, not 404

```tsx
// app/products/[id]/page.tsx
export const dynamic = 'force-dynamic';

export default async function Page({ params }) {
  const result = await getProductById(id);
  if ('error' in result) notFound();  // ← renders not-found UI, but HTTP 200
  // ...
}
```

```typescript
// ❌ WILL ALWAYS FAIL — force-dynamic pages return 200
test('non-existent id → 404', async ({ page }) => {
  const response = await page.goto('/products/999999');
  expect(response?.status()).toBe(404);
});

// ✅ CORRECT — check through UI: root testid disappears
test('non-existent id → not-found UI', async ({ page }) => {
  await page.goto('/products/999999');
  await expect(page.getByTestId('product-page')).toHaveCount(0);
  // or by the text of the not-found page, if it's custom:
  // await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});
```

---

## Strict mode violation — copy `getByRole` to the container

Playwright is strict by default: if `page.getByRole('link', { name: /log in/i })` finds 2+ elements (in the navbar + in the placeholder) — it will fail with `strict mode violation`.

```typescript
// ❌ INCORRECT — two "Log in" links
await expect(page.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/auth');

// ✅ CORRECT — scope the search to the container via data-testid
const placeholder = page.getByTestId('profile-unauthorized');
await expect(placeholder.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/auth');
```

For all root containers (forms, cards, pages), add `data-testid` — this is the only reliable way to scope the search.

---

## `data-testid` — conventions

- **Root container of the feature**: `data-testid="auth-form"`, `data-testid="product-page"`, `data-testid="filter-panel"`
- **Interactive elements inside**: `data-testid="auth-submit"`, `data-testid="filter-apply"`, `data-testid="add-to-cart"`
- **States and placeholders**: `data-testid="auth-error"`, `data-testid="catalog-empty"`, `data-testid="profile-unauthorized"`
- **Dynamic elements** — suffix marker: `data-testid={\`auth-field-${field.marker}\`}`, `data-testid="product-card"` + `data-product-id={id}` attribute

Search by prefix: `page.locator('[data-testid^="auth-field-"]')` — all form fields, regardless of the marker.

---

## env-driven fixtures with `test.skip`

Tests that depend on project data (real creds, product ids, markers) — via env with fallback to skip:

```typescript
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PRODUCT_ID = process.env.E2E_PRODUCT_ID ?? '14';  // fallback to known id

test.describe('Profile', () => {
  test.skip(!TEST_EMAIL, 'E2E_TEST_EMAIL not set');
  // tests requiring a real user
});
```

> `test.skip(condition, reason)` at the describe level skips ALL tests in the describe when `condition=true`. Inside a single test — use `test.skip(!COND, ...)` in the test body before any actions.

---

## Running

```bash
npm run test:e2e              # headless
npm run test:e2e:ui           # interactive
npx playwright test foo.spec  # one file
npx playwright test --workers=1  # sequentially (debugging parallel conflicts)
npx playwright test --grep "signin"  # by name
```

After a failure — `npm run test:e2e:report` will open an HTML report with traces, screenshots, and videos.
