<!-- META
type: skill
skillConfig: {"name":"create-menu"}
-->

# Create Navigation Menu from OneEntry Menus API

Argument: `marker` (menu marker in OneEntry, e.g. `main_web`)

---

## Step 1: Determine the menu marker

If no argument is passed — get the list of available menus:

```bash
# Read .env.local
cat .env.local

# Get all menus
curl -s "https://<URL>/api/content/menus?langCode=en_US" \
  -H "x-app-token: <TOKEN>" | python -m json.tool
```

Look at the `identifier` field — this is the marker for `getMenusByMarker()`.

Or use `/inspect-api menus` for automatic marker retrieval.

**⚠️ DON'T guess the marker** (`main`, `header`, `footer`, etc.) — ask the user or get it via API.

---

## Step 2: Clarify details with the user

Before writing code, find out:

1. **Where to place the menu?** (Header, Footer, Sidebar, separate component?)
2. **Is hierarchy needed?** (Dropdown submenus or top level only?)
3. **Are URL prefixes needed?** For example, some menu items may link to `/shop/offer`, but their `pageUrl` in OneEntry is just `"offer"`. If yes — ask for the list of such pages and the needed prefixes.
4. **Are there "special" items?** For example, a `category` item links to `/shop`, but its children link to `/shop/category/{slug}`.

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
- `localizeInfos.menuTitle` — name in menu (alternative)

**⚠️ IMPORTANT:** There is NO `children` field in the API. Find child elements by filtering by `parentId`.

---

## Step 4: Create the menu component

### Basic template (Server Component, top level only)

```tsx
// components/layout/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

export async function NavMenu({ locale }: { locale: string }) {
  const menu = await getApi().Menus.getMenusByMarker('YOUR_MARKER', locale);

  // Normalize: pages may be an array or a single object
  const pages = !isError(menu) && menu.pages
    ? (Array.isArray(menu.pages) ? menu.pages : [menu.pages])
    : [];

  // Top-level items (no parentId)
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
// components/layout/NavMenu.tsx
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

              {/* Submenu — only if there are children */}
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

Use this variant if some `pageUrl` values from the menu should open at a different path in the app.

```tsx
// components/layout/NavMenu.tsx
import Link from 'next/link';
import { getApi, isError } from '@/lib/oneentry';

// Determined from the app structure:
// key — pageUrl from OneEntry, value — real path in the app
const URL_OVERRIDES: Record<string, string> = {
  // Example: 'offer' → 'shop/offer', 'category' → 'shop'
  // CONFIRM WITH USER!
};

// Pages whose children have a special path
// Example: 'category' children link to 'shop/category/{child.pageUrl}'
const PARENT_CHILD_PREFIX: Record<string, string> = {
  // 'category': 'shop/category'
  // CONFIRM WITH USER!
};

function buildItemPath(item: any): string {
  return URL_OVERRIDES[item.pageUrl] ?? item.pageUrl;
}

function buildChildPath(parent: any, child: any): string {
  if (PARENT_CHILD_PREFIX[parent.pageUrl]) {
    return `${PARENT_CHILD_PREFIX[parent.pageUrl]}/${child.pageUrl}`;
  }
  // Standard logic: if child.pageUrl already contains parent.pageUrl — use as-is
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
import { NavMenu } from '@/components/layout/NavMenu';

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

## Step 6: Remind of key rules

After creating the file output:

✅ Component created. Key rules:

```md
1. No 'children' field in API — child elements: pages.filter(p => p.parentId === item.id)
2. pages may be an array or a single object — always normalize via Array.isArray()
3. Use localizeInfos?.title || localizeInfos?.menuTitle for item name
4. pageUrl = marker ("about"), not route path ("/[locale]/about")
5. params in Next.js 15+ is a Promise — always await in layout/page
6. DON'T guess markers — get via /inspect-api menus
```
