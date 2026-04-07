---
name: create-menu
description: Create navigation menu from OneEntry Menus API
---
# Create navigation menu from OneEntry Menus API

Argument: `marker` (menu marker in OneEntry, for example `main_web`)

---

## Step 1: Define the menu marker

If the argument is not provided — get a list of available menus:

Run `/inspect-api menus` — the skill uses the SDK and will return a list of `identifier` markers.

**⚠️ DO NOT guess the marker** (`main`, `header`, `footer`, etc.) — ask the user or get it through the API.

---

## Step 2: Clarify details with the user

Before writing the code, find out:

1. **Where to place the menu?** (Header, Footer, Sidebar, separate component?)
2. **Is hierarchy needed?** (Dropdown submenus or only top level?)
3. **Are URL prefixes needed?** For example, some menu items may lead to `/shop/offer`, while in OneEntry their `pageUrl` is simply `"offer"`. If yes — ask for the list of such pages and the required prefixes.
4. **Are there any "special" items?** For example, the `category` item leads to `/shop`, but its child elements lead to `/shop/category/{slug}`.

---

## Step 3: Read the menu type in the SDK

```bash
grep -r "IMenusEntity\|IMenusPages" node_modules/oneentry/dist --include="*.d.ts" -A 10
```

Key fields of `IMenusPages`:
- `id` — item identifier
- `parentId` — parent ID (null for top level)
- `pageUrl` — page marker
- `localizeInfos.title` — item name
- `localizeInfos.menuTitle` — name in the menu (alternative)

**⚠️ IMPORTANT:** The `children` field is NOT in the API. Find child elements by filtering by `parentId`.

---

## Step 4: Create the menu component

### Basic template (Server Component, only top level)

```tsx
// components/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

export async function NavMenu({ locale }: { locale: string }) {
  const menu = await getApi().Menus.getMenusByMarker('YOUR_MARKER', locale);

  // Normalize: pages can be an array or a single object
  const pages = !isError(menu) && menu.pages
    ? (Array.isArray(menu.pages) ? menu.pages : [menu.pages])
    : [];

  // Top level items (without parentId)
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

### With hierarchy (dropdown submenus)

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
          // Child items for the current element
          const children = pages.filter((p: any) => p.parentId === item.id);

          return (
            <li key={item.id}>
              <Link href={`/${locale}/${item.pageUrl}`}>
                {item.localizeInfos?.title || item.localizeInfos?.menuTitle}
              </Link>

              {/* Submenu — only if there are child items */}
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

### With URL prefixes (if menu items require non-standard paths)

Use this option if some `pageUrl` from the menu should open at a different path in the application.

```tsx
// components/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

// Defined based on the application structure:
// key — pageUrl from OneEntry, value — actual path in the application
const URL_OVERRIDES: Record<string, string> = {
  // Example: 'offer' → 'shop/offer', 'category' → 'shop'
  // CLARIFY with the user!
};

// Pages where child elements have a special path
// Example: child 'category' leads to 'shop/category/{child.pageUrl}'
const PARENT_CHILD_PREFIX: Record<string, string> = {
  // 'category': 'shop/category'
  // CLARIFY with the user!
};

function buildItemPath(item: any): string {
  return URL_OVERRIDES[item.pageUrl] ?? item.pageUrl;
}

function buildChildPath(parent: any, child: any): string {
  if (PARENT_CHILD_PREFIX[parent.pageUrl]) {
    return `${PARENT_CHILD_PREFIX[parent.pageUrl]}/${child.pageUrl}`;
  }
  // Standard logic: if child.pageUrl already contains parent.pageUrl — use as is
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

## Step 5: Add usage in layout

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
  const { locale } = await params; // ⚠️ Next.js 15+: params is a Promise!

  return (
    <>
      <NavMenu locale={locale} />
      <main>{children}</main>
    </>
  );
}
```

---

## Step 6: Remind key rules

After creating the file, output:

✅ Component created. Key rules:

```md
1. The children field is NOT in the API — child elements: pages.filter(p => p.parentId === item.id)
2. pages can be an array or a single object — always normalize using Array.isArray()
3. Use localizeInfos?.title || localizeInfos?.menuTitle for the item name
4. pageUrl = marker ("about"), not the route path ("/[locale]/about")
5. params in Next.js 15+ — is a Promise, always await in layout/page
6. DO NOT guess markers — get them through /inspect-api menus
```
