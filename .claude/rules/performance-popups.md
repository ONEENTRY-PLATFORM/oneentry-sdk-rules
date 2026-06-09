<!-- META
type: rules
fileName: performance-popups.md
rulePaths: ["components/**/*Popup*.tsx", "components/**/*Modal*.tsx", "components/**/*Drawer*.tsx", "app/**/layout.tsx"]
-->

# Performance: Popups and Drawers — OneEntry Rules

Rules for OneEntry-based applications with a layer of drawers/modals (cart, profile, favorites, booking, authentication forms). Accompanied by `.claude/rules/performance.md` — which covers SSR / lazy loading / parallelism in general, while this document specifically addresses how to keep popup chunks **out** of the initial bundle.

Applicable to projects with a popup system based on context (usually `OpenDrawerContext` with the value `{ open, component, setOpen, setComponent }`).

## ⚠️ Never render all popups directly in `RootLayout`

`dynamic(() => import('./CartPopup'))` creates a code-split point — but the chunk loads as soon as the parent renders the component, **even if the popup returns `<></>` when `!isOpen`**. With 5–7 popups in the layout, that's 5–7 chunks (~150–300 KB JS) on the first render — code that the user will never invoke.

```tsx
// ❌ INCORRECT — each popup chunk is included in the initial bundle
// app/layout.tsx
const CartPopup = dynamic(() => import('@/components/cart/CartPopup'));
const FavoritesPopup = dynamic(() => import('@/components/profile/FavoritesPopup'));
const ProfilePopup = dynamic(() => import('@/components/profile/ProfilePopup'));
const ReservationPopup = dynamic(() => import('@/components/reservation/ReservationPopup'));
const Modal = dynamic(() => import('@/components/layout/modal'));

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <OpenDrawerProvider>
          {children}
          <CartPopup />
          <FavoritesPopup />
          <ProfilePopup />
          <ReservationPopup />
          <Modal />
        </OpenDrawerProvider>
      </body>
    </html>
  );
}

// ✅ CORRECT — one PopupRoot subscribes to the context and mounts only the active popup
// app/layout.tsx
import PopupRoot from '@/components/layout/PopupRoot';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <OpenDrawerProvider>
          {children}
          <PopupRoot />
        </OpenDrawerProvider>
      </body>
    </html>
  );
}
```

## Pattern `popupRegistry` + `PopupRoot`

Two files. The registry is the single source of truth for popup loaders: both `PopupRoot` (which mounts) and `prefetchPopup` (which preloads on hover) use the same map.

### `components/layout/popupRegistry.ts`

```typescript
type PopupLoader = () => Promise<unknown>;

export const popupLoaders = {
  CartPopup: () => import('@/components/cart/CartPopup'),
  FavoritesPopup: () => import('@/components/profile/FavoritesPopup'),
  ProfilePopup: () => import('@/components/profile/ProfilePopup'),
  ReservationPopup: () => import('@/components/reservation/ReservationPopup'),
  // Modal contains all forms (SignInForm, SignUpForm, ContactUsForm, …) — one chunk
  Modal: () => import('@/components/layout/modal'),
} as const satisfies Record<string, PopupLoader>;

export type PopupName = keyof typeof popupLoaders;

const DRAWER_POPUPS = new Set<string>([
  'CartPopup',
  'FavoritesPopup',
  'ProfilePopup',
  'ReservationPopup',
]);

const prefetched = new Set<string>();

export const prefetchPopup = (name: string): void => {
  if (!name || prefetched.has(name)) return;
  // Forms (SignInForm, AuthProviderSelect, …) share one Modal chunk.
  const target = DRAWER_POPUPS.has(name) ? (name as PopupName) : 'Modal';
  if (prefetched.has(target)) {
    prefetched.add(name);
    return;
  }
  prefetched.add(name);
  prefetched.add(target);
  popupLoaders[target]().catch(() => {
    prefetched.delete(name);
    prefetched.delete(target);
  });
};
```

### `components/layout/PopupRoot.tsx`

```tsx
'use client';
import dynamic from 'next/dynamic';
import { type JSX, useContext } from 'react';

import { OpenDrawerContext } from '@/store/OpenDrawerContext';
import { popupLoaders } from './popupRegistry';

const CartPopup = dynamic(popupLoaders.CartPopup);
const FavoritesPopup = dynamic(popupLoaders.FavoritesPopup);
const ProfilePopup = dynamic(popupLoaders.ProfilePopup);
const ReservationPopup = dynamic(popupLoaders.ReservationPopup);
const Modal = dynamic(popupLoaders.Modal);

const DRAWER_COMPONENTS = new Set([
  'CartPopup',
  'FavoritesPopup',
  'ProfilePopup',
  'ReservationPopup',
]);

const PopupRoot = (): JSX.Element | null => {
  const { open, component } = useContext(OpenDrawerContext);
  if (!open || !component) return null;

  if (component === 'CartPopup') return <CartPopup />;
  if (component === 'FavoritesPopup') return <FavoritesPopup />;
  if (component === 'ProfilePopup') return <ProfilePopup />;
  if (component === 'ReservationPopup') return <ReservationPopup />;
  // Anything that is not a drawer is a form name (`SignInForm`, `AuthProviderSelect`, …) → hosted by Modal
  if (!DRAWER_COMPONENTS.has(component)) return <Modal />;
  return null;
};

export default PopupRoot;
```

## ⚠️ Preload popup chunks on hover/focus of the trigger

The button that opens the popup should preload the chunk on `onPointerEnter` and `onFocus`. ~50–200 ms between hovering and clicking is usually enough for the chunk to load — and the popup will open instantly.

```tsx
// ❌ INCORRECT — chunk starts loading only after click; visible delay of 100–500 ms
<button onClick={() => { setComponent('CartPopup'); setOpen(true); }}>
  Cart
</button>

// ✅ CORRECT — preloads chunk before click; idempotent, safe on touch devices
import { prefetchPopup } from '@/components/layout/popupRegistry';

<button
  onClick={() => { setComponent('CartPopup'); setOpen(true); }}
  onPointerEnter={() => prefetchPopup('CartPopup')}
  onFocus={() => prefetchPopup('CartPopup')}
>
  Cart
</button>
```

`onPointerEnter` covers mouse hover. `onFocus` covers keyboard navigation. Touch devices simply skip preloading (no hover event) and get the original "load on click" behavior — without regression.

For forms hosted in Modal, pass the form name — `prefetchPopup` resolves it to the Modal chunk:

```tsx
<button
  onClick={() => { setComponent('AuthProviderSelect'); setOpen(true); }}
  onPointerEnter={() => prefetchPopup('AuthProviderSelect')}
  onFocus={() => prefetchPopup('AuthProviderSelect')}
>
  Sign in
</button>
```

## ⚠️ Each popup should gate its own content

`PopupRoot` already returns `null` when nothing is active. However, the popup component itself should still protect against rendering content when it is not active — in case of direct mounting (in tests, in storybook, on profile pages where the same component is embedded).

```tsx
// ❌ INCORRECT — renders DOM wrapper and triggers effects, even when another popup is active
const CartPopup = (): JSX.Element => {
  const { open, component } = useContext(OpenDrawerContext);
  return (
    <DrawerAnimations>
      <div className="…">…</div>
    </DrawerAnimations>
  );
};

// ✅ CORRECT — early return if this popup is not active
const CartPopup = (): JSX.Element => {
  const { open, component } = useContext(OpenDrawerContext);
  const isOpen = open && component === 'CartPopup';
  if (!isOpen) return <></>;

  return (
    <DrawerAnimations>
      <div className="…">…</div>
    </DrawerAnimations>
  );
};
```

## Skip requests inside closed popups

If a popup loads content via RTK Query / SWR, the request **must** be skipped while the popup is closed — otherwise, it will trigger on initial mounting, which defeats the purpose of lazy loading the chunk.

```tsx
// ❌ INCORRECT — `useGetProductsByIdsQuery` triggers on mounting PopupRoot
const CartPopup = () => {
  const cartIds = useAppSelector(selectCartIds);
  const { data } = useGetProductsByIdsQuery({ ids: cartIds });
  // …
};

// ✅ CORRECT — request is gated by isOpen
const CartPopup = () => {
  const { open, component } = useContext(OpenDrawerContext);
  const isOpen = open && component === 'CartPopup';
  const cartIds = useAppSelector(selectCartIds);
  const { data } = useGetProductsByIdsQuery(
    { ids: cartIds },
    { skip: !isOpen || cartIds.length === 0 }
  );
  // …
};
```

## Adding a new popup — checklist

1. Create a component with an early return based on `isOpen` (see above).
2. Add a loader entry in `popupRegistry.popupLoaders`:

   ```typescript
   NewPopup: () => import('@/components/path/to/NewPopup'),
   ```

3. If it is a **drawer** (not a form rendered inside Modal), add it to `DRAWER_POPUPS` in `popupRegistry.ts` AND to `DRAWER_COMPONENTS` in `PopupRoot.tsx` + add an explicit branch `if (component === 'NewPopup') return <NewPopup />;`.
4. If it is a **form** rendered inside Modal, no further action is needed in PopupRoot — it will be picked up by the general branch `<Modal />`.
5. Add `onPointerEnter={() => prefetchPopup('NewPopup')}` + `onFocus={...}` to each trigger button.

## Anti-patterns

- **Rendering JSX of the popup directly in layout/page** — bypasses `PopupRoot`, breaking lazy chunk splitting.
- **`dynamic({ ssr: true })` for popups** — popups are never visible during SSR (user interaction is required). Use `ssr: false` or simply `dynamic(loader)` (Next.js disables SSR for client components by default).
- **Multiple instances of `OpenDrawerProvider`** — context loses state between them. Mount once at the root of the layout.
- **Calling `prefetchPopup` inside `useEffect`** — loses the purpose. Bind to user intent events (`onPointerEnter`, `onFocus`).
- **Calling `prefetchPopup` in a tight render loop** — it is idempotent, but still performs Set-lookup on each call; bind once or use event handlers.

> Related rules: `.claude/rules/performance.md` (splitting heavy libraries into chunks, lazy mounting patterns), `.claude/rules/auth-provider.md` (authentication forms hosted in Modal).
