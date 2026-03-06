<!-- META
type: skill
skillConfig: {"name":"create-subscription-events"}
-->

# Создать подписку на события товара

Создаёт подписку на изменение цены и статуса наличия товара через Events API OneEntry. Пользователь получает уведомление когда товар снова появится в наличии или изменится цена.

> ⚠️ Требует авторизованного пользователя. Events API работает только после логина (через `reDefine()` в Client Components или через `makeUserApi()` в Server Actions).

---

## Шаг 1: Узнай маркеры событий

Маркеры событий настраиваются в OneEntry Admin → Events. Стандартные маркеры из реального проекта:

- `status_out_of_stock` — товар кончился / появился
- `product_price` — изменилась цена

Уточни реальные маркеры у пользователя или проверь в админке.

---

## Шаг 2: Создай хук для подписки

Файл: `app/api/hooks/useEvents.ts`

```typescript
'use client';

import { getApi, isError } from '@/lib/oneentry';

// Маркеры событий — уточни у пользователя!
const EVENT_MARKERS = {
  stockStatus: 'status_out_of_stock',
  priceChange: 'product_price',
};

/**
 * Подписаться на события товара (изменение цены и наличия).
 * Вызывать ТОЛЬКО из Client Component после logIn + reDefine().
 */
export async function subscribeToProductEvents(productId: number): Promise<{
  stockSubscribed: boolean;
  priceSubscribed: boolean;
}> {
  const [stockResult, priceResult] = await Promise.all([
    getApi().Events.subscribeByMarker(EVENT_MARKERS.stockStatus, productId),
    getApi().Events.subscribeByMarker(EVENT_MARKERS.priceChange, productId),
  ]);

  return {
    stockSubscribed: !isError(stockResult) && stockResult === true,
    priceSubscribed: !isError(priceResult) && priceResult === true,
  };
}

/**
 * Отписаться от событий товара.
 */
export async function unsubscribeFromProductEvents(productId: number): Promise<{
  stockUnsubscribed: boolean;
  priceUnsubscribed: boolean;
}> {
  const [stockResult, priceResult] = await Promise.all([
    getApi().Events.unsubscribeByMarker(EVENT_MARKERS.stockStatus, productId),
    getApi().Events.unsubscribeByMarker(EVENT_MARKERS.priceChange, productId),
  ]);

  return {
    stockUnsubscribed: !isError(stockResult) && stockResult === true,
    priceUnsubscribed: !isError(priceResult) && priceResult === true,
  };
}

/**
 * Получить все активные подписки пользователя.
 */
export async function getUserSubscriptions(offset = 0, limit = 30) {
  const result = await getApi().Events.getAllSubscriptions(offset, limit);
  if (isError(result)) return null;
  return result;
}
```

---

## Шаг 3: Кнопка подписки на карточке товара

```tsx
// components/product/SubscribeButton.tsx
'use client';

import { useCallback, useContext, useState } from 'react';
import { AuthContext } from '@/app/store/providers/AuthContext'; // твой auth контекст
import {
  subscribeToProductEvents,
  unsubscribeFromProductEvents,
} from '@/app/api/hooks/useEvents';

export function SubscribeButton({ productId }: { productId: number }) {
  const { isAuth } = useContext(AuthContext);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!isAuth) {
      // перенаправить на логин или показать диалог
      return;
    }

    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeFromProductEvents(productId);
        setSubscribed(false);
      } else {
        const result = await subscribeToProductEvents(productId);
        if (result.stockSubscribed || result.priceSubscribed) {
          setSubscribed(true);
        }
      }
    } catch (e) {
      console.error('Events subscription error:', e);
    } finally {
      setLoading(false);
    }
  }, [isAuth, subscribed, productId]);

  if (!isAuth) return null; // показывать только авторизованным

  return (
    <button onClick={handleToggle} disabled={loading}>
      {loading
        ? 'Загрузка...'
        : subscribed
          ? 'Отписаться от уведомлений'
          : 'Уведомить о появлении'}
    </button>
  );
}
```

---

## Шаг 4: Интеграция с кнопкой избранного (опционально)

В реальном проекте подписка на события срабатывает при добавлении в избранное:

```tsx
// При добавлении в избранное — подписываемся на события
const handleAddToFavorites = async (product: IProductsEntity) => {
  dispatch(addFavorites(product.id));

  if (isAuth) {
    // Events работают через getApi() т.к. после логина вызван reDefine()
    const result = await subscribeToProductEvents(product.id);
    if (result.stockSubscribed) {
      toast('Уведомим когда появится в наличии');
    }
  }
};

// При удалении из избранного — отписываемся
const handleRemoveFromFavorites = async (productId: number) => {
  dispatch(removeFavorites(productId));

  if (isAuth) {
    await unsubscribeFromProductEvents(productId);
  }
};
```

---

## Шаг 5: Server Action для получения подписок (опционально)

Если нужно показать список подписок на странице профиля — используй `makeUserApi`:

```typescript
// app/actions/events.ts
'use server';

import { makeUserApi, isError } from '@/lib/oneentry';

export async function getUserEventSubscriptions(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);
  const result = await api.Events.getAllSubscriptions() as any;

  if (isError(result)) return { error: result.message, items: [] };

  return {
    items: result.items ?? [],
    total: result.total ?? 0,
    newToken: getNewToken(),
  };
}
```

---

## Важные детали

```md
✅ Созданы Events подписки. Ключевые правила:

1. Events требуют авторизации — вызывай только после логина
2. В Client Component: работает через getApi() ПОСЛЕ reDefine(refreshToken)
   В Server Action: нужен makeUserApi(refreshToken)
3. subscribeByMarker/unsubscribeByMarker возвращают boolean (true = успех)
4. Маркеры событий ('status_out_of_stock', 'product_price') — уточни в OneEntry Admin
5. Можно подписаться на несколько маркеров для одного товара — они независимы
6. getAllSubscriptions — для отображения списка подписок пользователя в профиле
```
