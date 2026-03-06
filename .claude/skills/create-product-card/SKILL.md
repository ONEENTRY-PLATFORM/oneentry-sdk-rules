<!-- META
type: skill
skillConfig: {"name":"create-product-card"}
-->

# Создать карточку товара

---

## Шаг 1: Проверь реальные атрибуты товара

**ПЕРЕД написанием кода** — узнай реальные маркеры атрибутов:

```bash
/inspect-api products
```

Что смотреть в `items[0].attributeValues`:
- Маркер изображения (тип `image` или `groupOfImages`) — например `pic`, `photo`, `image`
- Маркер цены (тип `float`/`real`/`integer`) — например `price`
- Маркер старой цены / скидки — например `sale`, `old_price`
- Маркер стикеров/бейджей (тип `list` с `extended`) — например `stickers`
- Маркер количества на складе (тип `integer`) — например `units_product`, `stock`
- `statusIdentifier` — реальный идентификатор статуса "в наличии"

**⚠️ НЕ угадывай маркеры** — они уникальны для каждого проекта.

---

## Шаг 2: Уточни у пользователя

1. **Есть ли верстка карточки?** — если да, копируй точно, меняй только данные
2. **Куда ведёт ссылка с карточки?** — например `/shop/product/[id]` или `/${locale}/product/[id]`
3. **Нужна ли кнопка "В корзину"?** — если да, уточни как реализована корзина
4. **Нужна ли кнопка "Избранное"?** — если да, уточни как реализовано

---

## Шаг 3: Проверь тип атрибута изображения в SDK

Для `image` тип — `value` это **МАССИВ**:

```typescript
// ✅ image → value[0].downloadLink
const imageUrl = attrs.pic?.value?.[0]?.downloadLink || '';

// ❌ НЕ attrs.pic?.value?.downloadLink (без [0])
```

Для `groupOfImages` — аналогично, `value` это массив.

---

## Шаг 4: Создай компонент карточки

### Базовый шаблон

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

  // ⚠️ Замени маркеры на реальные из /inspect-api!
  // image тип — value это МАССИВ, берём [0]
  const imageUrl = attrs.pic?.value?.[0]?.downloadLink || '';

  const title = product.localizeInfos?.title || '';
  const price = attrs.price?.value || 0;
  const oldPrice = attrs.sale?.value || 0;

  // Статус: замени 'in_stock' на реальный statusIdentifier из /inspect-api
  const inStock = product.statusIdentifier === 'in_stock';

  return (
    <article>
      <Link href={`/${locale}/shop/product/${product.id}`}>
        {/* Изображение */}
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

        {/* Название */}
        <h2>{title}</h2>

        {/* Цена */}
        <div>
          <span>{price}</span>
          {oldPrice > 0 && <span className="line-through">{oldPrice}</span>}
        </div>

        {/* Статус */}
        {!inStock && <div>Out of stock</div>}
      </Link>
    </article>
  );
}
```

### Со стикерами (list с extended)

```tsx
// Стикеры/бейджи — тип list, value это массив объектов с extended
// extended.value.downloadLink — URL иконки стикера
const stickers = attrs.stickers?.value || [];
const stickerIconUrl = stickers[0]?.extended?.value?.downloadLink || '';

// В JSX:
{stickerIconUrl && (
  <Image src={stickerIconUrl} alt="" width={24} height={24} />
)}
```

### С количеством на складе

```tsx
// Количество на складе — тип integer
const stockQty = Number(attrs.units_product?.value) || 0;
const isOutOfStock = !inStock || stockQty === 0;

// В JSX:
{isOutOfStock
  ? <div>Out of stock</div>
  : <button>Add to cart</button>
}
```

### С кнопкой избранного (через контекст)

```tsx
// Если есть FavoritesContext
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
      {/* ... остальная карточка */}
    </article>
  );
}
```

---

## Шаг 5: Напомни ключевые правила

✅ Компонент создан. Ключевые правила:

```md
1. image/groupOfImages → value это МАССИВ → attrs.pic?.value?.[0]?.downloadLink
2. Маркеры атрибутов уникальны для проекта — проверяй через /inspect-api
3. statusIdentifier — реальный статус из /inspect-api, не угадывай 'in_stock'
4. Стикеры (list с extended) → stickers[0]?.extended?.value?.downloadLink
5. next/image требует remotePatterns в next.config.ts для *.oneentry.cloud
6. Если есть верстка — копируй классы точно, меняй только данные
```
