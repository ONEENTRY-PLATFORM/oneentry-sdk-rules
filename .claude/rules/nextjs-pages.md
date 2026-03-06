---
paths:
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
---

# Next.js Pages — OneEntry Rules

## ⚠️ params and searchParams are Promises (Next.js 15+)

```tsx
// ❌ WRONG — params not awaited, you get undefined
export default function Page({ params }: { params: { locale: string } }) {
  const locale = params.locale  // undefined!
}

// ✅ CORRECT — function is async, params awaited
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;     // ← required!
  const sp = await searchParams;       // ← required!
}
```

## pageUrl = marker, NOT route path

```typescript
// ❌ WRONG — passing full route path
getApi().Pages.getPageByUrl('shop/category/about', locale)

// ✅ CORRECT — only the marker from pageUrl field in OneEntry
getApi().Pages.getPageByUrl('about', locale)
// URL in the app: /shop/category/about
// pageUrl in OneEntry: "about"
```

## Getting page content

```tsx
import { getApi, isError } from '@/lib/oneentry';
import { notFound } from 'next/navigation';

export default async function MyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Parallel requests — faster
  const [page, blocks] = await Promise.all([
    getApi().Pages.getPageByUrl('my-page-marker', locale),
    getApi().Pages.getBlocksByPageUrl('my-page-marker'),
  ]);

  if (isError(page)) notFound();

  return (
    <main>
      <h1>{page.localizeInfos?.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: page.localizeInfos?.htmlContent || '' }} />
    </main>
  );
}
```

## DON'T hardcode page content

```tsx
// ❌ WRONG
return <h1>About Us</h1>

// ✅ CORRECT — content from CMS
return <h1>{page.localizeInfos?.title}</h1>
```
