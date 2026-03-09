<!-- META
type: skill
skillConfig: {"name":"create-reviews"}
-->

# Create a Review Section (FormData)

Arguments: page/product for reviews, whether responses to reviews are needed.

---

## Step 1: Get the form marker and formModuleConfigId

```bash
/inspect-api forms
```

Find the review form. The `identifier` field is the form marker, `id` is the `formModuleConfigId`.

Or via API:

```typescript
const forms = await getApi().Forms.getAllForms();
// forms[].identifier — marker, forms[].id — formModuleConfigId
```

**⚠️ DO NOT guess the marker and ID.** Ask the user if there is no access to bash.

---

## Step 2: Create Server Actions

### app/actions/reviews.ts

```typescript
'use server';

import { getApi, isError } from '@/lib/oneentry';

// Reading product reviews
// isNested: 1 → returns parent-child structure (reviews + responses)
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

// Responding to a review
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
// Splitting parent / child reviews
const parentReviews = data.filter((r: any) => r.parentId === null);

const replyMap: Record<number, any[]> = data.reduce((acc: any, r: any) => {
  if (r.parentId !== null) {
    acc[r.parentId] = [...(acc[r.parentId] || []), r];
  }
  return acc;
}, {});

// Review fields from formData
const rating = review.formData.find((f: any) => f.marker === 'rating')?.value;
// ⚠️ rating is stored as a string: '5', convert it using Number(rating)

// Metadata
review.parentId         // null = review, number = response
review.time             // date
review.userIdentifier   // user's email
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

## Step 5: Remember Key Rules

```
✅ Reviews created. Key rules:

1. formMarker and formModuleConfigId — from /inspect-api forms or Forms.getAllForms(), DO NOT guess
2. isNested: 1 — mandatory for parent-child structure (reviews + responses)
3. entityIdentifier in body — filter by product
4. replayTo: null → review, replayTo: String(id) → response
   ⚠️ Typo in SDK: the field is called replayTo, not replyTo
5. rating is stored as a string ('5'), convert it using Number()
6. parentId === null → review, parentId !== null → response
7. FormData.postFormsData requires Server Action
8. Field markers (rating, text, etc.) — depend on the form schema in OneEntry
```
