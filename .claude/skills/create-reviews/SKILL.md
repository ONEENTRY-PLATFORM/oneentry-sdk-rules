<!-- META
type: skill
skillConfig: {"name":"create-reviews"}
-->

# Create reviews section (FormData)

Arguments: page/product for reviews, whether replies to reviews are needed.

---

## Step 1: Get form marker and formModuleConfigId

```bash
/inspect-api forms
```

Find the reviews form. The `identifier` field is the form marker, `id` is the `formModuleConfigId`.

Or via API:

```typescript
const forms = await getApi().Forms.getAllForms();
// forms[].identifier — marker, forms[].id — formModuleConfigId
```

**⚠️ DON'T guess the marker and ID.** Ask the user if you don't have bash access.

---

## Step 2: Create Server Actions

### app/actions/reviews.ts

```typescript
'use server';

import { getApi, isError } from '@/lib/oneentry';

// Read product reviews
// isNested: 1 → returns parent-child structure (reviews + replies)
// entityIdentifier → filter by product ID
export async function getProductReviews(
  formMarker: string,
  formModuleConfigId: number,
  productId: number,
  locale = 'en_US',
) {
  const result = await getApi().FormData.getFormsDataByMarker(
    formMarker,
    formModuleConfigId,
    { entityIdentifier: productId, status: ['approved'] },
    1,        // isNested: 1 — parent-child structure
    locale,
    0,
    500,
  );
  if (isError(result)) return { error: result.message };
  return { data: (result as any).data || [], total: (result as any).total || 0 };
}

// Submit review (top-level)
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
    replayTo: null,        // null = top-level review (not a reply)
    status: 'approved',
    formData,
  });
  if (isError(result)) return { error: result.message };
  return { success: true };
}

// Reply to a review
export async function submitComment(
  formMarker: string,
  formModuleConfigId: number,
  productId: number,
  parentReviewId: number,
  commentMarker: string,  // text field marker (from form schema)
  text: string,
) {
  const result = await (getApi().FormData as any).postFormsData({
    formIdentifier: formMarker,
    formModuleConfigId,
    moduleEntityIdentifier: String(productId),
    replayTo: String(parentReviewId),  // parent review ID
    status: 'approved',
    formData: [{ marker: commentMarker, type: 'string', value: text }],
  });
  if (isError(result)) return { error: result.message };
  return { success: true };
}
```

---

## Step 3: Response data structure

```typescript
// Separating parent / child reviews
const parentReviews = data.filter((r: any) => r.parentId === null);

const replyMap: Record<number, any[]> = data.reduce((acc: any, r: any) => {
  if (r.parentId !== null) {
    acc[r.parentId] = [...(acc[r.parentId] || []), r];
  }
  return acc;
}, {});

// Review fields from formData
const rating = review.formData.find((f: any) => f.marker === 'rating')?.value;
// ⚠️ rating is stored as string: '5', convert via Number(rating)

// Metadata
review.parentId         // null = review, number = reply
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

## Step 4: Create components

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

## Step 5: Key rules reminder

```
✅ Reviews created. Key rules:

1. formMarker and formModuleConfigId — from /inspect-api forms or Forms.getAllForms(), DON'T guess
2. isNested: 1 — required for parent-child structure (reviews + replies)
3. entityIdentifier in body — filter by product
4. replayTo: null → review, replayTo: String(id) → reply
   ⚠️ SDK typo: field is called replayTo, not replyTo
5. rating is stored as string ('5'), convert via Number()
6. parentId === null → review, parentId !== null → reply
7. FormData.postFormsData requires Server Action
8. Field markers (rating, text, etc.) — depend on the form schema in OneEntry
```
