<!-- META
type: skill
skillConfig: {"name":"create-page"}
-->

# Create Next.js page with content from OneEntry CMS

Argument: `pageMarker` (page marker in OneEntry, e.g. `about` or `home`)

---

## Step 1: Determine the page marker

If the argument is not provided — ask the user:
- "What is the `pageUrl` of the page in OneEntry? (Can be found via `/inspect-api pages`)"

**⚠️ IMPORTANT:** `pageUrl` is a marker (a single word, e.g. `"about"`), NOT a full path (`"shop/about"`).

---

## Step 2: Verify the marker via /inspect-api (if needed)

If the marker is unknown or the user is unsure:

```bash
# Read .env.local and check real pageUrl values
cat .env.local
curl -s "https://<URL>/api/content/pages?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Look at the `pageUrl` field in the response — this is the marker for `getPageByUrl()`.

---

## Step 3: Determine the page file path

Ask the user (or determine from context):
- Next.js route for the page, e.g.: `app/[locale]/about/page.tsx`
- Is there i18n (`[locale]` in the path)?
- Are page blocks needed (`getBlocksByPageUrl`)?

---

## Step 4: Create the page file

### Basic template (page content only)

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

### With page blocks

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
            // For images: attrs.image?.value?.[0]?.downloadLink (ARRAY!)
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

## Step 5: Key rules reminder

After creating the file output:

> Localization rules (locale from params, localizeInfos, langCode): `.claude/rules/localization.md`

✅ File created. Key rules:

```md
1. pageUrl = marker ("about"), NOT a route path ("/[locale]/about")
2. params in Next.js 15+ is a Promise — always await
3. localizeInfos.htmlContent — HTML content, localizeInfos.title — heading
4. For images: attrs.img?.value?.[0]?.downloadLink (value is an ARRAY!)
5. Sort blocks by position before rendering
6. Block attribute markers — find via /inspect-api
```
