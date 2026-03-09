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

`langCode` is set during the initialization `defineOneEntry(url, { langCode })` and is used by default.
Pass `locale` explicitly only in the multilingual route `app/[locale]/`.

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
