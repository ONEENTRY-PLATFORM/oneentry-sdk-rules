---
name: create-reviews
description: Create reviews section using FormData
---
# Create Reviews Section (FormData)

Arguments: page/product for reviews, whether responses to reviews are needed.

---

## Step 1: Get the form marker and formModuleConfigId

```bash
/inspect-api forms
```

Find the reviews form. The `identifier` field is the form marker.

`formModuleConfigId` is **not** `form.id`, but `form.moduleFormConfigs[0].id`. When the user recreates the form in the admin panel, this id may change. Therefore, in the code:

```ts
const form = await getApi().Forms.getFormByMarker('review_form');
if (isError(form)) return [];

// ⚠️ Discover formModuleConfigId dynamically from the SDK response, do not hardcode
const DEFAULT_MODULE_CONFIG_ID = 2; // ← check your project through /inspect-api forms
const formModuleConfigId = (form as IFormsEntity & { moduleFormConfigs?: Array<{ id?: number }> })
  .moduleFormConfigs?.[0]?.id ?? DEFAULT_MODULE_CONFIG_ID;
```

**⚠️ DO NOT guess the marker.** If unsure — `/inspect-api forms`. See also [`rules/mismatch-log.md`](../../rules/mismatch-log.md) — if the form is not yet in the admin panel, create item C.1 with a field table.

---

## Step 2: Create Server Actions

### app/api/server/forms/getProductReviews.ts (Server Component wrapper)

> This is **NOT a Server Action** (`'use server'`) — it is a regular async function in `app/api/server/...`, called directly from the Server Component. See [`rules/server-actions.md`](../../rules/server-actions.md), section "Server Component wrappers".

```typescript
import { unstable_noStore } from 'next/cache';
import type { IFormsEntity } from 'oneentry/dist/forms/formsInterfaces';
import { getApi, getLang, isError } from '@/lib/oneentry';

const FORM_MARKER = 'review_form';
const DEFAULT_MODULE_CONFIG_ID = 2; // ← check your project through /inspect-api forms
const REVIEWS_LIMIT = 50;

export interface ProductReview {
  id: string;
  author: string;
  date: string;
  rating: number;
  text: string;
}

// ⚠️ unstable_noStore() disables Next.js route cache — fresh reviews will appear without revalidate
// If cache is needed (for example, heavy page, rare reviews) — remove unstable_noStore and use `cache` from react
export async function getProductReviews(productId: number): Promise<ProductReview[]> {
  unstable_noStore();

  try {
    const lang = getLang();

    // 1. Get the form and dynamically read formModuleConfigId
    const form = await getApi().Forms.getFormByMarker(FORM_MARKER);
    const formModuleConfigId = (form as IFormsEntity & { moduleFormConfigs?: Array<{ id?: number }> })
      ?.moduleFormConfigs?.[0]?.id ?? DEFAULT_MODULE_CONFIG_ID;

    // 2. Take only approved reviews — status matches what the submission form sets
    //    (see submitReview below — there status: 'approved')
    const data = await getApi().FormData.getFormsDataByMarker(
      FORM_MARKER,
      formModuleConfigId,
      {
        entityIdentifier: productId,
        userIdentifier: '',
        status: ['approved'],
        dateFrom: '',
        dateTo: '',
      },
      1, // isNested: 1 — parent-child structure
      lang,
      0,
      REVIEWS_LIMIT,
    );

    if (isError(data)) return [];

    const items = (data as unknown as { items?: Array<{
      id: number;
      parentId: number | null;
      userIdentifier?: string;
      time?: string;
      formData?: Array<{ marker: string; value?: unknown }> ;
    }> })?.items ?? [];

    // Only top-level (parentId === null) — UI does not render nested responses
    return items
      .filter(item => item.parentId === null)
      .map<ProductReview>(item => {
        const ratingField = item.formData?.find(f => f.marker === 'review_rating');
        const textField = item.formData?.find(f => f.marker === 'review_text');
        // ⚠️ value for `text` comes as [{ plainValue: '...' }], for primitives — string
        const text = Array.isArray(textField?.value)
          ? String((textField!.value[0] as { plainValue?: unknown })?.plainValue ?? '')
          : String(textField?.value ?? '');
        return {
          id: String(item.id),
          author: item.userIdentifier?.trim() || 'Anonymous',
          date: item.time ? new Date(item.time).toLocaleDateString('en-US') : '',
          rating: typeof ratingField?.value === 'number'
            ? ratingField.value
            : Number(ratingField?.value ?? 0) || 0,
          text,
        };
      })
      .sort((a, b) => Number(b.id) - Number(a.id));
  } catch {
    // Graceful fallback on "Resource is closed" and network errors
    return [];
  }
}
```

### app/actions/reviews.ts (Server Action — for submit)

```typescript
'use server';

import { getApi, isError } from '@/lib/oneentry';

// Submitting a review (top-level)
export async function submitReview(
  formMarker: string,
  formModuleConfigId: number,
  productId: number,
  formData: Array<{ marker: string; type: string; value: string }>,
) {
  const result = await (getApi().FormData as any).postFormsData({
    formIdentifier: formMarker,
    formModuleConfigId,
    moduleEntityIdentifier: String(productId),
    replayTo: null,        // null = top-level review (not a response)
    status: 'approved',
    formData,
  });
  if (isError(result)) return { error: result.message };
  return { success: true };
}

// Response to a review
export async function submitComment(
  formMarker: string,
  formModuleConfigId: number,
  productId: number,
  parentReviewId: number,
  commentMarker: string,  // marker of the text field (from the form schema)
  text: string,
) {
  const result = await (getApi().FormData as any).postFormsData({
    formIdentifier: formMarker,
    formModuleConfigId,
    moduleEntityIdentifier: String(productId),
    replayTo: String(parentReviewId),  // ID of the parent review
    status: 'approved',
    formData: [{ marker: commentMarker, type: 'string', value: text }],
  });
  if (isError(result)) return { error: result.message };
  return { success: true };
}
```

---

## Step 3: Response Data Structure

```typescript
// Separation of parent / child reviews
const parentReviews = data.filter((r: any) => r.parentId === null);

const replyMap: Record<number, any[]> = data.reduce((acc: any, r: any) => {
  if (r.parentId !== null) {
    acc[r.parentId] = [...(acc[r.parentId] || []), r];
  }
  return acc;
}, {});

// Review fields from formData
const rating = review.formData.find((f: any) => f.marker === 'rating')?.value;
// ⚠️ rating is stored as a string: '5', convert using Number(rating)

// Metadata
review.parentId         // null = review, number = response
review.time             // date
review.userIdentifier   // user email
review.entityIdentifier // product ID

// Average rating
const avg = parentReviews.length
  ? parentReviews.reduce((sum: number, r: any) => {
      const val = r.formData.find((f: any) => f.marker === 'rating')?.value;
      return sum + (val ? Number(val) : 0);
    }, 0) / parentReviews.length
  : 0;
```

---

## Step 4: Create Components

### components/ReviewsList.tsx

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getProductReviews } from '@/app/actions/reviews';

interface ReviewsListProps {
  productId: number;
  formMarker: string;
  formModuleConfigId: number;
  ratingMarker?: string;
  locale?: string;
}

export function ReviewsList({
  productId,
  formMarker,
  formModuleConfigId,
  ratingMarker = 'rating',
  locale = 'en_US',
}: ReviewsListProps) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [replyMap, setReplyMap] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProductReviews(formMarker, formModuleConfigId, productId, locale).then((result) => {
      if ('error' in result) { setLoading(false); return; }

      const parents = result.data.filter((r: any) => r.parentId === null);
      const replies = result.data.reduce((acc: any, r: any) => {
        if (r.parentId !== null) {
          acc[r.parentId] = [...(acc[r.parentId] || []), r];
        }
        return acc;
      }, {});

      setReviews(parents);
      setReplyMap(replies);
      setLoading(false);
    });
  }, [productId, locale]);

  if (loading) return <div>Loading reviews...</div>;
  if (!reviews.length) return <div>No reviews yet</div>;

  return (
    <div>
      {reviews.map((review: any) => {
        const rating = review.formData.find((f: any) => f.marker === ratingMarker)?.value;
        const reviewReplies = replyMap[review.id] || [];

        return (
          <div key={review.id}>
            <div>
              <span>{review.userIdentifier}</span>
              {rating && <span>★ {rating}/5</span>}
              <time>{new Date(review.time).toLocaleDateString()}</time>
            </div>

            <div>
              {review.formData
                .filter((f: any) => f.marker !== ratingMarker && f.type !== 'spam')
                .map((f: any) => <p key={f.marker}>{f.value}</p>)
              }
            </div>

            {reviewReplies.length > 0 && (
              <div style={{ marginLeft: '2rem' }}>
                {reviewReplies.map((reply: any) => (
                  <div key={reply.id}>
                    <span>{reply.userIdentifier}</span>
                    {reply.formData.map((f: any) => <p key={f.marker}>{f.value}</p>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

---

## Step 5: Remind Key Rules

```
✅ Reviews created. Key rules:

1. formMarker and formModuleConfigId — from /inspect-api forms or Forms.getAllForms(), DO NOT guess
2. isNested: 1 — mandatory for parent-child structure (reviews + responses)
3. entityIdentifier in body — filter by product
4. replayTo: null → review, replayTo: String(id) → response
   ⚠️ Typo in SDK: the field is called replayTo, not replyTo
5. rating inside the review (FormData) is stored as a string ('5') — convert using Number()
6. parentId === null → review, parentId !== null → response
7. FormData.postFormsData requires Server Action
8. Field markers (rating, text, etc.) — depend on the form schema in OneEntry
9. The final (aggregated) rating of the entity is read from `entity.rating?.value` (top-level), NOT from `attributeValues.rating`.
   See [`rules/attribute-values.md`](../../rules/attribute-values.md) — section "Final Rating".
```

---

## Step 6: Playwright E2E Tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to Components

```tsx
// components/ReviewsList.tsx
if (loading) return <div data-testid="reviews-loading">Loading reviews...</div>;
if (!reviews.length) return <div data-testid="reviews-empty">No reviews yet</div>;

return (
  <div data-testid="reviews-list">
    {reviews.map((review) => (
      <div key={review.id} data-testid="review-item" data-review-id={review.id}>
        <span data-testid="review-author">{review.userIdentifier}</span>
        {rating && <span data-testid="review-rating">★ {rating}/5</span>}
        <div data-testid="review-body">...</div>
        {reviewReplies.length > 0 && (
          <div data-testid="review-replies">...</div>
        )}
      </div>
    ))}
  </div>
);

// components/ReviewForm.tsx (review submission form — dynamically from Forms API)
<form data-testid="review-form" onSubmit={handleSubmit}>
  {fields.map((field) => (
    <input
      data-testid={`review-field-${field.marker}`}
      key={field.marker}
      ...
    />
  ))}
  {error && <div data-testid="review-error" role="alert">{error}</div>}
  {success && <div data-testid="review-success" role="status">{success}</div>}
  <button data-testid="review-submit" type="submit">Send review</button>
</form>
```

### 6.2 Gather Test Parameters and Fill `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **ID of the test product with reviews** — choose it yourself through `/inspect-api`:
   - Get products: `getApi().Products.getProducts({ limit: 5 })`. Take `items[0].id`.
   - Report: "For testing, I am using product `id={productId}` («{title}») — the first in the catalog".
   - Check if it has reviews: `getFormsDataByMarker(formMarker, formModuleConfigId, { entityIdentifier: productId }, 1)`. If `total > 0` — enable the review display test, otherwise — `test.skip` for it.
2. **Path of the product page** — ask: "What is the path of the product page with reviews? (for example `/product/[id]`, `/en_US/shop/product/[id]`)". If silent → find it through Glob (`app/**/product/**/page.tsx`, `app/**/shop/**/product/**`). Substitute `{id}` as a template.
3. **Field markers of the review form** — determine yourself from the already obtained form schema (`/inspect-api forms`):
   - Rating field: the first attribute with a marker including `rating` (or with type=`radioButton` + `listTitles` from 5 elements). Report: "Using `{marker}` as the rating field".
   - Review text field: the first `string`/`text` attribute, not-captcha, not-rating. Report: "Using `{marker}` as the review text field".
4. **Test credentials** — if the form requires authorization (`isVisibleAuth` for the form, check through `/inspect-api forms`):
   - Ask: "The review form requires authorization. Please provide the email/password of the OneEntry test user. I will skip — the review submission test will be `test.skip`".
   - If provided → add `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` to `.env.local` (through Edit/Write).
   - If silent → leave empty, the corresponding test will be `test.skip`.

**Example `.env.local`:**

```bash
E2E_REVIEW_PRODUCT_ID=42
E2E_PRODUCT_PATH=/shop/product/[id]
E2E_REVIEW_RATING_MARKER=rating
E2E_REVIEW_TEXT_MARKER=text
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=
```

### 6.3 Create `e2e/reviews.spec.ts`

> ⚠️ Tests work with the real OneEntry project. The review is submitted with the status `approved` — after the test, it will remain in the database. Use a random suffix in the text to identify test records and clean them manually if necessary.

```typescript
import { test, expect, Page } from '@playwright/test';

const PRODUCT_ID = process.env.E2E_REVIEW_PRODUCT_ID || '';
const PRODUCT_PATH_TEMPLATE = process.env.E2E_PRODUCT_PATH || '/shop/product/[id]';
const RATING_MARKER = process.env.E2E_REVIEW_RATING_MARKER || 'rating';
const TEXT_MARKER = process.env.E2E_REVIEW_TEXT_MARKER || 'text';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '';
const LOGIN_PATH = process.env.E2E_LOGIN_PATH || '/login';

const productPath = PRODUCT_ID ? PRODUCT_PATH_TEMPLATE.replace('[id]', PRODUCT_ID) : '';

async function signIn(page: Page) {
  await page.goto(LOGIN_PATH);
  const fields = page.locator('[data-testid^="auth-field-"]');
  await fields.first().waitFor();
  await fields.nth(0).fill(TEST_EMAIL);
  await fields.nth(1).fill(TEST_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect.poll(
    async () => page.evaluate(() => localStorage.getItem('refresh-token')),
    { timeout: 10_000 },
  ).toBeTruthy();
}

test.describe('Product Reviews', () => {
  test.skip(!PRODUCT_ID, 'E2E_REVIEW_PRODUCT_ID is not set');

  test('the list of reviews renders (or shows empty-state)', async ({ page }) => {
    await page.goto(productPath);
    // Either there is a list, or empty-state — both are valid
    const hasList = await page.getByTestId('reviews-list').isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('reviews-empty').isVisible().catch(() => false);
    expect(hasList || hasEmpty).toBe(true);
  });

  test('if there are reviews — each shows author and body', async ({ page }) => {
    await page.goto(productPath);
    const items = page.getByTestId('review-item');
    const count = await items.count();
    test.skip(count === 0, 'The product has no reviews yet');

    await expect(items.first().getByTestId('review-author')).toBeVisible();
    await expect(items.first().getByTestId('review-body')).toBeVisible();
  });

  test('the review form renders with fields from Forms API', async ({ page }) => {
    await page.goto(productPath);
    const form = page.getByTestId('review-form');
    const formVisible = await form.isVisible().catch(() => false);
    test.skip(!formVisible, 'The review form is not visible (might require authorization)');

    const fields = page.locator('[data-testid^="review-field-"]');
    expect(await fields.count()).toBeGreaterThan(0);
  });

  test.describe('Submitting a review (authorized)', () => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'E2E_TEST_EMAIL/PASSWORD are not set');

    test('validation: empty form — error or submit does not pass', async ({ page }) => {
      await signIn(page);
      await page.goto(productPath);

      const form = page.getByTestId('review-form');
      await form.waitFor({ timeout: 10_000 });
      await page.getByTestId('review-submit').click();

      // Either an error is shown, or success does not appear
      const hasError = await page.getByTestId('review-error').isVisible({ timeout: 3_000 }).catch(() => false);
      const hasSuccess = await page.getByTestId('review-success').isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasSuccess).toBe(false);
      // Either a validation error is shown, or a browser native one — in both cases, success is not present
      expect(hasError || !hasSuccess).toBe(true);
    });

    test('successful submission of a review shows success', async ({ page }) => {
      await signIn(page);
      await page.goto(productPath);

      const form = page.getByTestId('review-form');
      await form.waitFor({ timeout: 10_000 });

      // Rating (radioButton or regular input)
      const ratingField = page.getByTestId(`review-field-${RATING_MARKER}`);
      if (await ratingField.count()) {
        const tag = await ratingField.first().evaluate((el) => el.tagName.toLowerCase());
        if (tag === 'input') await ratingField.first().fill('5');
      }

      // Review text — with random suffix, to identify test records
      const rand = Math.random().toString(36).slice(2, 8);
      await page.getByTestId(`review-field-${TEXT_MARKER}`).fill(`E2E test review ${rand}`);

      await page.getByTestId('review-submit').click();
      await expect(page.getByTestId('review-success')).toBeVisible({ timeout: 15_000 });
    });
  });
});
```

### 6.4 Report to the User on Decisions Made

Before completing the task — explicitly inform:

```
✅ e2e/reviews.spec.ts created
✅ data-testid added to ReviewsList / ReviewForm
✅ .env.local updated (E2E_REVIEW_PRODUCT_ID, E2E_PRODUCT_PATH, E2E_REVIEW_RATING_MARKER, E2E_REVIEW_TEXT_MARKER)

Decisions made automatically:
- Test product: id={PRODUCT_ID} («{title}») — first from getProducts
- Path of the product page: {PRODUCT_PATH_TEMPLATE} — {provided by user / found through Glob in app/**/product/**}
- Rating marker: {RATING_MARKER} — attribute with a marker including "rating", from the review form schema
- Review text marker: {TEXT_MARKER} — first string/text non-captcha attribute of the form
- Test credentials: {provided by user / left empty — the "Submitting a review" block will be test.skip}

⚠️ The submitted test review goes with the status 'approved' and remains in the database. The suffix "E2E test review <rand>" will help find and delete it manually in the admin panel.

Run: npm run test:e2e -- reviews.spec.ts
```
