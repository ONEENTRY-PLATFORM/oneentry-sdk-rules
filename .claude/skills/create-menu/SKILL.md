---
name: create-menu
description: Create navigation menu from OneEntry Menus API
---
# Create navigation menu from OneEntry Menus API

Argument: `marker` (menu marker in OneEntry, for example `main_web`)

---

## Step 1: Define the menu marker

If the argument is not provided — get a list of available menus:

Run `/inspect-api menus` — the skill uses the SDK and will return a list of `identifier` markers.

**⚠️ DO NOT guess the marker** (`main`, `header`, `footer`, etc.) — ask the user or get it via the API.

---

## Step 2: Clarify details with the user

Before writing the code, find out:

1. **Where to place the menu?** (Header, Footer, Sidebar, separate component?)
2. **Is hierarchy needed?** (Dropdown submenus or only top level?)
3. **Are URL prefixes needed?** For example, some menu items may lead to `/shop/offer`, while in OneEntry their `pageUrl` is simply `"offer"`. If yes — ask for a list of such pages and the required prefixes.
4. **Are there any "special" items?** For example, the `category` item leads to `/shop`, but its child elements lead to `/shop/category/{slug}`.

---

## Step 3: Read the menu type in the SDK

```bash
grep -r "IMenusEntity\|IMenusPages" node_modules/oneentry/dist --include="*.d.ts" -A 10
```

Key fields of `IMenusPages`:
- `id` — identifier of the item (`number | null` — an item without an associated page may be null)
- `parentId` — a relic, do not rely on it (nesting is only through `children`)
- `pageUrl` — page marker (`string | null` — also nullable)
- `localizeInfos.title` — title of the item (`localizeInfos` may be an empty object `{}`)
- `localizeInfos.menuTitle` — title in the menu (alternative)
- `children` — child items: an array of `IMenusPages`, a single object, or absent
- `position` — sort order

**⚠️ IMPORTANT:** The API returns a tree — child items are in `item.children` and are NOT duplicated in a flat `pages` (only the top level is there). The filter `pages.filter(p => p.parentId === item.id)` will return an empty array — take only `item.children`, normalizing via `Array.isArray` (`parentId` is a relic, do not build logic on it). `children` is recursive — nesting can be deeper than 2 levels; the templates below intentionally cover 2 levels.

---

## Step 4: Create the menu component

### Basic template (Server Component, only top level)

```tsx
// components/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

export async function NavMenu({ locale }: { locale: string }) {
  const menu = await getApi().Menus.getMenusByMarker('YOUR_MARKER', locale);

  // pages — root menu items (tree). Normalize: array or single object
  const navItems = !isError(menu) && menu.pages
    ? (Array.isArray(menu.pages) ? menu.pages : [menu.pages])
    : [];

  if (navItems.length === 0) return null;

  return (
    <nav>
      <ul>
        {navItems.map((item: any) => (
          <li key={item.id}>
            <Link href={`/${locale}/${item.pageUrl}`}>
              {item.localizeInfos?.title || item.localizeInfos?.menuTitle}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

### With hierarchy (dropdown submenus)

```tsx
// components/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

// children can be an array, a single object, or absent
function getChildren(item: any): any[] {
  if (!item?.children) return [];
  return Array.isArray(item.children) ? item.children : [item.children];
}

export async function NavMenu({ locale }: { locale: string }) {
  const menu = await getApi().Menus.getMenusByMarker('YOUR_MARKER', locale);

  // pages — root menu items (tree). Normalize: array or single object
  const navItems = !isError(menu) && menu.pages
    ? (Array.isArray(menu.pages) ? menu.pages : [menu.pages])
    : [];

  if (navItems.length === 0) return null;

  return (
    <nav>
      <ul>
        {navItems.map((item: any) => {
          // Child items — from the tree (item.children), NOT through parentId filter
          const children = getChildren(item);

          return (
            <li key={item.id}>
              <Link href={`/${locale}/${item.pageUrl}`}>
                {item.localizeInfos?.title || item.localizeInfos?.menuTitle}
              </Link>

              {/* Submenu — only if there are child items */}
              {children.length > 0 && (
                <ul>
                  {children.map((child: any) => (
                    <li key={child.id}>
                      <Link href={`/${locale}/${child.pageUrl}`}>
                        {child.localizeInfos?.title || child.localizeInfos?.menuTitle}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

### With URL prefixes (if menu items require non-standard paths)

Use this option if some `pageUrl` from the menu should open at a different path in the application.

```tsx
// components/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

// children can be an array, a single object, or absent
function getChildren(item: any): any[] {
  if (!item?.children) return [];
  return Array.isArray(item.children) ? item.children : [item.children];
}

// Defined based on the application structure:
// key — pageUrl from OneEntry, value — real path in the application
const URL_OVERRIDES: Record<string, string> = {
  // Example: 'offer' → 'shop/offer', 'category' → 'shop'
  // CLARIFY with the user!
};

// Pages where child elements have a special path
// Example: child 'category' leads to 'shop/category/{child.pageUrl}'
const PARENT_CHILD_PREFIX: Record<string, string> = {
  // 'category': 'shop/category'
  // CLARIFY with the user!
};

function buildItemPath(item: any): string {
  return URL_OVERRIDES[item.pageUrl] ?? item.pageUrl;
}

function buildChildPath(parent: any, child: any): string {
  if (PARENT_CHILD_PREFIX[parent.pageUrl]) {
    return `${PARENT_CHILD_PREFIX[parent.pageUrl]}/${child.pageUrl}`;
  }
  // Standard logic: if child.pageUrl already contains parent.pageUrl — use as is
  if (child.pageUrl?.startsWith(parent.pageUrl)) return child.pageUrl;
  return `${parent.pageUrl}/${child.pageUrl}`;
}

export async function NavMenu({ locale }: { locale: string }) {
  const menu = await getApi().Menus.getMenusByMarker('YOUR_MARKER', locale);

  // pages — root menu items (tree). Normalize: array or single object
  const navItems = !isError(menu) && menu.pages
    ? (Array.isArray(menu.pages) ? menu.pages : [menu.pages])
    : [];

  return (
    <nav>
      <ul>
        {navItems.map((item: any) => {
          const children = getChildren(item);
          const itemPath = buildItemPath(item);

          return (
            <li key={item.id}>
              <Link href={`/${locale}/${itemPath}`}>
                {item.localizeInfos?.title || item.localizeInfos?.menuTitle}
              </Link>

              {children.length > 0 && (
                <ul>
                  {children.map((child: any) => (
                    <li key={child.id}>
                      <Link href={`/${locale}/${buildChildPath(item, child)}`}>
                        {child.localizeInfos?.title || child.localizeInfos?.menuTitle}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

---

## Step 5: Add usage in layout

```tsx
// app/[locale]/layout.tsx
import { NavMenu } from '@/components/NavMenu';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params; // ⚠️ Next.js 15+: params is a Promise!

  return (
    <>
      <NavMenu locale={locale} />
      <main>{children}</main>
    </>
  );
}
```

---

## Step 6: Remind key rules

After creating the file, output:

✅ Component created. Key rules:

```md
1. The API returns a tree — child items in item.children (NOT through parentId filter on pages, it will return empty)
2. pages and children — array OR single object: always normalize via Array.isArray()
3. Use localizeInfos?.title || localizeInfos?.menuTitle for the item title
4. pageUrl = marker ("about"), not the route path ("/[locale]/about")
5. params in Next.js 15+ — is a Promise, always await in layout/page
6. DO NOT guess markers — get them via /inspect-api menus
```

---

## Step 7: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 7.1 Add `data-testid` to the component

For selector stability — add `data-testid` when generating `NavMenu.tsx`:

```tsx
<nav data-testid="nav-menu">
  <ul>
    {navItems.map((item) => {
      const children = getChildren(item);
      return (
        <li key={item.id} data-testid={`nav-item-${item.pageUrl}`}>
          <Link
            href={`/${locale}/${buildItemPath(item)}`}
            data-testid={`nav-link-${item.pageUrl}`}
          >
            {item.localizeInfos?.title || item.localizeInfos?.menuTitle}
          </Link>

          {children.length > 0 && (
            <ul data-testid={`nav-submenu-${item.pageUrl}`}>
              {children.map((child) => (
                <li key={child.id} data-testid={`nav-item-${child.pageUrl}`}>
                  <Link
                    href={`/${locale}/${buildChildPath(item, child)}`}
                    data-testid={`nav-link-${child.pageUrl}`}
                  >
                    {child.localizeInfos?.title || child.localizeInfos?.menuTitle}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      );
    })}
  </ul>
</nav>
```

### 7.2 Gather test parameters and fill in `.env.local`

**Algorithm (perform step by step, do not ask in one list):**

1. **Menu marker** — use the marker passed as an argument to `/create-menu <marker>`. If it is not there — take it from `/inspect-api menus` (Step 1). If there are multiple menus and the user did not clarify — ask: "The project found the menu: `{list}`. Which one to test?".
2. **Menu items** — get it through `/inspect-api menus` (already called in Step 1). From the response:
   - `firstPageUrl` — `pageUrl` of the first top-level item (for click test)
   - `parentWithChildren` — top-level item that has children (for hierarchy test). If not — skip the hierarchy test with `test.skip` with the reason "there are no nested items in the menu".
   - Inform: "For the click test, I will use the item `{firstPageUrl}`. For the hierarchy test — `{parentWithChildren}` with children: `{childrenList}`".
3. **Default locale** — take it from `.env.local` (`DEFAULT_LOCALE`) or from the first segment of `getApi().Locales.getLocales()`. Inform: "Using locale `{locale}` for the test".
4. **Page where the menu is rendered** — ask: "On which pages is the menu displayed? (usually — in layout, meaning everywhere)".
   - If silent → test on `/${locale}` (the root of the locale). Inform: "Testing on the root page of the locale `/{locale}`".

**Example of filling in `.env.local` (do it yourself, do not ask the user to copy):**

```bash
# e2e menu
E2E_MENU_LOCALE=en_US
E2E_MENU_FIRST_ITEM_URL=about
# (optional) Parent item with children — for hierarchy test
E2E_MENU_PARENT_URL=catalog
E2E_MENU_CHILD_URL=electronics
```

### 7.3 Create `e2e/menu.spec.ts`

> ⚠️ Tests check the real structure of the menu from the OneEntry Menus API. Item markers are taken from `/inspect-api menus`.

```typescript
import { test, expect } from '@playwright/test';

const LOCALE = process.env.E2E_MENU_LOCALE || 'en_US';
const FIRST_ITEM = process.env.E2E_MENU_FIRST_ITEM_URL || '';
const PARENT_ITEM = process.env.E2E_MENU_PARENT_URL || '';
const CHILD_ITEM = process.env.E2E_MENU_CHILD_URL || '';

test.describe('Nav menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/${LOCALE}`);
    await expect(page.getByTestId('nav-menu')).toBeVisible();
  });

  test('the menu renders items from Menus API', async ({ page }) => {
    const items = page.locator('[data-testid^="nav-item-"]');
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test.skip(!FIRST_ITEM, 'E2E_MENU_FIRST_ITEM_URL is not set');
  test('clicking the first item navigates to the page', async ({ page }) => {
    const link = page.getByTestId(`nav-link-${FIRST_ITEM}`);
    await expect(link).toBeVisible();

    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain(`/${LOCALE}/`);

    await link.click();
    // URL should match href (either contains pageUrl if there were URL prefixes)
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/`));
    expect(page.url()).not.toMatch(new RegExp(`/${LOCALE}$`));
  });

  test.skip(!PARENT_ITEM || !CHILD_ITEM, 'E2E_MENU_PARENT_URL/CHILD_URL are not set (there are no nested items in the menu)');
  test('hierarchy: parent item contains child submenu', async ({ page }) => {
    const parentItem = page.getByTestId(`nav-item-${PARENT_ITEM}`);
    await expect(parentItem).toBeVisible();

    // Submenu may be hidden (hover/click) — hover over the parent
    await parentItem.hover();

    const submenu = page.getByTestId(`nav-submenu-${PARENT_ITEM}`);
    await expect(submenu).toBeVisible();

    const childLink = page.getByTestId(`nav-link-${CHILD_ITEM}`);
    await expect(childLink).toBeVisible();
  });

  test('all links contain locale prefix', async ({ page }) => {
    const links = page.locator('[data-testid^="nav-link-"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      expect(href, `Link #${i} should contain /${LOCALE}/`).toContain(`/${LOCALE}/`);
    }
  });
});
```

### 7.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/menu.spec.ts created
✅ data-testid added to NavMenu
✅ .env.local updated (E2E_MENU_LOCALE, E2E_MENU_FIRST_ITEM_URL, E2E_MENU_PARENT_URL, E2E_MENU_CHILD_URL)

Decisions made automatically (if applicable):
- Menu marker: {marker} — {specified by user / taken from /inspect-api menus}
- Locale: {LOCALE} — from .env.local or the first from getApi().Locales.getLocales()
- First item for click test: {FIRST_ITEM} — taken from menu.pages[0].pageUrl
- Parent item with children: {exists → PARENT_ITEM={...}, CHILD_ITEM={...} / does not exist → hierarchy test skipped via test.skip, reason: there are no nested items in the menu (children)}
- Page for the test: /{LOCALE} — {specified by user / used the root page of the locale}

Run: npm run test:e2e -- menu.spec.ts
```
