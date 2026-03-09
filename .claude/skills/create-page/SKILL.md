<!-- META
type: skill
skillConfig: {"name":"create-page"}
-->

# Create a Next.js Page with Content from OneEntry CMS

Argument: `pageMarker` (page marker in OneEntry, e.g., `about` or `home`)

---

## Step 1: Determine the Page Marker

If the argument is not provided, ask the user:
- "What is the `pageUrl` of the page in OneEntry? (You can find out via `/inspect-api pages`)"

**⚠️ IMPORTANT:** `pageUrl` is the marker (one word, e.g., `"about"`), NOT the full path (`"shop/about"`).

---

## Step 2: Check the Marker via /inspect-api (if needed)

If the marker is unknown or the user is unsure:

```bash
# Read .env.local and check the real pageUrls
cat .env.local
curl -s "https://<URL>/api/content/pages?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Look at the `pageUrl` field in the response — this is the marker for `getPageByUrl()`.

---

## Step 3: Determine the Path to the Page File

Ask the user (or determine from context):
- The route of the page in Next.js, e.g., `app/[locale]/about/page.tsx`
- Is there multilingual support (`[locale]` in the path)?
- Are page blocks needed (`getBlocksByPageUrl`)?

---

## Step 4: Create the Page File

### Basic Template (only page content)

```tsx
// app/[locale]/about/page.tsx
import { getApi, isError } from '@/lib/oneentry';
import { notFound } from 'next/navigation';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;  // ⚠️ Next.js 15+: params is a Promise!

  const page = await getApi().Pages.getPageByUrl('about', locale);
  if (isError(page)) notFound();

  return (
    <main>
      <h1>{page.localizeInfos?.title}</h1>
      <div
        dangerouslySetInnerHTML={{
          __html: page.localizeInfos?.htmlContent || page.localizeInfos?.content || '',
        }}
      />
    </main>
  );
}
```

### With Page Blocks

```tsx
// app/[locale]/home/page.tsx
import { getApi, isError } from '@/lib/oneentry';
import { notFound } from 'next/navigation';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Parallel requests for performance
  const [page, blocks] = await Promise.all([
    getApi().Pages.getPageByUrl('home', locale),
    getApi().Pages.getBlocksByPageUrl('home'),
  ]);

  if (isError(page)) notFound();

  return (
    <main>
      <h1>{page.localizeInfos?.title}</h1>

      {!isError(blocks) && Array.isArray(blocks) &&
        blocks
          .sort((a: any, b: any) => a.position - b.position)
          .map((block: any) => {
            const attrs = block.attributeValues || {};
            // Access by marker (if known): attrs.title?.value
            // For images in blocks: attrs.bg?.value?.[0]?.downloadLink (Blocks/Pages — ARRAY)
            // For text: attrs.description?.value?.htmlValue
            return (
              <section key={block.id}>
                {/* render block */}
              </section>
            );
          })
      }
    </main>
  );
}
```

---

## Step 5: Remind Key Rules

After creating the file, output:

> Localization rules (locale from params, localizeInfos, langCode): `.claude/rules/localization.md`

✅ File created. Key rules:

```md
1. pageUrl = marker ("about"), NOT the route path ("/[locale]/about")
2. params in Next.js 15+ — is a Promise, always await
3. localizeInfos.htmlContent — HTML content, localizeInfos.title — title
4. Blocks/Pages: image → value ARRAY → attrs.bg?.value?.[0]?.downloadLink
5. Sort blocks by position before rendering
6. Attribute markers of blocks — find out via /inspect-api
```
