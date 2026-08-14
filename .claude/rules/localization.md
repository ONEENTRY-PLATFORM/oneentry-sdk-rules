---
paths:
  - "app/**/page.tsx"
  - "src/app/**/page.tsx"
  - "app/**/layout.tsx"
  - "src/app/**/layout.tsx"
  - "app/actions/**/*.ts"
  - "src/app/actions/**/*.ts"
---
# Localization — OneEntry Rules

## locale from params (Next.js 15+)

```typescript
// ✅ params is a Promise, must await
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const page = await getApi().Pages.getPageByUrl('home', locale)
}
```

## Do not hardcode locale

```typescript
// ❌ INCORRECT
getApi().Pages.getPageByUrl('home', 'en_US')

// ✅ CORRECT — from params
const { locale } = await params
getApi().Pages.getPageByUrl('home', locale)
```

## langCode — optional parameter

`langCode` is set during the initialization of `defineOneEntry(url, { token, langCode })` (`token` is required — since 1.0.154 SDK throws `Error` if it's missing) and is used by default. 
Pass `locale` explicitly only in the multilingual route `src/app/[locale]/`.

```typescript
// Monolingual project — langCode is not needed explicitly
getApi().Pages.getPageByUrl('home')

// Multilingual — pass locale from params
getApi().Pages.getPageByUrl('home', locale)
```

## locale in Client Component

```typescript
// ✅ Multilingual route src/app/[locale]/ — useParams()
'use client'
import { useParams } from 'next/navigation'

const params = useParams()
const locale = params.locale as string || 'en_US'

// ✅ Monolingual project — getLang() from src/lib/oneentry.ts (reads current langCode from SDK)
import { getLang } from '@/lib/oneentry'
const lang = getLang() // 'en_US' or another SDK initialization language
```

## localizeInfos — content structure

```typescript
page.localizeInfos?.title        // title
page.localizeInfos?.htmlContent  // HTML content — in dangerouslySetInnerHTML only through sanitizeHtml()

// plain text — from v1.0.158 declared in ILocalizeInfo (`plainContent?: string | null`), cast is not needed.
// In SDK ≤ 1.0.157 the field was present, but it was not in the type — a cast was still needed.
const plain = page.localizeInfos?.plainContent

// Blocks: localizeInfos as fallback if attributes are not present
const title = attrs.title?.value || block.localizeInfos?.title || ''
```

---

## UI String Dictionary — `static_content` AttributeSet + `t()` helper

For UI microcopy (`"Add to cart"`, `"No reviews yet"`, section headers) — create an AttributeSet in the admin panel with the marker `static_content`. Each attribute inside is a pair `marker → value` for one locale. On the front end — a single helper `t(marker, fallback)`.

**Why this way, instead of `<h2>Add to cart</h2>` in JSX:**

- The user edits microcopy through the admin panel without touching the code.
- One source of truth for each string — no duplicates of `"Add to cart"` in 5 files.
- Translating to another locale — adding a new localization in the admin panel, no code release.

**Implementation (Server Component):**

```typescript
// src/app/dictionaries.ts
import 'server-only';
import type { IAttributeValue, IAttributeValues } from 'oneentry';
import { getApi } from '@/lib/oneentry';

// Simple in-memory cache on request
const cache = new Map<string, unknown>();
const getCachedData = async <T>(key: string, fetchFn: () => Promise<T>): Promise<T> => {
  if (cache.has(key)) return cache.get(key) as T;
  const data = await fetchFn();
  cache.set(key, data);
  return data;
};

// locale is required in a multilingual route: without it getAttributesByMarker takes the language
// of SDK initialization (this.state.lang) and will return one language for all locales.
const fetchDictionary = async (locale?: string): Promise<IAttributeValues> => {
  try {
    const attributes = await getApi().AttributesSets.getAttributesByMarker('static_content', locale);
    if (!Array.isArray(attributes)) return {} as IAttributeValues;

    const dict = {} as IAttributeValues;
    for (const raw of attributes as unknown as Array<{ marker: string; value?: unknown; initialValue?: string }>) {
      // value may come empty {} if the value for the current locale is not set — fallback to initialValue (default from admin).
      // Forms of initialValue (flat / language-keyed) — .claude/rules/attribute-sets.md, section "initialValue"
      const isEmpty = raw.value == null || (typeof raw.value === 'object' && Object.keys(raw.value as object).length === 0);
      dict[raw.marker] = { ...raw, value: isEmpty ? (raw.initialValue ?? '') : raw.value } as unknown as IAttributeValue;
    }
    return dict;
  } catch {
    return {} as IAttributeValues;
  }
};

// Cache key includes locale, otherwise the first requested language will "stick" for all locales.
export const getDictionary = async (locale?: string): Promise<IAttributeValues> =>
  getCachedData(locale ? `dictionary:${locale}` : 'dictionary', () => fetchDictionary(locale));

/**
 * Server-side helper for reading a dictionary string by marker.
 * In a multilingual route, pass locale from params.
 *
 * Usage: `const title = await t('featured_objects', 'Featured objects', locale);`
 */
export const t = async (marker: string, fallback: string, locale?: string): Promise<string> => {
  const dict = await getDictionary(locale);
  const value = dict?.[marker]?.value;
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};
```

**Usage:**

```tsx
// src/app/[locale]/page.tsx — Server Component
import { t } from '@/app/dictionaries';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <section>
      <h2>{await t('featured_objects', 'Featured objects', locale)}</h2>
      <p>{await t('home_intro', 'Welcome — order delivery in one tap.', locale)}</p>
    </section>
  );
}
```

**If the marker is not present in the admin panel** — `t()` returns fallback. Add an item to `MISMATCH-LOG.md` (rule `.claude/rules/mismatch-log.md`) (section C.4) with the table `marker | type | title | notes`, so the user can create the missing markers in the AttributeSet `static_content`.

> For Client Components — extract the dictionary through React Context (`<DictionaryProvider value={dict}>`) or through props from the nearest Server Component, rather than calling the SDK on the client.
