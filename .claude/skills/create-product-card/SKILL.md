<!-- META
type: skill
skillConfig: {"name":"create-product-card"}
-->

# Create a Product Card

---

## Step 1: Check real product attributes

**BEFORE writing code** — get the real attribute markers:

```bash
/inspect-api products
```

What to look for in `items[0].attributeValues`:
- Image marker (type `image` or `groupOfImages`) — e.g. `pic`, `photo`, `image`
- Price marker (type `float`/`real`/`integer`) — e.g. `price`
- Old price / discount marker — e.g. `sale`, `old_price`
- Stickers/badges marker (type `list` with `extended`) — e.g. `stickers`
- Stock quantity marker (type `integer`) — e.g. `units_product`, `stock`
- `statusIdentifier` — real "in stock" status identifier

**⚠️ Do NOT guess markers** — they are unique per project.

---

## Step 2: Clarify with the user

1. **Is there existing markup?** — if yes, copy it exactly, only replace data
2. **Where does the card link to?** — e.g. `/shop/product/[id]` or `/${locale}/product/[id]`
3. **Is an "Add to cart" button needed?** — if yes, clarify how the cart is implemented
4. **Is a "Favorites" button needed?** — if yes, clarify how favorites are implemented

---

## Step 3: Check the image attribute type in the SDK

For `image` type — `value` is an **ARRAY**:

```typescript
// ✅ image → value[0].downloadLink
const imageUrl = attrs.pic?.value?.[0]?.downloadLink || '';

// ❌ NOT attrs.pic?.value?.downloadLink (missing [0])
```

For `groupOfImages` — same, `value` is an array.

---

## Step 4: Create the card component

### Basic template

```tsx
// components/product/ProductCard.tsx
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
  // image type — value is an ARRAY, take [0]
  const imageUrl = attrs.pic?.value?.[0]?.downloadLink || '';

  const title = product.localizeInfos?.title || '';
  const price = attrs.price?.value || 0;
  const oldPrice = attrs.sale?.value || 0;

  // Status: replace 'in_stock' with real statusIdentifier from /inspect-api
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

### With stickers (list with extended)

```tsx
// Stickers/badges — type list, value is an array of objects with extended
// extended.value.downloadLink — sticker icon URL
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
// If FavoritesContext exists
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
      {/* ... rest of card */}
    </article>
  );
}
```

---

## Step 5: Reminder — key rules

✅ Component created. Key rules:

```md
1. image/groupOfImages → value is an ARRAY → attrs.pic?.value?.[0]?.downloadLink
2. Attribute markers are project-specific — verify via /inspect-api
3. statusIdentifier — real status from /inspect-api, don't guess 'in_stock'
4. Stickers (list with extended) → stickers[0]?.extended?.value?.downloadLink
5. next/image requires remotePatterns in next.config.ts for *.oneentry.cloud
6. If markup exists — copy classes exactly, only replace data
```
