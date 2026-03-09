<!-- META
type: skill
skillConfig: {"name":"create-menu"}
-->

# Create a Navigation Menu from OneEntry Menus API

Argument: `marker` (menu marker in OneEntry, e.g. `main_web`)

---

## Step 1: Define the Menu Marker

If the argument is not provided — get a list of available menus:

```bash
# Read .env.local
cat .env.local

# Get all menus
curl -s "https://<URL>/api/content/menus?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Look at the `identifier` field — this is the marker for `getMenusByMarker()`.

Or use `/inspect-api menus` for automatic retrieval of markers.

**⚠️ DO NOT guess the marker** (`main`, `header`, `footer`, etc.) — ask the user or retrieve it via the API.

---

## Step 2: Clarify Details with the User

Before writing code, find out:

1. **Where to place the menu?** (Header, Footer, Sidebar, separate component?)
2. **Is hierarchy needed?** (Dropdown submenus or only top level?)
3. **Are URL prefixes needed?** For example, some menu items may lead to `/shop/offer`, while in OneEntry their `pageUrl` is simply `"offer"`. If yes — ask for a list of such pages and the required prefixes.
4. **Are there any "special" items?** For example, the `category` item leads to `/shop`, but its child elements lead to `/shop/category/{slug}`.

---

## Step 3: Read the Menu Type in SDK

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

## Step 4: Create the Menu Component

### Basic Template (Server Component, only top level)

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

### With Hierarchy (Dropdown Submenus)

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

### With URL Prefixes (if menu items require non-standard paths)

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

// Pages whose child elements have a special path
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

## Step 5: Add Usage in Layout

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

## Step 6: Remind Key Rules

After creating the file, output:

✅ Component created. Key rules:

```md
1. The children field is NOT in the API — child elements: pages.filter(p => p.parentId === item.id)
2. pages can be an array or a single object — always normalize using Array.isArray()
3. Use localizeInfos?.title || localizeInfos?.menuTitle for the item name
4. pageUrl = marker ("about"), not the route path ("/[locale]/about")
5. params in Next.js 15+ — is a Promise, always await in layout/page
6. DO NOT guess markers — retrieve them via /inspect-api menus
```
