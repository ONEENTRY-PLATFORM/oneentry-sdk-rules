---
name: create-page
description: Create Next.js page with content from OneEntry CMS
---
# Create Next.js page with content from OneEntry CMS

Argument: `pageMarker` (page marker in OneEntry, for example `about` or `home`)

---

## Step 1: Define the page marker

If the argument is not provided — ask the user:
- "What is the `pageUrl` of the page in OneEntry? (You can find out via `/inspect-api pages`)"

**⚠️ IMPORTANT:** `pageUrl` is the marker (one word, for example `"about"`), NOT the full path (`"shop/about"`).

---

## Step 2: Check the marker via /inspect-api (if needed)

If the marker is unknown or the user is unsure:

Run `/inspect-api pages` — the skill uses the SDK and will return a list of `pageUrl` markers.

---

## Step 3: Determine the path to the page file

Ask the user (or determine from context):
- The route of the page in Next.js, for example: `app/[locale]/about/page.tsx`
- Is there multilingual support (`[locale]` in the path)?
- Are page blocks needed (`getBlocksByPageUrl`)?

---

## Step 4: Create the page file

### Basic template (only page content)

```tsx
// app/[locale]/about/page.tsx
import { getApi, isError } from '@/lib/oneentry';
import { notFound } from 'next/navigation';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }> ;
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
  params: Promise<{ locale: string }> ;
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

## Step 5: Remind key rules

After creating the file, output:

> Localization rules (locale from params, localizeInfos, langCode): `.claude/rules/localization.md`

✅ File created. Key rules:

```md
1. pageUrl = marker ("about"), NOT route path ("/[locale]/about")
2. params in Next.js 15+ — is a Promise, always await
3. localizeInfos.htmlContent — HTML content, localizeInfos.title — title
4. Blocks/Pages: image → value ARRAY → attrs.bg?.value?.[0]?.downloadLink
5. Sort blocks by position before rendering
6. Attribute markers of blocks — find out via /inspect-api
```

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to the page component

For selector stability — add `data-testid` when generating `page.tsx`:

```tsx
return (
  <main data-testid="cms-page">
    <h1 data-testid="cms-page-title">{page.localizeInfos?.title}</h1>

    {/* Page content (htmlContent) */}
    <div
      data-testid="cms-page-content"
      dangerouslySetInnerHTML={{
        __html: page.localizeInfos?.htmlContent || page.localizeInfos?.content || '',
      }}
    />

    {/* Blocks — if any */}
    {!isError(blocks) && Array.isArray(blocks) &&
      blocks
        .sort((a: any, b: any) => a.position - b.position)
        .map((block: any) => (
          <section
            key={block.id}
            data-testid="cms-block"
            data-block-id={block.id}
          >
            {/* render block */}
          </section>
        ))
    }
  </main>
);
```

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (perform step by step, do not ask in one list):**

1. **Path of the page in Next.js** — taken from the route of the created file (`app/[locale]/about/page.tsx` → `/about` or `/{locale}/about`). Claude knows the path itself — do not ask. Inform: "The test will go to `{path}`".
2. **`pageUrl` marker** — already known from the skill argument (example: `about`, `home`). Use as is. If locale is required — take the first one from `/inspect-api` (usually `en_US`).
3. **Expected content** — check yourself via `/inspect-api pages`:
   - `page.localizeInfos.title` — should not be empty, check length > 0.
   - If the page has blocks — count them via `getBlocksByPageUrl(pageUrl)`. Inform: "Found `{N}` blocks for page `{marker}` — the test will check their rendering".
4. **Non-existent pageUrl** for the 404 test — generate a random one: `random-${Math.random().toString(36).slice(2,10)}`. This marker definitely does not exist, the test will check `notFound()`.
5. **Fill in `.env.local`** (yourself, via Edit):

```bash
E2E_CMS_PATH=/about              # Next.js route path
E2E_CMS_PAGE_URL=about           # pageUrl marker in OneEntry
E2E_CMS_EXPECT_BLOCKS=3          # expected number of blocks (0 if no blocks)
```

If any value could not be determined — leave it empty, the corresponding test will be `test.skip`.

### 6.3 Create `e2e/page.spec.ts`

> ⚠️ Tests check the actual rendering of the pageUrl marker. Replace `/about` and `about` with real values (via env).

```typescript
import { test, expect } from '@playwright/test';

const CMS_PATH = process.env.E2E_CMS_PATH || '/about';
const EXPECT_BLOCKS = Number(process.env.E2E_CMS_EXPECT_BLOCKS ?? '0');

test.describe('CMS page (OneEntry Pages)', () => {
  test('renders page with title from localizeInfos', async ({ page }) => {
    await page.goto(CMS_PATH);
    await expect(page.getByTestId('cms-page')).toBeVisible();
    const title = page.getByTestId('cms-page-title');
    await expect(title).toBeVisible();
    await expect(title).not.toBeEmpty();
  });

  test('renders htmlContent from localizeInfos', async ({ page }) => {
    await page.goto(CMS_PATH);
    // Content may be an empty string — check at least for the presence of the container
    await expect(page.getByTestId('cms-page-content')).toBeAttached();
  });

  test('renders page blocks (if they exist)', async ({ page }) => {
    test.skip(EXPECT_BLOCKS === 0, 'The page has no blocks — test skipped');

    await page.goto(CMS_PATH);
    const blocks = page.getByTestId('cms-block');
    await expect(blocks.first()).toBeVisible({ timeout: 10_000 });
    expect(await blocks.count()).toBeGreaterThanOrEqual(EXPECT_BLOCKS);
  });

  test('non-existent pageUrl → 404', async ({ page }) => {
    // Non-existent path of the same template (replace the last segment with garbage)
    const nonexistent = CMS_PATH.replace(/\/[^/]*$/, `/nonexistent-${Math.random().toString(36).slice(2, 10)}`);
    const response = await page.goto(nonexistent);
    expect(response?.status()).toBe(404);
  });
});
```

### 6.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/page.spec.ts created
✅ data-testid added to page.tsx (cms-page, cms-page-title, cms-page-content, cms-block)
✅ .env.local updated (E2E_CMS_PATH, E2E_CMS_PAGE_URL, E2E_CMS_EXPECT_BLOCKS)

Decisions made automatically:
- Page path: {CMS_PATH} — from the route of the created Next.js file
- pageUrl marker: {marker} — from the skill argument
- Expected number of blocks: {N} — from /inspect-api getBlocksByPageUrl. {If 0 → block test skipped}
- 404 test: random non-existent path, generated at runtime

Run: npm run test:e2e -- page.spec.ts
```
