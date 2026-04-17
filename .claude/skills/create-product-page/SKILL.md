---
name: create-product-page
description: Create product page
---
# Create Product Page

---

## Step 1: Check real attributes via API

```bash
/inspect-api products
```

What to look for in `items[0].attributeValues`:
- Image marker (type `image`) — for example `pic`, `photo`
- Description marker (type `text`) — for example `description`
- Price marker (type `float`/`integer`) — for example `price`
- Old price marker — for example `sale`, `old_price`
- Stock quantity marker — for example `units_product`, `stock`
- `statusIdentifier` — actual status "in stock"

**⚠️ DO NOT guess markers** — check via `/inspect-api`.

---

## Step 2: Clarify with the user

1. **Page route** — for example `app/[locale]/shop/product/[id]/page.tsx`
2. **Are similar products needed?** (`getRelatedProductsById`)
3. **Is an image gallery or a single image needed?**
4. **Is there a layout?** — if yes, copy exactly

> **🛒 The "Add to Cart" button is ALWAYS added by default.**
> Do not ask the user "is the button needed?". If the user **explicitly** said "without a button" — add it.
> If the cart is not yet implemented — first run `/create-cart-manager`.
> The "Add to Favorites" button is added **only upon request** from the user (→ `/create-favorites`).

---

## Step 3: Create Server Action (if not already)

> If `app/actions/products.ts` already exists — read it and supplement, do not duplicate.

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

## Step 4: Create product page

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
  // Products: image type — value is an OBJECT (not an array!)
  const imageUrl = attrs.pic?.value?.downloadLink || '';
  const title = product.localizeInfos?.title || '';
  const price = attrs.price?.value || 0;
  const oldPrice = attrs.sale?.value || 0;

  // text type — value is an object with htmlValue/plainValue
  const description = attrs.description?.value?.htmlValue
    || attrs.description?.value?.plainValue
    || '';

  // Status: replace 'in_stock' with the real one from /inspect-api
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

        {/* Information */}
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

          {/* Cart button — always by default */}
          {isOutOfStock
            ? <div>Out of stock</div>
            : <AddToCartButton product={product} />
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

  // In parallel — product and related
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
// groupOfImages — value is an array of several images
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

## Step 5: Remind key rules

✅ Page created. Key rules:

```md
1. params in Next.js 15+ — this is a Promise, await is required
2. Products: image → value is an OBJECT → attrs.pic?.value?.downloadLink (NOT an array!)
2. groupOfImages → value is an ARRAY → attrs.gallery?.value?.[0]?.downloadLink
2. Pages/Blocks: image → value is an ARRAY → attrs.bg?.value?.[0]?.downloadLink
3. text → value.htmlValue or value.plainValue (object, not string)
4. statusIdentifier — check via /inspect-api, do not hardcode 'in_stock'
5. Promise.all for parallel requests (product + related + blocks)
6. notFound() on error — do not render an empty page
7. next/image requires remotePatterns in next.config.ts for *.oneentry.cloud
```

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to the product page

For selector stability — add `data-testid` when generating `product/[id]/page.tsx`:

```tsx
return (
  <main data-testid="product-page" data-product-id={product.id}>
    <div>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={title}
          width={400}
          height={400}
          data-testid="product-page-image"
        />
      ) : (
        <div data-testid="product-page-no-image">No image</div>
      )}

      <div>
        <h1 data-testid="product-page-title">{title}</h1>

        <div data-testid="product-page-price-block">
          <span data-testid="product-page-price">{price}</span>
          {oldPrice > 0 && <span data-testid="product-page-old-price">{oldPrice}</span>}
        </div>

        {description && (
          <div
            data-testid="product-page-description"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        {isOutOfStock
          ? <div data-testid="product-page-out-of-stock">Out of stock</div>
          : <div data-testid="product-page-add-to-cart"><AddToCartButton product={product} /></div>
        }
      </div>
    </div>

    {/* Gallery (if groupOfImages) */}
    {gallery.length > 0 && (
      <div data-testid="product-page-gallery" className="flex gap-2">
        {gallery.map((img: any, i: number) => (
          <Image
            key={i}
            src={img.downloadLink}
            alt={`${title} - ${i + 1}`}
            width={100}
            height={100}
            data-testid="product-page-gallery-image"
          />
        ))}
      </div>
    )}

    {/* Related products */}
    {relatedProducts.length > 0 && (
      <section data-testid="product-page-related">
        <h2>Related products</h2>
        {/* ... */}
      </section>
    )}
  </main>
);
```

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Product page route** — taken from the path of the created file (`app/[locale]/shop/product/[id]/page.tsx`). Claude knows the pattern itself. Inform: "Tests will go to `/{locale}/shop/product/{id}` — I will substitute real id and locale".
2. **ID of a real product** — take it directly via `/inspect-api products`: `items[0].id`. Inform: "For the test, I will use product id=`{value}` (`{title}`) — the first from /inspect-api".
3. **Locale** — the first from `/inspect-api` (usually `en_US`). If the project is monolocal and the route does not have `[locale]` — adjust `E2E_PRODUCT_PATH_TEMPLATE` (remove the prefix).
4. **Gallery presence** — check via `/inspect-api`: does the product have the attribute `groupOfImages` with a non-empty array. If not — the gallery test will include `test.skip`. Inform: "The product `id={id}` {has a gallery of N images / no groupOfImages — gallery test disabled}".
5. **ID of a non-existent product** — generate a random one: `99999999 + Math.floor(Math.random() * 1000)`. Guaranteed not to exist, will check `notFound()`.
6. **Fill in `.env.local`** (yourself, via Edit):

```bash
E2E_PRODUCT_ID=42                                      # id of the real product from /inspect-api
E2E_PRODUCT_PATH_TEMPLATE=/en_US/shop/product/         # prefix to which id is added
E2E_PRODUCT_EXPECT_GALLERY=true                        # true if the product has groupOfImages
```

If any value is not defined — leave it empty, the test will be `test.skip`.

### 6.3 Create `e2e/product-page.spec.ts`

> ⚠️ Tests work with the real OneEntry project — they use the real product id from `/inspect-api`.

```typescript
import { test, expect } from '@playwright/test';

const PRODUCT_ID = process.env.E2E_PRODUCT_ID || '';
const PATH_TEMPLATE = process.env.E2E_PRODUCT_PATH_TEMPLATE || '/en_US/shop/product/';
const EXPECT_GALLERY = process.env.E2E_PRODUCT_EXPECT_GALLERY === 'true';

test.describe('Product page', () => {
  test.skip(!PRODUCT_ID, 'E2E_PRODUCT_ID is not set');

  test('renders title, price, image by real id', async ({ page }) => {
    await page.goto(`${PATH_TEMPLATE}${PRODUCT_ID}`);

    const root = page.getByTestId('product-page');
    await expect(root).toBeVisible({ timeout: 10_000 });
    await expect(root).toHaveAttribute('data-product-id', PRODUCT_ID);

    const title = page.getByTestId('product-page-title');
    await expect(title).toBeVisible();
    await expect(title).not.toBeEmpty();

    const price = page.getByTestId('product-page-price');
    await expect(price).toBeVisible();
    await expect(price).not.toBeEmpty();

    // image OR fallback
    const hasImage = await page.getByTestId('product-page-image').isVisible().catch(() => false);
    const hasNoImage = await page.getByTestId('product-page-no-image').isVisible().catch(() => false);
    expect(hasImage || hasNoImage).toBe(true);
  });

  test('renders description (if provided)', async ({ page }) => {
    await page.goto(`${PATH_TEMPLATE}${PRODUCT_ID}`);
    const desc = page.getByTestId('product-page-description');
    // Description may be absent — check that the page still loaded
    const hasDesc = await desc.isVisible().catch(() => false);
    const rootVisible = await page.getByTestId('product-page').isVisible();
    expect(rootVisible).toBe(true);
    if (hasDesc) await expect(desc).not.toBeEmpty();
  });

  test('gallery renders multiple images (groupOfImages)', async ({ page }) => {
    test.skip(!EXPECT_GALLERY, 'The product does not have groupOfImages — gallery test disabled');

    await page.goto(`${PATH_TEMPLATE}${PRODUCT_ID}`);
    const gallery = page.getByTestId('product-page-gallery');
    await expect(gallery).toBeVisible({ timeout: 10_000 });
    const images = page.getByTestId('product-page-gallery-image');
    expect(await images.count()).toBeGreaterThan(0);
  });

  test('the "Add to Cart" button is clickable (in-stock product)', async ({ page }) => {
    await page.goto(`${PATH_TEMPLATE}${PRODUCT_ID}`);
    const addBtn = page.getByTestId('product-page-add-to-cart');
    const outOfStock = page.getByTestId('product-page-out-of-stock');

    const hasAdd = await addBtn.isVisible().catch(() => false);
    const hasOOS = await outOfStock.isVisible().catch(() => false);
    // One of the two — definitely exists
    expect(hasAdd || hasOOS).toBe(true);

    if (hasAdd) {
      await addBtn.click();
      // Minimal check — click did not crash the page
      await expect(page.getByTestId('product-page')).toBeVisible();
    }
  });

  test('non-existent id → 404', async ({ page }) => {
    const fakeId = 99999999 + Math.floor(Math.random() * 1000);
    const response = await page.goto(`${PATH_TEMPLATE}${fakeId}`);
    expect(response?.status()).toBe(404);
  });
});
```

### 6.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/product-page.spec.ts created
✅ data-testid added to product/[id]/page.tsx
✅ .env.local updated (E2E_PRODUCT_ID, E2E_PRODUCT_PATH_TEMPLATE, E2E_PRODUCT_EXPECT_GALLERY)

Decisions made automatically:
- Test product: id={PRODUCT_ID} ({title}) — the first from /inspect-api products
- Path template: {PATH_TEMPLATE} — from the route of the created file
- Locale: {locale} — the first available in the project (from /inspect-api)
- Gallery: {has groupOfImages — test included / no — test.skip}
- 404 test: random id in the range 99_999_999+, guaranteed not to exist

Run: npm run test:e2e -- product-page.spec.ts
```
