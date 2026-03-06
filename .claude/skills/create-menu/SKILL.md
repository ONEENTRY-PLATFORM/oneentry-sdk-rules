<!-- META
type: skill
skillConfig: {"name":"create-menu"}
-->

# Создать навигационное меню из OneEntry Menus API

Аргумент: `marker` (маркер меню в OneEntry, например `main_web`)

---

## Шаг 1: Определи маркер меню

Если аргумент не передан — получи список доступных меню:

```bash
# Читаем .env.local
cat .env.local

# Получаем все меню
curl -s "https://<URL>/api/content/menus?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Смотри поле `identifier` — это маркер для `getMenusByMarker()`.

Или используй `/inspect-api menus` для автоматического получения маркеров.

**⚠️ НЕ угадывай маркер** (`main`, `header`, `footer` и т.д.) — спроси у пользователя или получи через API.

---

## Шаг 2: Уточни детали у пользователя

Перед написанием кода узнай:

1. **Где размещать меню?** (Header, Footer, Sidebar, отдельный компонент?)
2. **Нужна ли иерархия?** (Выпадающие подменю или только верхний уровень?)
3. **Нужны ли URL-префиксы?** Например, некоторые пункты меню могут вести на `/shop/offer`, хотя в OneEntry их `pageUrl` просто `"offer"`. Если да — спроси список таких страниц и нужные префиксы.
4. **Есть ли "специальные" пункты?** Например, пункт `category` ведёт на `/shop`, но его дочерние элементы ведут на `/shop/category/{slug}`.

---

## Шаг 3: Прочитай тип меню в SDK

```bash
grep -r "IMenusEntity\|IMenusPages" node_modules/oneentry/dist --include="*.d.ts" -A 10
```

Ключевые поля `IMenusPages`:
- `id` — идентификатор пункта
- `parentId` — ID родителя (null для верхнего уровня)
- `pageUrl` — маркер страницы
- `localizeInfos.title` — название пункта
- `localizeInfos.menuTitle` — название в меню (альтернативное)

**⚠️ ВАЖНО:** Поля `children` НЕТ в API. Дочерние элементы находи через фильтрацию по `parentId`.

---

## Шаг 4: Создай компонент меню

### Базовый шаблон (Server Component, только верхний уровень)

```tsx
// components/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

export async function NavMenu({ locale }: { locale: string }) {
  const menu = await getApi().Menus.getMenusByMarker('YOUR_MARKER', locale);

  // Нормализуем: pages может быть массивом или одним объектом
  const pages = !isError(menu) && menu.pages
    ? (Array.isArray(menu.pages) ? menu.pages : [menu.pages])
    : [];

  // Пункты верхнего уровня (без parentId)
  const navItems = pages.filter((p: any) => !p.parentId);

  if (navItems.length === 0) return null;

  return (
    <nav>
      <ul>
        {navItems.map((item: any) => (
          <li key={item.id}>
            <Link href={`/${locale}/${item.pageUrl}`}>
              {item.localizeInfos?.title || item.localizeInfos?.menuTitle}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

### С иерархией (выпадающие подменю)

```tsx
// components/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

export async function NavMenu({ locale }: { locale: string }) {
  const menu = await getApi().Menus.getMenusByMarker('YOUR_MARKER', locale);

  const pages = !isError(menu) && menu.pages
    ? (Array.isArray(menu.pages) ? menu.pages : [menu.pages])
    : [];

  const navItems = pages.filter((p: any) => !p.parentId);

  if (navItems.length === 0) return null;

  return (
    <nav>
      <ul>
        {navItems.map((item: any) => {
          // Дочерние пункты для текущего элемента
          const children = pages.filter((p: any) => p.parentId === item.id);

          return (
            <li key={item.id}>
              <Link href={`/${locale}/${item.pageUrl}`}>
                {item.localizeInfos?.title || item.localizeInfos?.menuTitle}
              </Link>

              {/* Подменю — только если есть дочерние пункты */}
              {children.length > 0 && (
                <ul>
                  {children.map((child: any) => (
                    <li key={child.id}>
                      <Link href={`/${locale}/${child.pageUrl}`}>
                        {child.localizeInfos?.title || child.localizeInfos?.menuTitle}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

### С URL-префиксами (если пункты меню требуют нестандартных путей)

Используй этот вариант, если некоторые `pageUrl` из меню должны открываться по другому пути в приложении.

```tsx
// components/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

// Определяется исходя из структуры приложения:
// ключ — pageUrl из OneEntry, значение — реальный путь в приложении
const URL_OVERRIDES: Record<string, string> = {
  // Пример: 'offer' → 'shop/offer', 'category' → 'shop'
  // УТОЧНИ у пользователя!
};

// Страницы у которых дочерние элементы имеют особый путь
// Пример: дочерние 'category' ведут на 'shop/category/{child.pageUrl}'
const PARENT_CHILD_PREFIX: Record<string, string> = {
  // 'category': 'shop/category'
  // УТОЧНИ у пользователя!
};

function buildItemPath(item: any): string {
  return URL_OVERRIDES[item.pageUrl] ?? item.pageUrl;
}

function buildChildPath(parent: any, child: any): string {
  if (PARENT_CHILD_PREFIX[parent.pageUrl]) {
    return `${PARENT_CHILD_PREFIX[parent.pageUrl]}/${child.pageUrl}`;
  }
  // Стандартная логика: если child.pageUrl уже содержит parent.pageUrl — использовать как есть
  if (child.pageUrl?.startsWith(parent.pageUrl)) return child.pageUrl;
  return `${parent.pageUrl}/${child.pageUrl}`;
}

export async function NavMenu({ locale }: { locale: string }) {
  const menu = await getApi().Menus.getMenusByMarker('YOUR_MARKER', locale);

  const pages = !isError(menu) && menu.pages
    ? (Array.isArray(menu.pages) ? menu.pages : [menu.pages])
    : [];

  const navItems = pages.filter((p: any) => !p.parentId);

  return (
    <nav>
      <ul>
        {navItems.map((item: any) => {
          const children = pages.filter((p: any) => p.parentId === item.id);
          const itemPath = buildItemPath(item);

          return (
            <li key={item.id}>
              <Link href={`/${locale}/${itemPath}`}>
                {item.localizeInfos?.title || item.localizeInfos?.menuTitle}
              </Link>

              {children.length > 0 && (
                <ul>
                  {children.map((child: any) => (
                    <li key={child.id}>
                      <Link href={`/${locale}/${buildChildPath(item, child)}`}>
                        {child.localizeInfos?.title || child.localizeInfos?.menuTitle}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

---

## Шаг 5: Добавь использование в layout

```tsx
// app/[locale]/layout.tsx
import { NavMenu } from '@/components/NavMenu';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params; // ⚠️ Next.js 15+: params это Promise!

  return (
    <>
      <NavMenu locale={locale} />
      <main>{children}</main>
    </>
  );
}
```

---

## Шаг 6: Напомни ключевые правила

После создания файла выведи:

✅ Компонент создан. Ключевые правила:

```md
1. Поля children НЕТ в API — дочерние элементы: pages.filter(p => p.parentId === item.id)
2. pages может быть массивом или одним объектом — всегда нормализуй через Array.isArray()
3. Используй localizeInfos?.title || localizeInfos?.menuTitle для названия пункта
4. pageUrl = маркер ("about"), не путь роута ("/[locale]/about")
5. params в Next.js 15+ — это Promise, всегда await в layout/page
6. НЕ угадывай маркеры — получи через /inspect-api menus
```
