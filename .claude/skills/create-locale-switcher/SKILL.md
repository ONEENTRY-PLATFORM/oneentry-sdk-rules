---
name: create-locale-switcher
description: Create language switcher
---
# /create-locale-switcher — Language Switcher

Creates a component for changing the language based on data from the `Locales API`.

---

## Step 1: Clarify with the user

1. **Where is the switch located?** (Header, Footer, separate component)
2. **How to display languages?** — code (`en_US`), name (`English`), flag?
3. **Is there a layout?** — if yes, copy exactly

---

## Step 2: Create Server Action

> If `app/actions/locales.ts` already exists — read and supplement, do not duplicate.

```typescript
// app/actions/locales.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';

export interface LocaleItem {
  code: string;
  title: string;
  shortCode: string; // the first two characters of the code, e.g. 'en' from 'en_US'
}

export async function getLocales(): Promise<LocaleItem[]> {
  const locales = await getApi().Locales.getLocales();
  if (isError(locales)) return [];
  return (locales as any[]).map((locale: any) => ({
    code: locale.code,                            // 'en_US', 'ru_RU'
    title: locale.localizeInfos?.title || locale.code, // 'English', 'Русский'
    shortCode: locale.code?.split('_')[0] || locale.code, // 'en', 'ru'
  }));
}
```

---

## Step 3: Create the switcher component

### Key Principles

- The current locale is taken from the URL (the `[locale]` segment in the route)
- When changing the language, replace the locale segment in the `pathname` and navigate there
- `usePathname()` + `useRouter()` from `next/navigation`
- Can be made as a Server Component (receives locale as a prop) or Client Component
- Locales are loaded **once** — either passed as a prop from the server parent or cached

### Option A: Server parent passes locales as a prop (preferred)

```tsx
// In Header (Server Component):
import { getLocales } from '@/app/actions/locales';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

export async function Header({ locale }: { locale: string }) {
  const locales = await getLocales();
  return (
    <header>
      {/* ... */}
      <LocaleSwitcher locale={locale} locales={locales} />
    </header>
  );
}
```

```tsx
// components/LocaleSwitcher.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { LocaleItem } from '@/app/actions/locales';

interface LocaleSwitcherProps {
  locale: string;
  locales: LocaleItem[];
}

export function LocaleSwitcher({ locale, locales }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;

    // Replace the current locale segment in the URL:
    // /en_US/shop/product/123 → /ru_RU/shop/product/123
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <div>
      {locales.map((loc) => (
        <button
          key={loc.code}
          onClick={() => switchLocale(loc.code)}
          disabled={loc.code === locale}
          aria-current={loc.code === locale ? 'true' : undefined}
        >
          {loc.shortCode.toUpperCase()} {/* EN / RU */}
          {/* or loc.title for the full name */}
        </button>
      ))}
    </div>
  );
}
```

### Option B: Client component loads locales itself

```tsx
// components/LocaleSwitcher.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getLocales } from '@/app/actions/locales';
import type { LocaleItem } from '@/app/actions/locales';

interface LocaleSwitcherProps {
  locale: string;
}

export function LocaleSwitcher({ locale }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [locales, setLocales] = useState<LocaleItem[]>([]);

  useEffect(() => {
    getLocales().then(setLocales);
  }, []);

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  if (locales.length === 0) return null;

  return (
    <div>
      {locales.map((loc) => (
        <button
          key={loc.code}
          onClick={() => switchLocale(loc.code)}
          disabled={loc.code === locale}
        >
          {loc.shortCode.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

### Option C: Links instead of router.push (SEO-friendly)

```tsx
import Link from 'next/link';

// Replace locale segment and make <Link> instead of button
{locales.map((loc) => {
  const href = pathname.replace(`/${locale}`, `/${loc.code}`);
  return (
    <Link
      key={loc.code}
      href={href}
      aria-current={loc.code === locale ? 'page' : undefined}
    >
      {loc.shortCode.toUpperCase()}
    </Link>
  );
})}
```

---

## Step 4: Set up routing (if not already set up)

The switcher assumes that the application uses the `[locale]` segment in the route:

```
app/
  [locale]/
    layout.tsx   ← receives locale from params
    page.tsx
    shop/
      page.tsx
```

In `[locale]/layout.tsx`, the locale is passed to child components:

```tsx
// app/[locale]/layout.tsx
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div>
      <Header locale={locale} />
      {children}
    </div>
  );
}
```

---

## Step 5: Remind key rules

```md
✅ Language switcher created. Key rules:

1. getLocales() returns code ('en_US'), title ('English'), shortCode ('en')
2. Changing locale — replace pathname.replace(`/${locale}`, `/${newLocale}`)
3. Server parent passes locales as prop — better for performance
4. The current locale is determined from params/useParams, NOT hardcoded
5. locale.localizeInfos?.title — localized name of the language ('Русский', 'English')
6. For SEO-friendly: use <Link href={newPath}> instead of router.push
```

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> For setting up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to the component

For selector stability — add `data-testid` when generating `LocaleSwitcher.tsx`:

```tsx
<div data-testid="locale-switcher">
  {locales.map((loc) => (
    <button
      key={loc.code}
      data-testid={`locale-option-${loc.code}`}
      onClick={() => switchLocale(loc.code)}
      disabled={loc.code === locale}
      aria-current={loc.code === locale ? 'true' : undefined}
    >
      {loc.shortCode.toUpperCase()}
    </button>
  ))}
</div>
```

If Option C is chosen (links):

```tsx
<div data-testid="locale-switcher">
  {locales.map((loc) => (
    <Link
      key={loc.code}
      data-testid={`locale-option-${loc.code}`}
      href={pathname.replace(`/${locale}`, `/${loc.code}`)}
      aria-current={loc.code === locale ? 'page' : undefined}
    >
      {loc.shortCode.toUpperCase()}
    </Link>
  ))}
</div>
```

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **List of available locales** — get it from the API via `/inspect-api` (option: temporary mjs script in `.claude/temp/` calling `getApi().Locales.getLocales()`). At least 2 locales are needed — otherwise, the language switch tests are meaningless (`test.skip` with an explanation).
2. **Default locale and test locale for switching** — determine yourself: the first from the list = default, the second = test target. Save in `.env.local` as `E2E_DEFAULT_LOCALE` and `E2E_TARGET_LOCALE`. Inform: "Available locales: `{list}`. For the switch test use `{default} → {target}`".
3. **Page path with the switcher** — ask: "On which pages is the switch displayed? (for example, only `/`, or everywhere)".
   - If silent → take `/` (root) + check that `<LocaleSwitcher>` is rendered in layout via Grep. Inform: "Testing on `/`, switcher in layout — available on all pages".
4. **Localized content for checking language change** — ask: "Is there a noticeable localized element on the page? (page title, menu item)".
   - If silent → the locale change test checks only the URL and `<html lang>` (without checking the text). Inform: "Checking locale change by URL segment and `<html lang>` attribute. If specific text check is needed — indicate the block marker".

**Example of filling in `.env.local` (do it yourself, do not ask the user to copy):**

```bash
# e2e locale switcher
E2E_DEFAULT_LOCALE=en_US
E2E_TARGET_LOCALE=ru_RU
E2E_LOCALE_TEST_PATH=/
```

### 6.3 Create `e2e/locale-switcher.spec.ts`

> ⚠️ Tests check the dynamic change of the `/${locale}/` segment in the URL. Locale markers are taken from the real OneEntry project.

```typescript
import { test, expect } from '@playwright/test';

const DEFAULT_LOCALE = process.env.E2E_DEFAULT_LOCALE || '';
const TARGET_LOCALE = process.env.E2E_TARGET_LOCALE || '';
const TEST_PATH = process.env.E2E_LOCALE_TEST_PATH || '/';

test.describe('Locale switcher', () => {
  test.skip(!DEFAULT_LOCALE || !TARGET_LOCALE, 'E2E_DEFAULT_LOCALE/TARGET_LOCALE not set (at least 2 locales needed in the project)');

  test.beforeEach(async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}${TEST_PATH}`);
    await expect(page.getByTestId('locale-switcher')).toBeVisible();
  });

  test('renders buttons for all locales from API', async ({ page }) => {
    const options = page.locator('[data-testid^="locale-option-"]');
    await expect(options.first()).toBeVisible();
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('current locale is marked as disabled/aria-current', async ({ page }) => {
    const current = page.getByTestId(`locale-option-${DEFAULT_LOCALE}`);
    // either disabled (in button), or aria-current (in link)
    const isDisabled = await current.isDisabled().catch(() => false);
    const ariaCurrent = await current.getAttribute('aria-current');
    expect(isDisabled || ariaCurrent === 'true' || ariaCurrent === 'page').toBeTruthy();
  });

  test('clicking on another locale changes URL segment and <html lang>', async ({ page }) => {
    await page.getByTestId(`locale-option-${TARGET_LOCALE}`).click();

    // URL contains the new locale
    await expect(page).toHaveURL(new RegExp(`/${TARGET_LOCALE}`));
    // The segment with the default locale is no longer leading
    expect(page.url()).not.toMatch(new RegExp(`/${DEFAULT_LOCALE}/`));
  });

  test('locale change persists when navigating between pages', async ({ page }) => {
    await page.getByTestId(`locale-option-${TARGET_LOCALE}`).click();
    await expect(page).toHaveURL(new RegExp(`/${TARGET_LOCALE}`));

    // Reloading the page — locale remains in the URL
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${TARGET_LOCALE}`));
    // The switcher shows the new locale as current
    const newCurrent = page.getByTestId(`locale-option-${TARGET_LOCALE}`);
    const isDisabled = await newCurrent.isDisabled().catch(() => false);
    const ariaCurrent = await newCurrent.getAttribute('aria-current');
    expect(isDisabled || ariaCurrent === 'true' || ariaCurrent === 'page').toBeTruthy();
  });
});
```

### 6.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/locale-switcher.spec.ts created
✅ data-testid added to LocaleSwitcher
✅ .env.local updated (E2E_DEFAULT_LOCALE, E2E_TARGET_LOCALE, E2E_LOCALE_TEST_PATH)

Decisions made automatically (if applicable):
- Available locales: {list} — obtained via getApi().Locales.getLocales()
- Switch test: {DEFAULT_LOCALE} → {TARGET_LOCALE} (first and second from the list)
- Path for the test: {TEST_PATH} — {user specified / used `/`}
- Checking localized content: {disabled, checking only URL and <html lang> / enabled, checking text of block {marker}}. Reason: user did not specify a specific localized element for checking.
- If there is only one locale — all tests test.skip with the reason "at least 2 locales needed".

Run: npm run test:e2e -- locale-switcher.spec.ts
```
