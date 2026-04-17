---
name: setup-playwright
description: Setup Playwright E2E testing
---
---
name: setup-playwright
description: Set up Playwright E2E testing in a Next.js project — install dependencies, create config, connect MCP server, write first tests
allowed-tools: Read, Glob, Write, Edit, Bash
---

# /setup-playwright — Setting up Playwright E2E testing

Sets up Playwright in a Next.js project with MCP server support for Claude. Follow the steps in order.

---

## Step 1: Check if Playwright is already installed

Read `package.json`. If `@playwright/test` is already in `devDependencies` — ask: reconfigure or just create tests?

---

## Step 2: Install dependencies

```bash
npm install -D @playwright/test dotenv
npx playwright install chromium
```

> `dotenv` — to load `process.env.E2E_*` from `.env.local` in tests (the Playwright runner does not **read** `.env.local`, unlike the Next.js webServer).
> For the full set of browsers: `npx playwright install` (without arguments).

---

## Step 3: Create playwright.config.ts

Create `playwright.config.ts` in the root of the project:

```typescript
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// ⚠️ The Playwright runner does not read .env.local itself — load it manually,
// otherwise process.env.E2E_* in specs will be undefined
dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,  // Next.js cold start can be long
  },
});
```

---

## Step 4: Add scripts to package.json

Add to the `scripts` section:

```json
{
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:report": "playwright show-report"
}
```

---

## Step 5: Create e2e folder and first test

Create `e2e/` in the root of the project. Create a basic smoke test `e2e/smoke.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('the homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).not.toHaveURL(/error/);
  await expect(page.locator('body')).toBeVisible();
});
```

---

## Step 6: Connect Playwright MCP server

The Playwright MCP server allows Claude to control the browser directly — inspect pages, take screenshots, check UI state.

### Create or update `.mcp.json` in the root of the project:

Check if `.mcp.json` exists. If not — create it:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

If the file already exists — add the `"playwright"` section to `mcpServers`.

> After creating `.mcp.json`, tell the user:
> **Restart Claude Code** to activate the MCP server.

---

## Step 7: Add e2e to .gitignore (if needed)

Check `.gitignore`. Add if not present:

```
/playwright-report/
/test-results/
```

---

## Step 8: Rules for writing tests

### Test structure

```
e2e/
  smoke.spec.ts          ← basic page availability
  auth.spec.ts           ← authorization / registration
  catalog.spec.ts        ← catalog, filters, search
  cart.spec.ts           ← cart, checkout
  profile.spec.ts        ← user profile
```

### Conventions

- One file = one area of functionality
- Test names in English (clear for the user)
- Use `page.getByRole`, `page.getByText`, `page.getByTestId` — not CSS selectors
- Add `data-testid` to key elements when creating components
- Tests should be independent — do not rely on the state from previous tests

### ⚠️ Pitfalls (verified on a live project)

1. **`.env.local` is not read by the Playwright runner** — load it via `dotenv.config({ path: '.env.local' })` in `playwright.config.ts` (see Step 3). Without this, `process.env.E2E_*` in specs = `undefined`, all conditional `test.skip(!ENV, ...)` will trigger skip.
2. **Parallel login with the same test user causes a race** — two workers simultaneously call `AuthProvider.auth()`, the OneEntry refresh token is one-time → one of them fails due to timeout on `/profile`. Fix: for the describe block with authorized tests, add `test.describe.configure({ mode: 'serial' })`.
3. **`notFound()` in Server Component with `force-dynamic` DOES NOT return HTTP 404** — renders not-found UI, but status=200. `expect(response?.status()).toBe(404)` will always fail. Check via UI: `await expect(page.getByTestId('product-page')).toHaveCount(0)` or by the text of the not-found page.
4. **Strict mode violation** if the same `getByRole('link', { name: /login/i })` exists in the navbar and in the content placeholder — copy the search: `page.getByTestId('profile-unauthorized').getByRole('link', ...)`.

> More details — `.claude/rules/playwright-e2e.md`.

### Authorization test pattern

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authorization', () => {
  test('successful login by email', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('test@example.com');
    await page.getByRole('button', { name: /login/i }).click();
    // enter confirmation code...
    await expect(page).toHaveURL('/profile');
  });

  test('shows error for invalid data', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page.getByText(/required field/i)).toBeVisible();
  });
});
```

### How to use Playwright MCP

After connecting the MCP server, Claude can:
- `browser_navigate` — open a page
- `browser_screenshot` — take a screenshot and check UI
- `browser_click` / `browser_type` — interact with elements
- `browser_get_text` — get text from elements

Use these tools for **page inspection** before writing tests to know the real selectors.

---

## Step 9: Show the result

```
✅ @playwright/test installed
✅ playwright.config.ts created
✅ e2e/ folder created with basic smoke test
✅ .mcp.json configured with Playwright MCP server
✅ Scripts added to package.json

Running tests:
  npm run test:e2e        ← headless
  npm run test:e2e:ui     ← with Playwright UI mode

⚠️  Restart Claude Code to activate the MCP server
```
