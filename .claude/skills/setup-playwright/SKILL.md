<!-- META
type: skill
skillConfig: {"name":"setup-playwright"}
-->

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
npm install -D @playwright/test
npx playwright install chromium
```

> For the full set of browsers: `npx playwright install` (without arguments).

---

## Step 3: Create playwright.config.ts

Create `playwright.config.ts` in the root of the project:

```typescript
import { defineConfig, devices } from '@playwright/test';

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
> **Restart Claude Code** to pick up the MCP server.

---

## Step 7: Add e2e to .gitignore (if needed)

Check `.gitignore`. Add if not present:

```
/playwright-report/
/test-results/
```

---

## Step 8: Test writing rules

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
- Test names in English (clear to the user)
- Use `page.getByRole`, `page.getByText`, `page.getByTestId` — not CSS selectors
- Add `data-testid` to key elements when creating components
- Tests should be independent — do not rely on the state from previous tests

### Authorization test pattern

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authorization', () => {
  test('successful login by email', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('test@example.com');
    await page.getByRole('button', { name: /log in/i }).click();
    // enter confirmation code...
    await expect(page).toHaveURL('/profile');
  });

  test('shows error on invalid data', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /log in/i }).click();
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

Use these tools for **page inspection** before writing tests to know the actual selectors.

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
