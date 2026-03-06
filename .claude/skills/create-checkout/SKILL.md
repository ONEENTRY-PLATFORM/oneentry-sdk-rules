<!-- META
type: skill
skillConfig: {"name":"create-checkout"}
-->

# Создать страницу оформления заказа OneEntry

Создаёт Server Action для получения данных формы доставки и полный цикл оформления заказа.

---

## Шаг 1: Узнай маркер хранилища заказов

Форма доставки привязана к хранилищу заказов (`formIdentifier`). Маркер можно не знать заранее — он получается динамически из `getAllOrdersStorage()`.

Если нужно знать заранее:

```bash
cat .env.local
curl -s "https://<URL>/api/content/orders/storage" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
# Смотри поле "identifier" и "formIdentifier"
```

---

## Шаг 2: Создай Server Action для получения данных checkout

Файл: `app/actions/orders.ts`

```typescript
'use server';

import { getApi, makeUserApi, isError } from '@/lib/oneentry';

// ⚠️ ОДИН makeUserApi на все user-auth вызовы в функции!
// Каждый вызов сжигает refreshToken через /refresh
export async function getCheckoutData(refreshToken: string, locale: string) {
  const { api: userApi } = makeUserApi(refreshToken);

  const storages = await userApi.Orders.getAllOrdersStorage();
  if (isError(storages) || !storages.length) {
    return { error: 'No order storage found' };
  }

  const storage = storages[0];
  const formIdentifier = storage.formIdentifier;

  // Форма — публичный API, используем getApi()
  const form = await getApi().Forms.getFormByMarker(formIdentifier, locale);
  if (isError(form)) return { error: form.message };

  const attrs = Array.isArray(form.attributes)
    ? form.attributes
    : Object.values(form.attributes || {});

  const formAttributes = (attrs as any[]).map((attr: any) => ({
    marker: attr.marker,
    type: attr.type,
    localizeInfos: attr.localizeInfos,
    position: attr.position,
    value: attr.value, // нужно для timeInterval: содержит доступные слоты
  })).sort((a: any, b: any) => a.position - b.position);

  return {
    storageIdentifier: storage.identifier,
    formIdentifier,
    formAttributes,
  };
}

export async function createOrder(
  refreshToken: string,
  storageMarker: string,
  formIdentifier: string,
  paymentAccountIdentifier: string,
  formData: { marker: string; value: string }[],
  products: { id: number; quantity: number }[],
) {
  // ⚠️ Один инстанс для createOrder + createSession
  const { api, getNewToken } = makeUserApi(refreshToken);

  const order = await api.Orders.createOrder(storageMarker, {
    formIdentifier,
    paymentAccountIdentifier,
    formData,
    products,
  } as any);

  if (isError(order)) return { error: order.message };

  const session = await api.Payments.createSession(order.id, 'session', false) as any;
  if (isError(session)) return { error: session.message };

  return {
    orderId: order.id,
    sessionUrl: session.url,
    newToken: getNewToken(),
  };
}
```

---

## Шаг 3: Работа с timeInterval на клиенте

Поле `timeInterval` в форме = **список доступных слотов доставки** (не введённые данные).

**Структура value:**

```typescript
// value — массив пар [startISO, endISO] в UTC
[
  ["2026-03-15T09:00:00.000Z", "2026-03-15T10:00:00.000Z"],
  ["2026-03-15T11:00:00.000Z", "2026-03-15T12:00:00.000Z"],
]
```

**Утилиты для работы с интервалами:**

```typescript
// Парсинг
function parseTimeIntervals(value: any): [string, string][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is [string, string] => Array.isArray(item) && item.length === 2,
  );
}

// Слоты для выбранной даты — фильтрация через UTC-сравнение
function filterIntervalsByDate(intervals: [string, string][], date: Date): [string, string][] {
  const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);
  return intervals.filter(([start, end]) => {
    const iStart = new Date(start);
    const iEnd = new Date(end);
    return iStart < endOfDay && iEnd > startOfDay;
  });
}

// Уникальные доступные даты (сравниваем UTC-дату)
function getAvailableDates(intervals: [string, string][]): Set<string> {
  const dates = new Set<string>();
  intervals.forEach(([start]) => {
    const d = new Date(start);
    dates.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  });
  return dates;
}

// Время слота — из UTC часов/минут
function formatSlotTime(startISO: string): string {
  const d = new Date(startISO);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h}:${m === 0 ? '00' : m}`;
}
```

**Использование в компоненте:**

```typescript
const timeIntervalAttr = formAttributes.find((a) => a.type === 'timeInterval');
const intervals = timeIntervalAttr ? parseTimeIntervals(timeIntervalAttr.value) : [];
const availableDates = getAvailableDates(intervals);

// Для react-calendar — отключить недоступные даты:
function tileDisabled({ date, view }: { date: Date; view: string }) {
  if (view !== 'month') return false;
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
  return availableDates.size > 0 ? !availableDates.has(key) : false;
}

// Слоты для выбранной даты:
const slots = selectedDate
  ? filterIntervalsByDate(intervals, selectedDate).map((interval) => ({
      time: formatSlotTime(interval[0]),
      interval, // [startISO, endISO] — сохранить для отправки
    }))
  : [];
```

**Формат для отправки в форме заказа:**

```typescript
// Выбранный слот оборачивается в массив:
formData.push({
  marker: timeIntervalAttr.marker,
  type: 'timeInterval',
  value: [selectedInterval], // [[startISO, endISO]] — обёртка обязательна!
});
```

> ⚠️ `value: [selectedInterval]` — не `value: selectedInterval`. Выбранный `[start, end]` всегда оборачивается в массив.

---

## Шаг 4: Напомни ключевые правила

> Правила работы с токенами (makeUserApi, getNewToken): `.claude/rules/tokens.md`

```md
✅ Создан checkout flow. Ключевые правила:

1. makeUserApi — ОДИН инстанс на все вызовы (getAllOrdersStorage + createOrder + createSession)
2. Форма доставки: formIdentifier берётся из storage, НЕ хардкодится
3. timeInterval.value = доступные слоты [[start, end], ...], НЕ введённые данные
4. createSession вызывается через тот же api инстанс что и createOrder
5. Сохрани getNewToken() обратно в localStorage после успешного заказа
6. paymentAccountIdentifier — спроси у пользователя или получи из /inspect-api
```
