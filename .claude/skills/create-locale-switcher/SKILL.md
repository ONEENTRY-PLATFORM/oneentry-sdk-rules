<!-- META
type: skill
skillConfig: {"name":"create-locale-switcher"}
-->

# /create-locale-switcher — Language Switcher

Creates a language switcher component based on data from `Locales API`.

---

## Step 1: Clarify with the user

1. **Where is the switcher placed?** (Header, Footer, separate component)
2. **How to display languages?** — code (`en_US`), name (`English`), flag?
3. **Is there a layout?** — if yes, copy it exactly

---

## Step 2: Create Server Action

> If `app/actions/locales.ts` already exists — read and extend it, don't duplicate.

```typescript
// app/actions/locales.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';

export interface LocaleItem {
  code: string;
  title: string;
  shortCode: string; // first two characters of the code, e.g. 'en' from 'en_US'
}

export async function getLocales(): Promise<LocaleItem[]> {
  const locales = await getApi().Locales.getLocales();
  if (isError(locales)) return [];
  return (locales as any[]).map((locale: any) => ({
    code: locale.code,                            // 'en_US', 'ru_RU'
    title: locale.localizeInfos?.title || locale.code, // 'English', 'Russian'
    shortCode: locale.code?.split('_')[0] || locale.code, // 'en', 'ru'
  }));
}
```

---

## Step 3: Create the switcher component

### Key principles

- Current locale is taken from URL (`[locale]` segment in the route)
- When switching language, replace the locale segment in `pathname` and navigate there
- `usePathname()` + `useRouter()` from `next/navigation`
- Can be a Server Component (receives locale as prop) or Client Component
- Locales are loaded **once** — either passed as prop from a server parent, or cached

### Option A: Server parent passes locales as prop (preferred)

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

    // Replace current locale segment in URL:
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
          {/* or loc.title for full name */}
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

## Step 4: Configure routing (if not yet configured)

The switcher assumes the app uses the `[locale]` segment in routes:

```
app/
  [locale]/
    layout.tsx   ← receives locale from params
    page.tsx
    shop/
      page.tsx
```

In `[locale]/layout.tsx` locale is passed to child components:

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

## Step 5: Remind of key rules

```md
✅ Language switcher created. Key rules:

1. getLocales() returns code ('en_US'), title ('English'), shortCode ('en')
2. Switching locale — replace pathname.replace(`/${locale}`, `/${newLocale}`)
3. Server parent passes locales as prop — better for performance
4. Current locale is determined from params/useParams, NOT hardcoded
5. locale.localizeInfos?.title — localized language name ('Russian', 'English')
6. For SEO-friendly: use <Link href={newPath}> instead of router.push
```
