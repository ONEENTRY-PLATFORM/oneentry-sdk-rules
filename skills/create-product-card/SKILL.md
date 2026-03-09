<!-- META
type: skill
skillConfig: {"name":"create-product-card"}
-->

# Create a Product Card

---

## Step 1: Check the Real Product Attributes

**BEFORE writing the code** — find out the real attribute markers:

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

**⚠️ DO NOT guess the markers** — they are unique for each project.

---

## Step 2: Clarify with the User

1. **Is there a layout for the card?** — if yes, copy it exactly, changing only the data
2. **Where does the link from the card lead?** — for example `/shop/product/[id]` or `/${locale}/product/[id]`
3. **Is a "Add to Cart" button needed?** — if yes, clarify how the cart is implemented
4. **Is a "Favorites" button needed?** — if yes, clarify how it is implemented

---

## Step 3: Check the Image Attribute Type in the SDK

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

> ⚠️ For Pages and Blocks `image` returns an ARRAY. Always check through `/inspect-api` or `console.log(attrs.marker?.value)` before writing code.

---

## Step 4: Create the Card Component

### Basic Template

```tsx
// components/ProductCard.tsx
import Image from 'next/image';
import Link from 'next/link';
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
    </article>
  );
}
```

### With Stickers (list with extended)

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

### With Stock Quantity

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

### With Favorites Button (through context)

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
1. Products: image → value OBJECT → attrs.pic?.value?.downloadLink (NOT an array!)
1. groupOfImages → value ARRAY → attrs.gallery?.value?.[0]?.downloadLink
1. Pages/Blocks: image → value ARRAY → attrs.bg?.value?.[0]?.downloadLink
1. Always check the structure through /inspect-api before writing code
2. Attribute markers are unique to the project — check through /inspect-api
3. statusIdentifier — the real status from /inspect-api, do not guess 'in_stock'
4. Stickers (list with extended) → stickers[0]?.extended?.value?.downloadLink
5. next/image requires remotePatterns in next.config.ts for *.oneentry.cloud
6. If there is a layout — copy classes exactly, change only the data
```
