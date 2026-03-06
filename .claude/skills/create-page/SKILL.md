<!-- META
type: skill
skillConfig: {"name":"create-page"}
-->

# Create a Page with CMS Content

Arguments: page URL (pageUrl marker), locale, whether blocks are needed.

---

## Step 1: Get real data

```bash
/inspect-api pages
```

What to look for:
- `pages[].pageUrl` — real page markers (e.g. `home`, `about`, `contacts`)
- `pages[].localizeInfos` — content fields (title, htmlContent, content)
- Available blocks via `getBlocksByPageUrl(url)`

**⚠️ Do NOT hardcode page content** — always fetch from CMS.

---

## Step 2: Check the page structure in the SDK

```bash
grep -r "interface IPagesEntity" node_modules/oneentry/dist --include="*.d.ts" -A 20
```

Key fields:
- `localizeInfos.title` — page title
- `localizeInfos.htmlContent` — HTML content (check first)
- `localizeInfos.content` — plain text
- `attributeValues` — custom attributes
- `pageUrl` — page marker

---

## Step 3: Create the Server Action

> If `app/actions/pages.ts` already exists — read it and extend, do not duplicate.

```typescript
// app/actions/pages.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';
import type { IPagesEntity } from 'oneentry/dist/pages/pagesInterfaces';
import type { IPositionBlock } from 'oneentry/dist/blocks/blocksInterfaces';

export async function getPageContent(url: string, locale = 'en_US') {
  const result = await getApi().Pages.getPageByUrl(url, locale);
  if (isError(result)) return { error: result.message };
  return { page: result as IPagesEntity };
}

export async function getPageBlocks(url: string, locale = 'en_US') {
  const result = await getApi().Pages.getBlocksByPageUrl(url, locale);
  if (isError(result)) return { blocks: [] as IPositionBlock[] };
  return { blocks: result as IPositionBlock[] };
}
```

---

## Step 4: Create the page

### Basic template (page content only)

```tsx
// app/[locale]/about/page.tsx
import { notFound } from 'next/navigation';
import { getPageContent } from '@/app/actions/pages';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;  // ⚠️ Next.js 15+: await!

  const { page, error } = await getPageContent('about', locale);
  if (error || !page) notFound();

  const title = page.localizeInfos?.title || '';
  const htmlContent = page.localizeInfos?.htmlContent || '';
  const plainContent = page.localizeInfos?.content || '';

  return (
    <main>
      <h1>{title}</h1>

      {/* HTML content — use dangerouslySetInnerHTML */}
      {htmlContent && (
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      )}

      {/* Plain text fallback */}
      {!htmlContent && plainContent && (
        <p>{plainContent}</p>
      )}
    </main>
  );
}
```

### With blocks (page + CMS blocks)

```tsx
// app/[locale]/home/page.tsx
import { notFound } from 'next/navigation';
import { getPageContent, getPageBlocks } from '@/app/actions/pages';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Parallel requests — page content + blocks
  const [pageData, blocksData] = await Promise.all([
    getPageContent('home', locale),
    getPageBlocks('home', locale),
  ]);

  if (pageData.error || !pageData.page) notFound();

  const page = pageData.page;
  const blocks = blocksData.blocks || [];

  return (
    <main>
      <h1>{page.localizeInfos?.title}</h1>

      {/* Blocks — sorted by position */}
      {[...blocks]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((block) => {
          const attrs = (block as any).attributeValues || {};
          const blockTitle = attrs.title?.value || (block as any).localizeInfos?.title || '';
          const blockContent = attrs.description?.value?.htmlValue || '';

          return (
            <section key={(block as any).id || blockTitle}>
              {blockTitle && <h2>{blockTitle}</h2>}
              {blockContent && (
                <div dangerouslySetInnerHTML={{ __html: blockContent }} />
              )}
            </section>
          );
        })}
    </main>
  );
}
```

### With custom attributes

```tsx
// If page has custom attributeValues — use /inspect-api to get real markers!
const attrs = page.attributeValues || {};

// image type — value is an ARRAY
const heroImage = attrs.hero_image?.value?.[0]?.downloadLink || '';

// text type — value is an object
const description = attrs.description?.value?.htmlValue || '';

// string type — primitive value
const subtitle = attrs.subtitle?.value || '';
```

---

## Step 5: Reminder — key rules

✅ Page created. Key rules:

```md
1. params in Next.js 15+ is a Promise — await required
2. pageUrl is the CMS marker (e.g. "home"), NOT the route path ("/")
3. localizeInfos.htmlContent — check first, use dangerouslySetInnerHTML
4. Promise.all for parallel requests (page + blocks)
5. notFound() on error — don't render an empty page
6. Blocks sorted by position
7. attributeValues — check type via /inspect-api before accessing value
8. NEVER hardcode page content — always fetch from CMS Pages
```
