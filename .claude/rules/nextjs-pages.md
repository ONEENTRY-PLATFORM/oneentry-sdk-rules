---
paths:
  - "app/**/page.tsx"
  - "src/app/**/page.tsx"
  - "app/**/layout.tsx"
  - "src/app/**/layout.tsx"
---
# Next.js Pages — OneEntry Rules

## ⚠️ params and searchParams are Promises (Next.js 15+)

```tsx
// ❌ INCORRECT — params are not awaited, you get undefined
export default function Page({ params }: { params: { locale: string } }) {
  const locale = params.locale  // undefined!
}

// ✅ CORRECT — async function, params awaited
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;     // ← mandatory!
  const sp = await searchParams;       // ← mandatory!
}
```

## pageUrl = marker, NOT route path

```typescript
// ❌ INCORRECT — you pass the full route path
getApi().Pages.getPageByUrl('shop/category/about', locale)

// ✅ CORRECT — only the marker from the pageUrl field in OneEntry
getApi().Pages.getPageByUrl('about', locale)
// URL in the app: /shop/category/about
// pageUrl in OneEntry: "about"
```

## Getting page content

```tsx
import { getApi, isError } from '@/lib/oneentry';
import { sanitizeHtml } from '@/lib/sanitize-html';
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
    getApi().Pages.getBlocksByPageUrl('my-page-marker', locale),
  ]);

  if (isError(page)) notFound();

  return (
    <main>
      <h1>{page.localizeInfos?.title}</h1>
      {/* HTML from CMS — ONLY through sanitizer, see .claude/rules/security.md */}
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.localizeInfos?.htmlContent) }} />
    </main>
  );
}
```

## DO NOT hardcode page content

```tsx
// ❌ INCORRECT
return <h1>About Us</h1>

// ✅ CORRECT — content from CMS
return <h1>{page.localizeInfos?.title}</h1>
```

> Related rules:
>
> - `.claude/rules/performance.md` — `force-static` + `revalidate`, wrapping `useSearchParams` in `<Suspense>`, passing Promise in layout instead of `await`, `Promise.all` for independent fetches.
> - `.claude/rules/performance-streaming.md` — `loading.tsx` for each route segment, local `<Suspense>` around slow blocks, PPR via `experimental.ppr: 'incremental'`, cannot stream `generateMetadata`.
