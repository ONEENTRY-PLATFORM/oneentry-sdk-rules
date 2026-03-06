<!-- META
type: rules
fileName: server-actions.md
rulePaths: ["app/actions/**/*.ts"]
-->

# Server Actions — правила OneEntry

## Когда использовать Server Actions

Server Actions — **один из паттернов**, а не единственный способ вызова SDK. Выбор зависит от типа операции:

| Операция | Рекомендуемый подход | Причина |
| --- | --- | --- |
| Публичные данные (Pages, Products, Menus) | Server Component напрямую / Server Action / Client Component | Зависит от стратегии рендеринга (SSR/SSG/CSR) |
| Авторизация (auth, signUp, generateCode) | **Client Component напрямую** | ⚠️ SDK передаёт fingerprint устройства — на клиенте fingerprint уникален для каждого устройства пользователя |
| Пользовательские данные (Orders, Users) | Server Action с `makeUserApi()` | Безопасность токена, серверная логика |
| Мутации (отправка форм, создание заказов) | Server Action | Серверная валидация |

## Обязательно (для Server Actions)

- Директива `'use server'` в начале файла
- **Только `async function` экспорты** — Next.js запрещает экспортировать константы, типы и обычные функции из `'use server'` файлов. Выноси их в отдельный файл (например `src/lib/constants.ts`)

```typescript
// ❌ НЕПРАВИЛЬНО — ошибка: Only async functions are allowed to be exported
'use server';
export const PAGE_SIZE = 10;

// ✅ ПРАВИЛЬНО — константа в отдельном файле
// src/lib/constants.ts
export const PAGE_SIZE = 10;

// src/app/actions/products.ts
'use server';
import { PAGE_SIZE } from '@/lib/constants';
export async function loadProducts(...) { ... }
```

- Всегда проверяй результат через `isError(result)`
- Возвращай `{ error: string; statusCode?: number }` при ошибке (нужно для retry-логики на клиенте)

## Публичные методы (Forms, Pages, Products, Menus, Blocks)

> Эти методы можно вызывать и из Server Component напрямую, и из Client Component. Server Action — удобный прокси, но не обязательный.

```typescript
import { getApi, isError } from '@/lib/oneentry';

export async function myAction(...) {
  const result = await getApi().SomeModule.someMethod(...);
  if (isError(result)) return { error: result.message, statusCode: result.statusCode };
  return result;
}
```

## ⚠️ AuthProvider — НЕ через Server Action

Методы `auth`, `signUp`, `generateCode`, `checkCode` **вызывать из Client Component напрямую** — SDK передаёт fingerprint устройства. На сервере в `deviceInfo.browser` будет `"Node.js/..."` вместо реального браузера пользователя.

```typescript
// ❌ НЕПРАВИЛЬНО — auth в Server Action
'use server';
export async function signIn(authData) {
  return await getApi().AuthProvider.auth('email', { authData }); // browser в fingerprint = Node.js
}

// ✅ ПРАВИЛЬНО — auth из Client Component
'use client';
import { getApi, isError } from '@/lib/oneentry';
const result = await getApi().AuthProvider.auth('email', { authData }); // fingerprint = браузер
```

> Подробные правила: `.claude/rules/auth-provider.md`

## User-authorized методы (Orders, Users, Payments, etc.)

```typescript
import { makeUserApi, isError } from '@/lib/oneentry';

// ⚠️ ОДИН makeUserApi на все вызовы в функции!
// Каждый вызов сжигает refreshToken через /refresh → второй вызов → 401
export async function myUserAction(refreshToken: string, ...) {
  const { api, getNewToken } = makeUserApi(refreshToken);

  const result = await api.Users.getUser();
  if (isError(result)) return { error: result.message, statusCode: result.statusCode };

  // Если нужен второй вызов — используй тот же api, не создавай новый makeUserApi!
  const orders = await api.Orders.getAllOrdersByMarker('storage');
  if (isError(orders)) return { error: orders.message, statusCode: orders.statusCode };

  return { ...result, newToken: getNewToken() }; // ← всегда возвращай новый токен!
}
```

## Методы и их рекомендуемые подходы

| Методы | Подход | Тип |
| --- | --- | --- |
| AuthProvider (auth, signUp, generateCode, checkCode) | **Client Component напрямую** | `getApi()` на клиенте |
| AuthProvider (getAuthProviders, getAuthProviderByMarker) | Server Component / Server Action / Client | `getApi()` |
| Pages, Products, Menus, Blocks | Server Component / Server Action / Client | `getApi()` |
| Forms (getFormByMarker) | Server Component / Server Action / Client | `getApi()` |
| FormData (postFormsData) | Server Action или Client Component | `getApi()` |
| Orders, Users, Payments, Events | Server Action | `makeUserApi()` |

## Прямой вызов SDK из Client Component

SDK доступен на клиенте благодаря `NEXT_PUBLIC_*` переменным окружения. Допустимые случаи:

- **Авторизация** — обязательно на клиенте (fingerprint)
- **Динамические данные** — поиск, фильтрация, загрузка по действию пользователя
- **CSR-стратегия** — когда SSR не нужен

```tsx
'use client';
import { getApi, isError } from '@/lib/oneentry';

// Поиск — клиентский вызов
async function handleSearch(query: string) {
  const results = await getApi().Products.searchProducts({ name: query });
  if (isError(results)) return [];
  return results;
}
```
