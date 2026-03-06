<!-- META
type: skill
skillConfig: {"name":"create-product-page"}
-->

# Создать страницу товара

---

## Шаг 1: Проверь реальные атрибуты через API

```bash
/inspect-api products
```

Что смотреть в `items[0].attributeValues`:
- Маркер изображения (тип `image`) — например `pic`, `photo`
- Маркер описания (тип `text`) — например `description`
- Маркер цены (тип `float`/`integer`) — например `price`
- Маркер старой цены — например `sale`, `old_price`
- Маркер количества на складе — например `units_product`, `stock`
- `statusIdentifier` — реальный статус "в наличии"

**⚠️ НЕ угадывай маркеры** — проверяй через `/inspect-api`.

---

## Шаг 2: Уточни у пользователя

1. **Роут страницы** — например `app/[locale]/shop/product/[id]/page.tsx`
2. **Нужны ли похожие товары?** (`getRelatedProductsById`)
3. **Нужна ли галерея изображений или одно изображение?**
4. **Есть ли верстка?** — если да, копируй точно

---

## Шаг 3: Создай Server Action (если ещё нет)

> Если `app/actions/products.ts` уже существует — прочитай его и дополни, не дублируй.

```typescript
// app/actions/products.ts
'use server';

import { getApi, isError } from '@/lib/oneentry';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';

export async function getProductById(id: number, locale = 'en_US') {
  const result = await getApi().Products.getProductById(id, locale);
  if (isError(result)) return { error: result.message };
  return { item: result as IProductsEntity };
}

export async function getRelatedProducts(id: number, locale = 'en_US', limit = 6) {
  const result = await getApi().Products.getRelatedProductsById(id, locale, {
    offset: 0,
    limit,
    sortOrder: 'ASC',
    sortKey: 'position',
  });
  if (isError(result)) return { items: [] as IProductsEntity[], total: 0 };
  return { items: result.items as IProductsEntity[], total: result.total as number };
}
```

---

## Шаг 4: Создай страницу товара

### Базовый шаблон

```tsx
// app/[locale]/shop/product/[id]/page.tsx
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getProductById } from '@/app/actions/products';

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;  // ⚠️ Next.js 15+: await!
  const productId = Number(id);

  const productData = await getProductById(productId, locale);
  if ('error' in productData || !productData.item) notFound();

  const product = productData.item;
  const attrs = product.attributeValues || {};

  // ⚠️ Замени маркеры на реальные из /inspect-api!
  // image тип — value это МАССИВ
  const imageUrl = attrs.pic?.value?.[0]?.downloadLink || '';
  const title = product.localizeInfos?.title || '';
  const price = attrs.price?.value || 0;
  const oldPrice = attrs.sale?.value || 0;

  // text тип — value это объект с htmlValue/plainValue
  const description = attrs.description?.value?.htmlValue
    || attrs.description?.value?.plainValue
    || '';

  // Статус: замени 'in_stock' на реальный из /inspect-api
  const inStock = product.statusIdentifier === 'in_stock';
  const stockQty = Number(attrs.units_product?.value) || 0;
  const isOutOfStock = !inStock || stockQty === 0;

  return (
    <main>
      <div>
        {/* Изображение */}
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            width={400}
            height={400}
            priority
            className="object-cover"
          />
        ) : (
          <div>No image</div>
        )}

        {/* Информация */}
        <div>
          <h1>{title}</h1>

          <div>
            <span>{price}</span>
            {oldPrice > 0 && <span className="line-through">{oldPrice}</span>}
          </div>

          {/* Описание */}
          {description && (
            <div dangerouslySetInnerHTML={{ __html: description }} />
          )}

          {/* Кнопка */}
          {isOutOfStock
            ? <div>Out of stock</div>
            : <button type="button">Add to cart</button>
          }
        </div>
      </div>
    </main>
  );
}
```

### С параллельными запросами (товар + похожие)

```tsx
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const productId = Number(id);

  // Параллельно — товар и похожие
  const [productData, relatedData] = await Promise.all([
    getProductById(productId, locale),
    getRelatedProducts(productId, locale),
  ]);

  if ('error' in productData || !productData.item) notFound();

  const product = productData.item;
  const relatedProducts = relatedData.items;

  const attrs = product.attributeValues || {};
  const imageUrl = attrs.pic?.value?.[0]?.downloadLink || '';
  const title = product.localizeInfos?.title || '';
  const price = attrs.price?.value || 0;
  const description = attrs.description?.value?.htmlValue || '';

  return (
    <main>
      {/* ... основной контент ... */}

      {/* Похожие товары */}
      {relatedProducts.length > 0 && (
        <section>
          <h2>Related products</h2>
          <div className="grid grid-cols-4 gap-4">
            {relatedProducts.map((p) => {
              const a = p.attributeValues || {};
              const img = a.pic?.value?.[0]?.downloadLink || '';
              return (
                <div key={p.id}>
                  {img && <Image src={img} alt={p.localizeInfos?.title || ''} width={200} height={200} />}
                  <p>{p.localizeInfos?.title}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
```

### С галереей изображений (groupOfImages)

```tsx
// groupOfImages — value это массив нескольких изображений
const gallery = attrs.gallery?.value || [];

{gallery.length > 0 && (
  <div className="flex gap-2">
    {gallery.map((img: any, i: number) => (
      <Image
        key={i}
        src={img.downloadLink}
        alt={`${title} - ${i + 1}`}
        width={100}
        height={100}
        className="object-cover"
      />
    ))}
  </div>
)}
```

---

## Шаг 5: Напомни ключевые правила

✅ Страница создана. Ключевые правила:

```md
1. params в Next.js 15+ — это Promise, обязателен await
2. image → value[0].downloadLink (МАССИВ, даже для одного изображения!)
3. text → value.htmlValue или value.plainValue (объект, не строка)
4. statusIdentifier — проверяй через /inspect-api, не хардкодь 'in_stock'
5. Promise.all для параллельных запросов (товар + похожие + блоки)
6. notFound() при ошибке — не рендерить пустую страницу
7. next/image требует remotePatterns в next.config.ts для *.oneentry.cloud
```
