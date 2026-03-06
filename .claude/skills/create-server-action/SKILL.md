<!-- META
type: skill
skillConfig: {"name":"create-server-action"}
-->

# Создание серверного действия

## Шаг 1: Определи модуль и целевой файл

Разбери аргумент на `Module` и `method`. Определи файл:
| Модуль                                  | Файл                      | Тип                     |
|-----------------------------------------|---------------------------|-------------------------|
| `Forms`                                 | `app/actions/forms.ts`    | public (getApi)         |
| `AuthProvider`                          | `app/actions/auth.ts`     | public (getApi)         |
| `Pages`, `Products`, `Menus`, `Blocks`  | `app/actions/<module>.ts` | public (getApi)         |
| `Orders`, `Users`, `Payments`           | `app/actions/user.ts`     | user-auth (makeUserApi) |

## Шаг 2: Прочитай существующий файл

Если файл уже существует — прочитай его, чтобы не дублировать импорты и `isError`.

## Шаг 3: Найди TypeScript интерфейс в SDK

Выполни поиск в `node_modules/oneentry/dist/` чтобы найти правильный тип возвращаемого значения:

```bash
grep -r "interface I" node_modules/oneentry/dist/<module>/ --include="*.d.ts" -l
```

## Шаг 4: Создай или дополни файл

### Для public методов (Forms, AuthProvider, Pages, Products и т.д.)

```typescript
'use server';

import { getApi } from '@/lib/oneentry';
import { isError } from '@/lib/oneentry';
import type { IFormsEntity } from 'oneentry/dist/forms/formsInterfaces';

export async function getFormByMarker(marker: string, locale?: string) {
  const result = await getApi().Forms.getFormByMarker(marker, locale) as IFormsEntity;

  if (isError(result)) {
    return { error: result.message, statusCode: result.statusCode };
  }

  return result;
}
```

### Для user-authorized методов (Orders, Users, Payments)

```typescript
'use server';

import { makeUserApi, isError } from '@/lib/oneentry';
import type { IUserEntity } from 'oneentry/dist/users/usersInterfaces';

// ⚠️ ОДИН инстанс makeUserApi на все связанные вызовы в одной функции!
// Каждый вызов makeUserApi сжигает refreshToken через /refresh
export async function getUserProfile(refreshToken: string) {
  const { api, getNewToken } = makeUserApi(refreshToken);

  const user = await api.Users.getUser() as IUserEntity;

  if (isError(user)) {
    return { error: user.message, statusCode: user.statusCode };
  }

  return { ...user, newToken: getNewToken() };
}
```

## Шаг 5: Выведи инструкцию по использованию

После создания файла покажи пример использования из Client Component:

```typescript
// components/MyComponent.tsx
'use client';

import { getFormByMarker } from '@/app/actions/forms';

export function MyComponent() {
  useEffect(() => {
    async function load() {
      const result = await getFormByMarker('my-form', 'en_US');
      if ('error' in result) {
        console.error(result.error);
        return;
      }
      // result — это IFormsEntity
    }
    load();
  }, []);
}
```

Для user-auth методов напомни:

⚠️ Сохрани newToken обратно в localStorage после каждого вызова:
localStorage.setItem('refresh-token', result.newToken)
