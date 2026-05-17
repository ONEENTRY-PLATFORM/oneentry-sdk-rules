<!-- META
type: rules
fileName: localization.md
rulePaths: ["app/**/page.tsx","app/**/layout.tsx","app/actions/**/*.ts"]
paths:
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
  - "app/actions/**/*.ts"
-->

# Localization — OneEntry Rules

## locale from params (Next.js 15+)

```typescript
// ✅ params — this is a Promise, must await
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

`langCode` is set during the initialization `defineOneEntry(url, { langCode })` and is used by default. Pass `locale` explicitly only in the multilingual route `app/[locale]/`.

```typescript
// Monolingual project — langCode is not needed explicitly
getApi().Pages.getPageByUrl('home')

// Multilingual — pass locale from params
getApi().Pages.getPageByUrl('home', locale)
```

## locale in Client Component

```typescript
// ✅ Multilingual route app/[locale]/ — useParams()
'use client'
import { useParams } from 'next/navigation'

const params = useParams()
const locale = params.locale as string || 'en_US'

// ✅ Monolingual project — getLang() from lib/oneentry.ts (reads the current langCode from SDK)
import { getLang } from '@/lib/oneentry'
const lang = getLang() // 'en_US' or another SDK initialization language
```

## localizeInfos — content structure

```typescript
page.localizeInfos?.title        // title
page.localizeInfos?.htmlContent  // HTML content (for dangerouslySetInnerHTML)
page.localizeInfos?.content      // plain text

// Blocks: localizeInfos as fallback if there are no attributes
const title = attrs.title?.value || block.localizeInfos?.title || ''
```

---

## UI String Dictionary — `static_content` AttributeSet + `t()` helper

For UI microcopy (`"Add to cart"`, `"No reviews yet"`, section headers) — create an AttributeSet in the admin panel with the marker `static_content`. Each attribute inside is a pair `marker → value` for one locale. On the front end — a single helper `t(marker, fallback)`.

**Why this way, and not `<h2>Add to cart</h2>` in JSX:**

- The user edits microcopy through the admin panel without touching the code.
- One source of truth for each string — no duplicates of `"Add to cart"` in 5 files.
- Translating to another locale — adding a new localization in the admin panel, no code release.

**Implementation (Server Component):**

```typescript
// app/dictionaries.ts
import 'server-only';
import type { IAttributeValue, IAttributeValues } from 'oneentry/dist/base/utils';
import { getApi } from '@/lib/oneentry';

// Simple in-memory cache on request
const cache = new Map<string, unknown>();
const getCachedData = async <T>(key: string, fetchFn: () => Promise<T>): Promise<T> => {
  if (cache.has(key)) return cache.get(key) as T;
  const data = await fetchFn();
  cache.set(key, data);
  return data;
};

const fetchDictionary = async (): Promise<IAttributeValues> => {
  try {
    const attributes = await getApi().AttributesSets.getAttributesByMarker('static_content');
    if (!Array.isArray(attributes)) return {} as IAttributeValues;

    const dict = {} as IAttributeValues;
    for (const raw of attributes as unknown as Array<{ marker: string; value?: unknown; initialValue?: string }>) {
      // value may come empty {} if the value for the current locale is not set — fallback to initialValue (default from admin)
      const isEmpty = raw.value == null || (typeof raw.value === 'object' && Object.keys(raw.value as object).length === 0);
      dict[raw.marker] = { ...raw, value: isEmpty ? (raw.initialValue ?? '') : raw.value } as unknown as IAttributeValue;
    }
    return dict;
  } catch {
    return {} as IAttributeValues;
  }
};

export const getDictionary = async (): Promise<IAttributeValues> =>
  getCachedData('dictionary', fetchDictionary);

/**
 * Server-side helper for reading a dictionary string by marker.
 *
 * Usage: `const title = await t('featured_objects', 'Featured objects');`
 */
export const t = async (marker: string, fallback: string): Promise<string> => {
  const dict = await getDictionary();
  const value = dict?.[marker]?.value;
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};
```

**Usage:**

```tsx
// app/page.tsx — Server Component
import { t } from '@/app/dictionaries';

export default async function HomePage() {
  return (
    <section>
      <h2>{await t('featured_objects', 'Featured objects')}</h2>
      <p>{await t('home_intro', 'Welcome — order delivery in one tap.')}</p>
    </section>
  );
}
```

**If the marker is not in the admin panel** — `t()` returns fallback. Add an item to [`MISMATCH-LOG.md`](mismatch-log.md) (section C.4) with the table `marker | type | title | notes`, so the user can create the missing markers in the AttributeSet `static_content`.

> For Client Components — extract the dictionary via React Context (`<DictionaryProvider value={dict}>`) or through props from the nearest Server Component, rather than calling the SDK on the client.
