<!-- META
type: rules
fileName: localization.md
rulePaths: ["app/**/page.tsx","app/**/layout.tsx","app/actions/**/*.ts"]
paths:
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
  - "app/actions/**/*.ts"
-->

# Локализация — правила OneEntry

## locale из params (Next.js 15+)

```typescript
// ✅ params — это Promise, обязательно await
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const page = await getApi().Pages.getPageByUrl('home', locale)
}
```

## Не хардкодить locale

```typescript
// ❌ НЕПРАВИЛЬНО
getApi().Pages.getPageByUrl('home', 'en_US')

// ✅ ПРАВИЛЬНО — из params
const { locale } = await params
getApi().Pages.getPageByUrl('home', locale)
```

## langCode — необязательный параметр

`langCode` задаётся при инициализации `defineOneEntry(url, { langCode })` и используется по умолчанию.
Передавай `locale` явно только в мультиязычном роуте `app/[locale]/`.

```typescript
// Однояызычный проект — langCode не нужен явно
getApi().Pages.getPageByUrl('home')

// Мультиязычный — передавай locale из params
getApi().Pages.getPageByUrl('home', locale)
```

## locale в Client Component

```typescript
// ✅ Client Component — useParams(), НЕ await params
'use client'
import { useParams } from 'next/navigation'

const params = useParams()
const locale = params.locale as string || 'en_US'
```

## localizeInfos — структура контента

```typescript
page.localizeInfos?.title        // заголовок
page.localizeInfos?.htmlContent  // HTML-контент (для dangerouslySetInnerHTML)
page.localizeInfos?.content      // plain text

// Блоки: localizeInfos как fallback если нет атрибутов
const title = attrs.title?.value || block.localizeInfos?.title || ''
```
