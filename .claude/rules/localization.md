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
// ✅ params is a Promise, always await it
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
// ❌ WRONG
getApi().Pages.getPageByUrl('home', 'en_US')

// ✅ CORRECT — from params
const { locale } = await params
getApi().Pages.getPageByUrl('home', locale)
```

## langCode is an optional parameter

`langCode` is set during `defineOneEntry(url, { langCode })` initialization and used as the default.
Pass `locale` explicitly only in multilingual routes `app/[locale]/`.

```typescript
// Single-language project — no need to pass langCode explicitly
getApi().Pages.getPageByUrl('home')

// Multilingual — pass locale from params
getApi().Pages.getPageByUrl('home', locale)
```

## locale in Client Component

```typescript
// ✅ Client Component — useParams(), NOT await params
'use client'
import { useParams } from 'next/navigation'

const params = useParams()
const locale = params.locale as string || 'en_US'
```

## localizeInfos — content structure

```typescript
page.localizeInfos?.title        // title
page.localizeInfos?.htmlContent  // HTML content (for dangerouslySetInnerHTML)
page.localizeInfos?.content      // plain text

// Blocks: localizeInfos as fallback when no attributes
const title = attrs.title?.value || block.localizeInfos?.title || ''
```
