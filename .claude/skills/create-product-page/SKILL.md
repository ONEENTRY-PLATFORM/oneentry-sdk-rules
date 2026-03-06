<!-- META
type: skill
skillConfig: {"name":"create-product-page"}
-->

# Create a Product Page

---

## Step 1: Check real attributes via API

```bash
/inspect-api products
```

What to look for in `items[0].attributeValues`:
- Image marker (type `image`) — e.g. `pic`, `photo`
- Description marker (type `text`) — e.g. `description`
- Price marker (type `float`/`integer`) — e.g. `price`
- Old price marker — e.g. `sale`, `old_price`
- Stock quantity marker — e.g. `units_product`, `stock`
- `statusIdentifier` — real "in stock" status

**⚠️ Do NOT guess markers** — verify via `/inspect-api`.

---

## Step 2: Clarify with the user

1. **Page route** — e.g. `app/[locale]/shop/product/[id]/page.tsx`
2. **Are related products needed?** (`getRelatedProductsById`)
3. **Image gallery or single image?**
4. **Is there existing markup?** — if yes, copy it exactly

---

## Step 3: Create Server Action (if not yet created)

> If `app/actions/products.ts` already exists — read it and extend, do not duplicate.

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

## Step 4: Create the product page

### Basic template

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

  // ⚠️ Replace markers with real ones from /inspect-api!
  // image type — value is an ARRAY
  const imageUrl = attrs.pic?.value?.[0]?.downloadLink || '';
  const title = product.localizeInfos?.title || '';
  const price = attrs.price?.value || 0;
  const oldPrice = attrs.sale?.value || 0;

  // text type — value is an object with htmlValue/plainValue
  const description = attrs.description?.value?.htmlValue
    || attrs.description?.value?.plainValue
    || '';

  // Status: replace 'in_stock' with real value from /inspect-api
  const inStock = product.statusIdentifier === 'in_stock';
  const stockQty = Number(attrs.units_product?.value) || 0;
  const isOutOfStock = !inStock || stockQty === 0;

  return (
    <main>
      <div>
        {/* Image */}
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

        {/* Info */}
        <div>
          <h1>{title}</h1>

          <div>
            <span>{price}</span>
            {oldPrice > 0 && <span className="line-through">{oldPrice}</span>}
          </div>

          {/* Description */}
          {description && (
            <div dangerouslySetInnerHTML={{ __html: description }} />
          )}

          {/* Button */}
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

### With parallel requests (product + related)

```tsx
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const productId = Number(id);

  // Parallel — product and related
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
      {/* ... main content ... */}

      {/* Related products */}
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

### With image gallery (groupOfImages)

```tsx
// groupOfImages — value is an array of multiple images
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

## Step 5: Reminder — key rules

✅ Page created. Key rules:

```md
1. params in Next.js 15+ is a Promise — await required
2. image → value[0].downloadLink (ARRAY, even for a single image!)
3. text → value.htmlValue or value.plainValue (object, not string)
4. statusIdentifier — verify via /inspect-api, don't hardcode 'in_stock'
5. Promise.all for parallel requests (product + related + blocks)
6. notFound() on error — don't render an empty page
7. next/image requires remotePatterns in next.config.ts for *.oneentry.cloud
```
