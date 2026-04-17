---
name: create-product-card
description: Create product card component
---
# Create Product Card

---

## Step 1: Check the real product attributes

**BEFORE writing code** — find out the real attribute markers:

```bash
/inspect-api products
```

What to look for in `items[0].attributeValues`:
- Image marker (type `image` or `groupOfImages`) — for example `pic`, `photo`, `image`
- Price marker (type `float`/`real`/`integer`) — for example `price`
- Old price / discount marker — for example `sale`, `old_price`
- Stickers/badges marker (type `list` with `extended`) — for example `stickers`
- Stock quantity marker (type `integer`) — for example `units_product`, `stock`
- `statusIdentifier` — the real identifier for the "in stock" status

**⚠️ DO NOT guess the markers** — they are unique to each project.

---

## Step 2: Clarify with the user

1. **Is there a layout for the card?** — if yes, copy it exactly, only change the data
2. **Where does the card link lead?** — for example `/shop/product/[id]` or `/${locale}/product/[id]`

> **🛒 The "Add to Cart" button is ALWAYS added by default.**
> Do not ask the user "do you need a button?". If the user **explicitly** did not say "without a button" — add it.
> If the cart is not yet implemented — first run `/create-cart-manager`.
> The "Add to Favorites" button is added **only upon request** from the user (→ `/create-favorites`).

---

## Step 3: Check the image attribute type in the SDK

For Products `image` type — `value` is an **OBJECT** (verified with real data):

```typescript
// ✅ Products: image → value.downloadLink (OBJECT)
const imageUrl = attrs.pic?.value?.downloadLink || '';

// ❌ NOT value?.[0]?.downloadLink — for Products image is not an array!
```

For `groupOfImages` — `value` is always an **ARRAY**:

```typescript
const firstImg = attrs.gallery?.value?.[0]?.downloadLink || '';
```

> ⚠️ For Pages and Blocks `image` returns an ARRAY. Always check the structure via `/inspect-api` or `console.log(attrs.marker?.value)` before writing code.

---

## Step 4: Create the card component

### Basic template

> ⚠️ The "Add to Cart" button is **mandatory by default**. The "Add to Favorites" button — only upon request.
> The card is a Client Component (`'use client'`), as the cart button requires interactivity (dispatch in Redux store).

```tsx
// components/product/ProductCard.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import type { IProductsEntity } from 'oneentry/dist/products/productsInterfaces';

interface ProductCardProps {
  product: IProductsEntity;
  locale: string;
}

export function ProductCard({ product, locale }: ProductCardProps) {
  const attrs = product.attributeValues || {};

  // ⚠️ Replace markers with real ones from /inspect-api!
  // Products: image type — value is an OBJECT
  const imageUrl = attrs.pic?.value?.downloadLink || '';

  const title = product.localizeInfos?.title || '';
  const price = attrs.price?.value || 0;
  const oldPrice = attrs.sale?.value || 0;

  // Status: replace 'in_stock' with the real statusIdentifier from /inspect-api
  const inStock = product.statusIdentifier === 'in_stock';

  return (
    <article>
      <Link href={`/${locale}/shop/product/${product.id}`}>
        {/* Image */}
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            width={200}
            height={200}
            className="object-cover"
          />
        ) : (
          <div>No image</div>
        )}

        {/* Title */}
        <h2>{title}</h2>

        {/* Price */}
        <div>
          <span>{price}</span>
          {oldPrice > 0 && <span className="line-through">{oldPrice}</span>}
        </div>

        {/* Status */}
        {!inStock && <div>Out of stock</div>}
      </Link>

      {/* Cart button — always by default */}
      {inStock && (
        <AddToCartButton product={product} />
      )}
    </article>
  );
}
```

### With stickers (list with extended)

```tsx
// Stickers/badges — type list, value is an array of objects with extended
// extended.value.downloadLink — URL of the sticker icon
const stickers = attrs.stickers?.value || [];
const stickerIconUrl = stickers[0]?.extended?.value?.downloadLink || '';

// In JSX:
{stickerIconUrl && (
  <Image src={stickerIconUrl} alt="" width={24} height={24} />
)}
```

### With stock quantity

```tsx
// Stock quantity — type integer
const stockQty = Number(attrs.units_product?.value) || 0;
const isOutOfStock = !inStock || stockQty === 0;

// In JSX:
{isOutOfStock
  ? <div>Out of stock</div>
  : <button>Add to cart</button>
}
```

### With favorites button (via context)

```tsx
// If there is a FavoritesContext
'use client';

import { useFavorites } from '@/lib/FavoritesContext';

export function ProductCard({ product, locale }: ProductCardProps) {
  const { toggleFavorite, isFavorite } = useFavorites();
  const favorited = isFavorite(product.id);

  return (
    <article>
      <button
        type="button"
        onClick={() => toggleFavorite(product.id)}
        aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
      >
        {favorited ? '♥' : '♡'}
      </button>
      {/* ... rest of the card */}
    </article>
  );
}
```

---

## Step 5: Remind key rules

✅ Component created. Key rules:

```md
1. Products: image → value is an OBJECT → attrs.pic?.value?.downloadLink (NOT an array!)
1. groupOfImages → value is an ARRAY → attrs.gallery?.value?.[0]?.downloadLink
1. Pages/Blocks: image → value is an ARRAY → attrs.bg?.value?.[0]?.downloadLink
1. Always check the structure via /inspect-api before writing code
2. Attribute markers are unique to the project — check via /inspect-api
3. statusIdentifier — real status from /inspect-api, do not guess 'in_stock'
4. Stickers (list with extended) → stickers[0]?.extended?.value?.downloadLink
5. next/image requires remotePatterns in next.config.ts for *.oneentry.cloud
6. If there is a layout — copy classes exactly, only change the data
```

---

## Step 6: Playwright E2E tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to the card component

For selector stability — add `data-testid` when generating `ProductCard.tsx`:

```tsx
return (
  <article data-testid="product-card" data-product-id={product.id}>
    <Link href={`/${locale}/shop/product/${product.id}`} data-testid="product-card-link">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={title}
          width={200}
          height={200}
          data-testid="product-card-image"
        />
      ) : (
        <div data-testid="product-card-no-image">No image</div>
      )}

      <h2 data-testid="product-card-title">{title}</h2>

      <div data-testid="product-card-price-block">
        <span data-testid="product-card-price">{price}</span>
        {oldPrice > 0 && (
          <span data-testid="product-card-old-price" className="line-through">{oldPrice}</span>
        )}
      </div>

      {!inStock && <div data-testid="product-card-out-of-stock">Out of stock</div>}
    </Link>

    {inStock && (
      <div data-testid="product-card-add-to-cart">
        <AddToCartButton product={product} />
      </div>
    )}

    {/* If the favorites button is added */}
    {/* <button data-testid="product-card-favorite" onClick={() => toggleFavorite(product.id)}>...</button> */}
  </article>
);
```

> If `AddToCartButton` from `/create-cart-manager` is used — make sure the root element of the button has `data-testid="add-to-cart-btn"` (add in that skill if not yet present).

### 6.2 Gather test parameters and fill in `.env.local`

**Algorithm (execute step by step, do not ask in one list):**

1. **Where is `ProductCard` used** — determine it yourself via Grep (`<ProductCard` / `ProductCard `) in `app/**` and `components/**`. Usually — in the catalog grid. Report: "Card is used in `{path}` — opening this page for the test".
2. **Path of the catalog with cards** — if a catalog page was found in step 1, use its path. If not found — ask: "On which page to render the card for the test? (route path, for example `/shop`)".
3. **Route of the product page** — take from the Link template in the card itself (`href={`/${locale}/shop/product/${product.id}`}`). Define the pattern with regex — it is needed for the click test.
4. **ID of a real product** — find out yourself via `/inspect-api products`: take `items[0].id` — the first product in the catalog. Report: "For the click test, I use the product with `id={value}` — the first from /inspect-api".
5. **Presence of buttons** (favorites / add-to-cart) — determine via Grep in the generated `ProductCard.tsx`. If `AddToCartButton` is present — the `AddToCart` test is included, otherwise `test.skip`. If `toggleFavorite` — the favorites test is included.
6. **Fill in `.env.local`** (yourself, via Edit):

```bash
E2E_CARD_CATALOG_PATH=/shop           # page where cards are rendered
E2E_CARD_PRODUCT_ID=42                 # id of the first product from /inspect-api (for click check)
E2E_CARD_PRODUCT_PATH_RE=^/[^/]+/shop/product/   # regex for redirect on click
```

If any value is not determined — leave it empty, the test will be `test.skip`.

### 6.3 Create `e2e/product-card.spec.ts`

> ⚠️ Tests work with the real OneEntry project. The card is tested on an already existing catalog page (not in isolation).

```typescript
import { test, expect } from '@playwright/test';

const CATALOG_PATH = process.env.E2E_CARD_CATALOG_PATH || '/shop';
const PRODUCT_PATH_RE = new RegExp(process.env.E2E_CARD_PRODUCT_PATH_RE || '^/[^/]+/shop/product/');

test.describe('ProductCard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CATALOG_PATH);
    await expect(page.getByTestId('product-card').first()).toBeVisible({ timeout: 10_000 });
  });

  test('renders title, price, image', async ({ page }) => {
    const card = page.getByTestId('product-card').first();

    // title — not empty
    const title = card.getByTestId('product-card-title');
    await expect(title).toBeVisible();
    await expect(title).not.toBeEmpty();

    // price — not empty
    const price = card.getByTestId('product-card-price');
    await expect(price).toBeVisible();
    await expect(price).not.toBeEmpty();

    // image OR no-image fallback — one of the two must be present
    const hasImage = await card.getByTestId('product-card-image').isVisible().catch(() => false);
    const hasNoImage = await card.getByTestId('product-card-no-image').isVisible().catch(() => false);
    expect(hasImage || hasNoImage).toBe(true);
  });

  test('clicking the card leads to the product page', async ({ page }) => {
    const card = page.getByTestId('product-card').first();
    await card.getByTestId('product-card-link').click();
    await expect(page).toHaveURL(PRODUCT_PATH_RE, { timeout: 10_000 });
  });

  test('out-of-stock product shows label and hides AddToCart', async ({ page }) => {
    const outOfStockCard = page.locator('[data-testid="product-card"]:has([data-testid="product-card-out-of-stock"])').first();
    test.skip(!(await outOfStockCard.isVisible().catch(() => false)), 'No out-of-stock products in the catalog');

    await expect(outOfStockCard.getByTestId('product-card-out-of-stock')).toBeVisible();
    await expect(outOfStockCard.getByTestId('product-card-add-to-cart')).toHaveCount(0);
  });

  test('the "Add to Cart" button responds to click (in-stock product)', async ({ page }) => {
    const addBtn = page.getByTestId('product-card-add-to-cart').first();
    test.skip(!(await addBtn.isVisible().catch(() => false)), 'AddToCartButton not found — either the catalog is empty or the button is not added');

    await addBtn.click();
    // Minimal check: click did not cause an error in the console and the page did not crash
    await expect(page.getByTestId('product-card').first()).toBeVisible();
  });
});
```

### 6.4 Report to the user about the decisions made

Before completing the task — explicitly inform:

```
✅ e2e/product-card.spec.ts created
✅ data-testid added to ProductCard
✅ .env.local updated (E2E_CARD_CATALOG_PATH, E2E_CARD_PRODUCT_ID, E2E_CARD_PRODUCT_PATH_RE)

Decisions made automatically:
- Page for the test: {CATALOG_PATH} — {found via Grep <ProductCard / specified by the user}
- Test product: id={PRODUCT_ID} — first `items[0].id` from /inspect-api products
- Regex for product page: {PRODUCT_PATH_RE} — extracted from Link template in ProductCard
- Test "Add to Cart": {included — AddToCartButton found / test.skip — button not present}
- Test out-of-stock: test.skip is activated automatically if there are no such products

Run: npm run test:e2e -- product-card.spec.ts
```
