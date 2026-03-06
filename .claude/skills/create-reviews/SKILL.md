<!-- META
type: skill
skillConfig: {"name":"create-reviews"}
-->

# Создать раздел отзывов (FormData)

Аргументы: страница/товар для отзывов, нужны ли ответы на отзывы.

---

## Шаг 1: Получи маркер формы и formModuleConfigId

```bash
/inspect-api forms
```

Найди форму отзывов. Поле `identifier` — маркер формы, `id` — `formModuleConfigId`.

Или через API:

```typescript
const forms = await getApi().Forms.getAllForms();
// forms[].identifier — маркер, forms[].id — formModuleConfigId
```

**⚠️ НЕ угадывай маркер и ID.** Спроси у пользователя если нет доступа к bash.

---

## Шаг 2: Создай Server Actions

### app/actions/reviews.ts

```typescript
'use server';

import { getApi, isError } from '@/lib/oneentry';

// Чтение отзывов товара
// isNested: 1 → возвращает parent-child структуру (отзывы + ответы)
// entityIdentifier → фильтр по ID товара
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
    1,        // isNested: 1 — parent-child структура
    locale,
    0,
    500,
  );
  if (isError(result)) return { error: result.message };
  return { data: (result as any).data || [], total: (result as any).total || 0 };
}

// Отправка отзыва (top-level)
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
    replayTo: null,        // null = top-level отзыв (не ответ)
    status: 'approved',
    formData,
  });
  if (isError(result)) return { error: result.message };
  return { success: true };
}

// Ответ на отзыв
export async function submitComment(
  formMarker: string,
  formModuleConfigId: number,
  productId: number,
  parentReviewId: number,
  commentMarker: string,  // маркер текстового поля (из схемы формы)
  text: string,
) {
  const result = await (getApi().FormData as any).postFormsData({
    formIdentifier: formMarker,
    formModuleConfigId,
    moduleEntityIdentifier: String(productId),
    replayTo: String(parentReviewId),  // ID родительского отзыва
    status: 'approved',
    formData: [{ marker: commentMarker, type: 'string', value: text }],
  });
  if (isError(result)) return { error: result.message };
  return { success: true };
}
```

---

## Шаг 3: Структура данных ответа

```typescript
// Разделение parent / child reviews
const parentReviews = data.filter((r: any) => r.parentId === null);

const replyMap: Record<number, any[]> = data.reduce((acc: any, r: any) => {
  if (r.parentId !== null) {
    acc[r.parentId] = [...(acc[r.parentId] || []), r];
  }
  return acc;
}, {});

// Поля отзыва из formData
const rating = review.formData.find((f: any) => f.marker === 'rating')?.value;
// ⚠️ rating хранится как строка: '5', конвертируй через Number(rating)

// Метаданные
review.parentId         // null = отзыв, number = ответ
review.time             // дата
review.userIdentifier   // email пользователя
review.entityIdentifier // ID товара

// Средний рейтинг
const avg = parentReviews.length
  ? parentReviews.reduce((sum: number, r: any) => {
      const val = r.formData.find((f: any) => f.marker === 'rating')?.value;
      return sum + (val ? Number(val) : 0);
    }, 0) / parentReviews.length
  : 0;
```

---

## Шаг 4: Создай компоненты

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

## Шаг 5: Напомни ключевые правила

```
✅ Отзывы созданы. Ключевые правила:

1. formMarker и formModuleConfigId — из /inspect-api forms или Forms.getAllForms(), НЕ угадывать
2. isNested: 1 — обязательно для parent-child структуры (отзывы + ответы)
3. entityIdentifier в body — фильтр по товару
4. replayTo: null → отзыв, replayTo: String(id) → ответ
   ⚠️ Опечатка в SDK: поле называется replayTo, не replyTo
5. rating хранится как строка ('5'), конвертируй через Number()
6. parentId === null → отзыв, parentId !== null → ответ
7. FormData.postFormsData требует Server Action
8. Маркеры полей (rating, text и т.д.) — зависят от схемы формы в OneEntry
```
