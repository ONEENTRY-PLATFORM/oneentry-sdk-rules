---
paths:
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
---

# Next.js Pages — правила OneEntry

## ⚠️ params и searchParams — это Promise (Next.js 15+)

```tsx
// ❌ НЕПРАВИЛЬНО — params не ждут, получаешь undefined
export default function Page({ params }: { params: { locale: string } }) {
  const locale = params.locale  // undefined!
}

// ✅ ПРАВИЛЬНО — функция async, params awaited
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;     // ← обязательно!
  const sp = await searchParams;       // ← обязательно!
}
```

## pageUrl = маркер, НЕ путь роута

```typescript
// ❌ НЕПРАВИЛЬНО — передаёшь полный путь роута
getApi().Pages.getPageByUrl('shop/category/about', locale)

// ✅ ПРАВИЛЬНО — только маркер из поля pageUrl в OneEntry
getApi().Pages.getPageByUrl('about', locale)
// URL в приложении: /shop/category/about
// pageUrl в OneEntry: "about"
```

## Получение контента страницы

```tsx
import { getApi, isError } from '@/lib/oneentry';
import { notFound } from 'next/navigation';

export default async function MyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Параллельные запросы — быстрее
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

## НЕ хардкодить контент страниц

```tsx
// ❌ НЕПРАВИЛЬНО
return <h1>О компании</h1>

// ✅ ПРАВИЛЬНО — контент из CMS
return <h1>{page.localizeInfos?.title}</h1>
```
