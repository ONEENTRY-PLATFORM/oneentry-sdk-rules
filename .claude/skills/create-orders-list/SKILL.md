<!-- META
type: skill
skillConfig: {"name":"create-orders-list"}
-->

# Страница списка заказов пользователя

Создаёт Client Component со списком заказов: загрузка через все хранилища, отмена, повтор, пагинация.

---

## Шаг 1: Создай Server Actions

> Если `app/actions/orders.ts` уже существует — прочитай и дополни, не дублируй.

```typescript
// app/actions/orders.ts
'use server';

import { defineOneEntry } from 'oneentry';
import type { IOrdersEntity, IOrderByMarkerEntity } from 'oneentry/dist/orders/ordersInterfaces';

const PROJECT_URL = process.env.NEXT_PUBLIC_ONEENTRY_URL as string;
const APP_TOKEN = process.env.NEXT_PUBLIC_ONEENTRY_TOKEN as string;

/**
 * ВАЖНО: каждый вызов makeUserApi потребляет refreshToken через /refresh.
 * Объединяй все вызовы в одном инстансе.
 */
function makeUserApi(refreshToken: string) {
  let capturedToken = refreshToken;
  const api = defineOneEntry(PROJECT_URL, {
    token: APP_TOKEN,
    auth: {
      refreshToken,
      saveFunction: async (token: string) => { capturedToken = token; },
    },
    errors: { isShell: false },
  });
  return { api, getNewToken: () => capturedToken };
}

/**
 * Загружает ВСЕ заказы пользователя через все хранилища — ОДИН /refresh вызов.
 * storageIdToMarker нужен для cancelOrder (order.storageId → storageMarker).
 */
export async function loadAllOrders(refreshToken: string): Promise<
  | { orders: IOrderByMarkerEntity[]; storageIdToMarker: Record<number, string>; newToken: string }
  | { error: string; statusCode?: number }
> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  try {
    const storages = (await api.Orders.getAllOrdersStorage()) as IOrdersEntity[];

    const allOrders: IOrderByMarkerEntity[] = [];
    const storageIdToMarker: Record<number, string> = {};

    for (const storage of storages) {
      if (!storage.identifier) continue;
      storageIdToMarker[storage.id] = storage.identifier;
      try {
        const result = await api.Orders.getAllOrdersByMarker(storage.identifier);
        if (result && 'items' in result) {
          allOrders.push(...(result as any).items);
        }
      } catch {
        // пропустить недоступное хранилище
      }
    }

    return { orders: allOrders, storageIdToMarker, newToken: getNewToken() };
  } catch (error: any) {
    return { error: error.message, statusCode: error.statusCode };
  }
}

/**
 * Отменяет заказ: updateOrderByMarkerAndId с statusMarker: 'canceled'.
 * storageMarker получается из storageIdToMarker[order.storageId].
 */
export async function cancelOrder(
  refreshToken: string,
  storageMarker: string,
  orderId: number,
  order: {
    formIdentifier: string;
    paymentAccountIdentifier: string;
    formData: { marker: string; type: string; value: any }[];
    products: { id: number; quantity: number }[];
  },
): Promise<{ newToken: string } | { error: string; statusCode?: number }> {
  const { api, getNewToken } = makeUserApi(refreshToken);
  try {
    await api.Orders.updateOrderByMarkerAndId(storageMarker, orderId, {
      formIdentifier: order.formIdentifier,
      paymentAccountIdentifier: order.paymentAccountIdentifier,
      formData: order.formData,
      products: order.products.map((p) => ({ productId: p.id, quantity: p.quantity })),
      statusMarker: 'canceled',
    } as any);
    return { newToken: getNewToken() };
  } catch (error: any) {
    return { error: error.message, statusCode: error.statusCode };
  }
}
```

---

## Шаг 2: Создай компонент страницы заказов

### Ключевые принципы

- `'use client'` + `useParams()` — НЕ серверный компонент
- `loadAllOrders` — один инстанс обходит все хранилища
- **Token race condition:** retry на 401 с актуальным `localStorage.getItem('refreshToken')`
- **storageIdToMarker** — маппинг `storage.id → storage.identifier` для `cancelOrder`
- **previewImage** — может быть массив или объект → нормализовать: `Array.isArray(img) ? img[0] : img`
- **Сортировка** по `createdDate` по убыванию (новые сначала)
- **Пагинация** — клиентская, через `visibleCount` + кнопка "Load more"
- **Повтор заказа** — `addToCart` для каждого товара из `order.products`

### app/[locale]/(account)/orders/page.tsx

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { loadAllOrders, cancelOrder } from '@/app/actions/orders';
import type { IOrderByMarkerEntity, IOrderProducts } from 'oneentry/dist/orders/ordersInterfaces';

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const params = useParams();
  const locale = (params.locale as string) || 'en_US';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<IOrderByMarkerEntity[]>([]);
  const [storageIdToMarker, setStorageIdToMarker] = useState<Record<number, string>>({});
  const [openOrders, setOpenOrders] = useState<Set<number>>(new Set());
  const [cancelingIds, setCancelingIds] = useState<Set<number>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);
    loadOrders(refreshToken);
  }, []);

  const loadOrders = async (token: string) => {
    try {
      let result = await loadAllOrders(token);

      // Race condition: другая операция могла уже обновить токен
      if ('error' in result && result.statusCode === 401) {
        const currentToken = localStorage.getItem('refreshToken');
        if (currentToken && currentToken !== token) {
          result = await loadAllOrders(currentToken);
        }
      }

      if ('error' in result) {
        // Разлогинивать ТОЛЬКО при подтверждённой auth-ошибке
        if (result.statusCode === 401 || result.statusCode === 403) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setIsLoggedIn(false);
          window.dispatchEvent(new Event('auth-change'));
        }
        return;
      }

      if (result.newToken) {
        localStorage.setItem('refreshToken', result.newToken);
      }

      setStorageIdToMarker(result.storageIdToMarker);

      // Сортируем: новые заказы сначала
      const sorted = [...result.orders].sort(
        (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
      );
      setOrders(sorted);
    } catch {
      // Network error — не разлогинивать
    } finally {
      setLoading(false);
    }
  };

  const toggleOrder = (id: number) => {
    setOpenOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCancel = async (order: IOrderByMarkerEntity) => {
    const token = localStorage.getItem('refreshToken');
    if (!token) return;

    // storageMarker получается из маппинга по order.storageId
    const storageMarker = storageIdToMarker[order.storageId];
    if (!storageMarker) return;

    setCancelingIds((prev) => new Set(prev).add(order.id));
    try {
      const result = await cancelOrder(token, storageMarker, order.id, {
        formIdentifier: order.formIdentifier || '',
        paymentAccountIdentifier: order.paymentAccountIdentifier || '',
        formData: order.formData as { marker: string; type: string; value: any }[],
        products: order.products.map((p) => ({ id: p.id, quantity: p.quantity })),
      });

      if ('newToken' in result) {
        localStorage.setItem('refreshToken', result.newToken);
        // Обновляем статус локально без перезагрузки
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id ? { ...o, statusIdentifier: 'canceled' } : o,
          ),
        );
      }
    } finally {
      setCancelingIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  // Добавить товары заказа в корзину (передай addToCart из CartContext)
  const handleRepeat = (order: IOrderByMarkerEntity) => {
    order.products.forEach((p) => {
      // addToCart(p.id) — подключи CartContext если нужно
      console.log('repeat product', p.id);
    });
  };

  if (loading) return <div>Loading...</div>;

  if (!isLoggedIn) {
    return (
      <div>
        <p>Please log in to view your orders</p>
        {/* Здесь показать AuthForm в модалке или редирект */}
      </div>
    );
  }

  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  return (
    <div>
      {orders.length === 0 && <p>No orders yet</p>}

      {visibleOrders.map((order) => {
        const isOpen = openOrders.has(order.id);
        const isCanceled = order.statusIdentifier === 'canceled';
        const isCreated = order.statusIdentifier === 'created';

        return (
          <div key={`${order.storageId}-${order.id}`}>
            {/* Строка заказа — клик разворачивает детали */}
            <button onClick={() => toggleOrder(order.id)}>
              <span>{new Date(order.createdDate).toLocaleDateString()}</span>
              <span>${Number(order.totalSum).toFixed(2)}</span>
              <span>{order.statusIdentifier}</span>
            </button>

            {/* Развёрнутые детали */}
            {isOpen && (
              <div>
                {/* Товары */}
                {order.products.map((product) => {
                  const imageUrl = getProductImage(product);
                  return (
                    <div key={product.id}>
                      {imageUrl && <img src={imageUrl} alt={product.title} />}
                      <div>{product.title}</div>
                      <div>x{product.quantity} — ${Number(product.price).toFixed(2)}</div>
                    </div>
                  );
                })}

                {/* Поля формы заказа */}
                {order.formData.map((field) => (
                  <div key={field.marker}>
                    <b>{field.marker}:</b> {String(field.value ?? '')}
                  </div>
                ))}

                <div><b>Total:</b> ${Number(order.totalSum).toFixed(2)}</div>

                {/* Кнопки действий */}
                {isCanceled && (
                  <button onClick={() => handleRepeat(order)}>Repeat order</button>
                )}
                {isCreated && (
                  <>
                    <button
                      disabled={cancelingIds.has(order.id)}
                      onClick={() => handleCancel(order)}
                    >
                      {cancelingIds.has(order.id) ? 'Canceling...' : 'Cancel order'}
                    </button>
                    {order.paymentUrl && (
                      <a href={order.paymentUrl} target="_blank" rel="noopener noreferrer">
                        Go to pay
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Клиентская пагинация */}
      {hasMore && (
        <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
          Load more
        </button>
      )}
    </div>
  );
}

/**
 * previewImage может быть массивом (тип image) или объектом (тип file).
 * Нормализуем и берём downloadLink.
 */
function getProductImage(product: IOrderProducts): string | null {
  const img = product.previewImage as any;
  if (!img) return null;
  const entry = Array.isArray(img) ? img[0] : img;
  return entry?.downloadLink || entry?.previewLink || null;
}
```

---

## Шаг 3: Напомни ключевые правила

✅ Страница заказов создана. Ключевые правила:

```md
1. loadAllOrders — ОДИН makeUserApi на все хранилища (один /refresh)
2. storageIdToMarker: storage.id → identifier — нужен для cancelOrder
3. Retry на 401 с актуальным localStorage.getItem('refreshToken')
4. Разлогинивать ТОЛЬКО при 401/403 после retry
5. previewImage может быть массивом или объектом — нормализуй через Array.isArray()
6. Сортировка заказов по createdDate по убыванию
7. Клиентская пагинация через visibleCount — не перезагружать список
8. cancelOrder обновляет статус локально (setOrders), без reload
9. Repeat order: addToCart(p.id) для каждого товара из order.products
```
