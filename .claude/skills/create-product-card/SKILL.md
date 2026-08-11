---
name: create-product-card
description: Create product card component
---
# Create a Product Card

---

## Step 1: Check the Real Product Attributes

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
- `statusIdentifier` — the actual identifier for the "in stock" status

**⚠️ DO NOT guess the markers** — they are unique for each project.

---

## Step 2: Clarify with the User

1. **Is there a layout for the card?** — if yes, copy it exactly, changing only the data
2. **Where does the card link lead?** — for example `/shop/product/[id]` or `/${locale}/product/[id]`

> **🛒 The "Add to Cart" button is ALWAYS added by default.**
> Do not ask the user "do you need a button?". If the user **explicitly** did not say "without a button" — add it.
> If the cart is not yet implemented — first run `/create-cart-manager`.
> The "Add to Favorites" button is added **only upon user request** (→ `/create-favorites`).

---

## Step 3: Check the Image Attribute Type in SDK

With SDK ≥ 1.0.157, the `value` form for `image`/`file` depends **only on the number of files** and is the same across all modules (Products, Pages, Blocks, Orders): one file → **OBJECT**, two or more → **ARRAY**.

```typescript
// ✅ Resilient to both forms. value: unknown → narrowing with cast
type FileValue = { downloadLink?: string };
const rawPic = attrs.pic?.value as FileValue | FileValue[] | undefined;
const imageUrl = (Array.isArray(rawPic) ? rawPic[0] : rawPic)?.downloadLink || '';

// Short version if the marker is guaranteed to have one file in the project:
// const imageUrl = (attrs.pic?.value as FileValue | undefined)?.downloadLink || '';
```

For `groupOfImages` — `value` is always **ARRAY** (a collection by definition, SDK does not unfold it):

```typescript
const firstImg = (attrs.gallery?.value as Array<{ downloadLink?: string }> | undefined)?.[0]?.downloadLink || '';
```

> ⚠️ Prior to v1.0.157, Pages and Blocks returned a single `image` as an array — old code with `value[0]` will now return `undefined`. Check the actual form via `/inspect-api` or `console.log(attrs.marker?.value)` and write code that survives the addition of a second file in the admin panel.

---

## Step 4: Create the Card Component

### Basic Template

> ⚠️ The "Add to Cart" button is **mandatory by default**. The "Add to Favorites" button — only upon request.
> The card is a Client Component (`'use client'`), as the cart button requires interactivity (dispatch in Redux store).

```tsx
// src/components/product/ProductCard.tsx
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
  // image: 1 file → object, 2+ → array (v1.0.157, the same across all modules).
  // value is of type unknown — narrow it at the access point
  // (.claude/rules/typescript.md § "Narrowing unknown at the access point"), as any is prohibited.
  const rawPic = attrs.pic?.value as { downloadLink?: string } | Array<{ downloadLink?: string }> | undefined;
  const imageUrl = (Array.isArray(rawPic) ? rawPic[0] : rawPic)?.downloadLink || '';

  const title = product.localizeInfos?.title || '';
  // Numeric attributes from v1.0.157 come as a number or null (not a string and not 0)
  const price = Number(attrs.price?.value ?? 0);
  const oldPrice = Number(attrs.sale?.value ?? 0);

  // Status: replace 'in_stock' with the actual statusIdentifier from /inspect-api
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

> **Where `product` comes from.** Besides `Products.getProducts*` / catalog, products come ready inside page blocks from `Pages.getBlocksByPageUrl` (SDK ≥ 1.0.153): `block.products` (`IProductsEntity[]`) for `product_block` blocks and `block.similarProducts` (`IProductsResponse { total, items }`) for `similar_products_block`. Both contain `IProductsEntity` and are rendered with the same `<ProductCard>` without additional requests. Access defensively — `const items = block.products ?? []; const similar = block.similarProducts?.items ?? []` — fields are only present when traffic-saving (`traficLimit`) is off and only for these two types of blocks; on load failure, the SDK returns `[]`.

### With Stickers (list with extended)

```tsx
// Stickers/badges — type list, value is an array of objects with extended
// extended.value.downloadLink — URL of the sticker icon (value: unknown → narrowing with cast)
const stickers = (attrs.stickers?.value as Array<{ title?: string; extended?: { value?: { downloadLink?: string } } }> | undefined) || [];
const stickerIconUrl = stickers[0]?.extended?.value?.downloadLink || '';

// In JSX:
{stickerIconUrl && (
  <Image src={stickerIconUrl} alt="" width={24} height={24} />
)}
```

### With Stock Quantity

```tsx
// Stock quantity — type integer: from v1.0.157 comes as a number or null (not filled).
// ⚠️ Previously, an unfilled integer came as 0 — now null, and "no value"
// is distinguishable from "zero in stock". Decide consciously how to treat null.
const rawQty = attrs.units_product?.value as number | null | undefined;
const stockQty = rawQty ?? 0;
const isOutOfStock = !inStock || stockQty === 0;

// In JSX:
{isOutOfStock
  ? <div>Out of stock</div>
  : <button>Add to cart</button>
}
```

### With Favorites Button (via context)

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

## Step 5: Remind Key Rules

✅ Component created. Key rules:

```md
1. image/file (v1.0.157, any module): 1 file → value OBJECT, 2+ → ARRAY. Resilient: const r = attrs.pic?.value as F | F[] | undefined; (Array.isArray(r) ? r[0] : r)?.downloadLink
1. groupOfImages → value ALWAYS ARRAY → (attrs.gallery?.value as Array<{ downloadLink?: string }>)?.[0]?.downloadLink
1. Prior to v1.0.157, Pages/Blocks returned a single image as an array — old code with value[0] will now return undefined
1. IAttributeValue.value is of type unknown — narrow it with cast at the access point (.claude/rules/typescript.md); numeric attributes come as a number or null (not 0) — use ?? 0, not || 0; as any is prohibited
1. Always check the structure via /inspect-api before writing code
2. Attribute markers are unique to the project — check via /inspect-api
3. statusIdentifier — the actual status from /inspect-api, do not guess 'in_stock'
4. Stickers (list with extended) → (attrs.stickers?.value as Array<{ extended?: { value?: { downloadLink?: string } } }>)?.[0]?.extended?.value?.downloadLink
5. next/image requires remotePatterns in next.config.ts for *.oneentry.cloud
6. If there is a layout — copy classes exactly, changing only the data
```

---

## Step 6: Playwright E2E Tests

> Runs only if the user confirmed writing tests at the beginning of the session or requested writing a test later (see `feedback_playwright.md`).
> To set up Playwright — first `/setup-playwright`.

### 6.1 Add `data-testid` to the Card Component

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

> If using `AddToCartButton` from `/create-cart-manager` — ensure the root element of the button has `data-testid="add-to-cart-btn"` (add in that skill if not already present).

### 6.2 Gather Test Parameters and Fill `.env.local`

**Algorithm (perform step by step, do not ask in one list):**

1. **Where is `ProductCard` used** — determine yourself via Grep (`<ProductCard` / `ProductCard `) in `src/app/**` and `src/components/**`. Usually — in the catalog grid. Report: "The card is used in `{path}` — opening this page for the test".
2. **Path to the catalog with cards** — if a catalog page was found in step 1, use its path. If not found — ask: "On which page to render the card for the test? (route path, for example `/shop`)".
3. **Route to the product page** — take from the Link template in the card itself (`href={`/${locale}/shop/product/${product.id}`}`). Define the pattern with regex — it is needed for the click test.
4. **ID of the real product** — find out yourself via `/inspect-api products`: take `items[0].id` — the first product in the catalog. Report: "For the click test, I use the product with `id={value}` — the first from /inspect-api".
5. **Presence of buttons** (favorites / add-to-cart) — determine via Grep from the generated `ProductCard.tsx`. If `AddToCartButton` is present — the `AddToCart` test is included, otherwise `test.skip`. If `toggleFavorite` — the favorites test is included.
6. **Fill in `.env.local`** (yourself, via Edit):

```bash
E2E_CARD_CATALOG_PATH=/shop           # page where cards are rendered
E2E_CARD_PRODUCT_ID=42                 # id of the first product from /inspect-api (for click check)
E2E_CARD_PRODUCT_PATH_RE=^/[^/]+/shop/product/   # regex for redirect on click
```

If any value is not defined — leave it empty, the test will be `test.skip`.

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

  test('clicking on the card leads to the product page', async ({ page }) => {
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

### 6.4 Report to the User on Decisions Made

Before completing the task — explicitly inform:

```
✅ e2e/product-card.spec.ts created
✅ data-testid added to ProductCard
✅ .env.local updated (E2E_CARD_CATALOG_PATH, E2E_CARD_PRODUCT_ID, E2E_CARD_PRODUCT_PATH_RE)

Decisions made automatically:
- Page for the test: {CATALOG_PATH} — {found via Grep <ProductCard / specified by user}
- Test product: id={PRODUCT_ID} — first `items[0].id` from /inspect-api products
- Regex for product page: {PRODUCT_PATH_RE} — extracted from Link template in ProductCard
- Test "Add to Cart": {included — AddToCartButton found / test.skip — button not present}
- Test out-of-stock: test.skip activates automatically if no such products exist

Run: npm run test:e2e -- product-card.spec.ts
```
