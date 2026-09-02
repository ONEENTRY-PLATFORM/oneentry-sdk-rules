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

`langCode` is set during initialization `defineOneEntry(url, { token, langCode })` (`token` is required — since 1.0.154 SDK throws `Error` if it's missing) and is used by default. 
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

// plain text — since v1.0.158 declared in ILocalizeInfo (`plainContent?: string | null`), cast is not needed.
// In SDK ≤ 1.0.157 the field was present, but it was not in the type — a cast was still needed.
const plain = page.localizeInfos?.plainContent

// Blocks: localizeInfos as fallback if attributes are missing
const title = attrs.title?.value || block.localizeInfos?.title || ''
```

---

## UI String Dictionary — `static_content` AttributeSet + `t()` helper

For UI microcopy (`"Add to cart"`, `"No reviews yet"`, section headers) — create an AttributeSet in the admin panel with the marker `static_content`. Each attribute inside is a pair `marker → value` for one locale. On the front end — a single helper `t(marker, fallback)`.

**Why this way, instead of `<h2>Add to cart</h2>` in JSX:**

- The user edits microcopy through the admin panel without touching the code.
- One source of truth for each string — no duplicates of `"Add to cart"` in 5 files.
- Translation to another locale — adding a new localization in the admin panel, not a code release.

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

// locale is required in multilingual route: without it getAttributesByMarker takes the initialization language of the SDK (this.state.lang) and will return one language for all locales.
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
 * In multilingual route, pass locale from params.
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

**If the marker is missing in the admin panel** — `t()` returns fallback. Add an entry in `MISMATCH-LOG.md` (rule `.claude/rules/mismatch-log.md`) (section C.4) with the table `marker | type | title | notes`, so the user can create the missing markers in the AttributeSet `static_content`.

> For Client Components — extract the dictionary through React Context (`<DictionaryProvider value={dict}>`) or through props from the nearest Server Component, rather than calling the SDK on the client.

---

## Second locale — a layer over the first, not a separate site

The structure is copied entirely, translation is substituted by slot address. The slot address is the path within the attribute value: `string_id12` (the entire string), `text_id2.0.htmlValue` (the first element of text), `textWithHeader_id7.1.header` (the header of the second element).

The order is always the same: **snapshot "address → value of the first language" → translation → write → check**. The snapshot is taken **before** content edits: taken afterwards — compares the translation with fresh text and skips the old translation for the new layout.

What breaks during writing (all of this responds with `200`):

- **body with one locale erases others** — write both locales in one body, expanding existing ones (`.claude/rules/admin-api.md`);
- **file value is copied entirely**, not by `filename`: `downloadLink`/`previewLink` platform does not output — in the second language images are loaded differently (`/admin-upload-images`);
- **link by header is written in the language of its locale**: if an image or file is linked to a block by header, and the header is translated, the English header in the second locale silently breaks the link — the block is empty;
- **missed slot leaves text of the first language** — this is a conscious decision, but it should be in the list of "what we do not translate" (organization names, personal names, addresses, service marker values, internal routes).

Five checks, all scripted, not selective viewing:

1. **Completeness** — each record has a layer of the second locale, the number of filled values matches the first language.
2. **Freshness** — translation has not lagged behind the structure: compare the volume of text by slots; a discrepancy of more than one and a half to two times almost always indicates a translation of the previous layout.
3. **Pairs "value — signature"** — compare in whole pairs, not by quantity: signatures to numbers can easily shift by one, and the counter "numbers are the same" does not see this.
4. **Files** — for each file field `filename`, `downloadLink`, `previewLink` match in both locales: the file is the same, differs only in the signature next to it.
5. **Links with language prefix** — by traversing the entire second version: the prefix is in place and survives redirects. It breaks in four places — `redirect()` without prefix, link inside CMS text (`href="/about"` translation does not change), address field next to text (callout button), logo and "to main" in the layout. The prefix function itself must be idempotent: called twice, it should not yield `/es/es/contact`.

**Any content edit — work in two languages.** Broke the page into blocks, rewrote the header, moved a paragraph — at this moment the second locale became incomplete; running translations is part of the same task, not "later". And cleaning text by matching strings (for example, "do not repeat what is already in the signature") does not work in the second locale — there the strings are translated: duplicates are removed **in the data**, not filtered during rendering.
