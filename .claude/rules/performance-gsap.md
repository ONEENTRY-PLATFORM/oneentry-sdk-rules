<!-- META
type: rules
fileName: performance-gsap.md
rulePaths: ["**/animations/**/*.tsx", "**/animations/**/*.ts", "**/*Animation*.tsx", "**/RegisterGSAP*.tsx"]
-->

# Performance: GSAP — OneEntry Rules

Rules for OneEntry-based applications using GSAP for animations. Covers plugin registration, scoping through `useGSAP`, and excluding the GSAP bundle from routes where it is not needed.

Applicable to projects that deliver `gsap` + `@gsap/react`.

## Register core and truly "greedy" plugins once, globally

`gsap.registerPlugin` is idempotent but must be executed before any timeline that depends on the plugin. Centralize in a single `RegisterGSAP` component mounted at the root of the application.

```tsx
// app/animations/RegisterGSAP.tsx
'use client';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';

import { useIsomorphicLayoutEffect } from './utils/useIsomorphicLayoutEffect';

const RegisterGSAP = () => {
  useIsomorphicLayoutEffect(() => {
    gsap.registerPlugin(useGSAP, ScrollTrigger);
    gsap.config({ autoSleep: 120, force3D: true, nullTargetWarn: false });
    // Custom effects (`gsap.registerEffect`) should also be here — they are cheap and reused everywhere.
  }, []);
  return null;
};

export default RegisterGSAP;

// app/layout.tsx
<body>
  <RegisterGSAP />
  …
</body>
```

**What should be in `RegisterGSAP`:** core GSAP, `useGSAP` (React adapter), `ScrollTrigger` — if any page uses scroll-based animations on the first render (product grids, hero section appearances).

**What should NOT be there:** plugins used only after specific user actions — see the next rule.

## ⚠️ Plugins used only after interaction — register lazily

`ScrollToPlugin`, `Draggable`, `Flip`, `MotionPathPlugin`, and similar are useful but heavy. If they trigger only after a click / route change / drag start — register them on the **first** call, not at app startup.

```typescript
// ❌ INCORRECT — plugin is eagerly loaded in every initial bundle
// app/animations/RegisterGSAP.tsx
import { ScrollToPlugin } from 'gsap/dist/ScrollToPlugin';

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

// ✅ CORRECT — plugin chunk is loaded on the first navigation it is needed
// app/animations/TransitionProvider.tsx
'use client';
import { gsap } from 'gsap';

let scrollToPluginRegistered = false;
let scrollToPluginPromise: Promise<void> | null = null;

const ensureScrollToPlugin = (): Promise<void> => {
  if (scrollToPluginRegistered) return Promise.resolve();
  if (!scrollToPluginPromise) {
    scrollToPluginPromise = import('gsap/dist/ScrollToPlugin').then((mod) => {
      gsap.registerPlugin(mod.ScrollToPlugin);
      scrollToPluginRegistered = true;
    });
  }
  return scrollToPluginPromise;
};

// Used inside the `leave` handler for route transitions:
const onLeave = (next: () => void) => {
  ensureScrollToPlugin();        // fire-and-forget; safely overlaps with exit tween
  const tl = gsap.timeline();
  if (scrollToPluginRegistered) {
    tl.to(window, { scrollTo: { y: 0, autoKill: false }, duration: 0.45, ease: 'power2.inOut' });
  } else {
    // Correct fallback — the first navigation may occur before the plugin loads
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  tl.to(el, { opacity: 0, y: -8, duration: 0.28 }).call(next);
};
```

### Decision Matrix: greedy or lazy

| Plugin / Module | Used on the first render of any page? | Where to register |
| --- | --- | --- |
| Core `gsap`, `useGSAP` | Always | `RegisterGSAP` |
| `ScrollTrigger` | Appearance of cards on scroll, hero reveal | `RegisterGSAP` |
| `ScrollToPlugin` | Smooth scroll on route change | Lazily in TransitionProvider |
| `Draggable` | Only in specific draggable widget | Lazily in that widget |
| `Flip` | Only in specific gallery / swap | Lazily in that component |
| `MotionPathPlugin` | Only in rare decorative animations | Lazily on first use |
| `MorphSVGPlugin`, `SplitText` (Club) | Only in specific effects | Lazily on first use |

## Limit `useGSAP` to animation subtree

`useGSAP({ scope })` limits selectors and cleanup to the bounds of the ref. Without it, queries traverse the entire document, and timelines leak between mount/unmount cycles.

```tsx
// ❌ INCORRECT — global selectors, GSAP traverses the entire DOM
const ProductCardAnimations = () => {
  useGSAP(() => {
    gsap.from('.product-card', { opacity: 0, y: 40, stagger: 0.05 });
  }, []);
  return null;
};

// ✅ CORRECT — limited by ref, animations are cleaned up on unmount
const ProductCardAnimations = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.from('.product-card', { opacity: 0, y: 40, stagger: 0.05 });
    },
    { scope: ref }
  );
  return <div ref={ref}>{children}</div>;
};
```

## ⚠️ Do not call `gsap.to(window, …)` without `ScrollToPlugin`

`scrollTo:` is a property added by `ScrollToPlugin`. Calling `gsap.to(window, { scrollTo: { y: 0 } })` without the registered plugin silently does nothing — no error, the user simply sees no animation.

```typescript
// ❌ INCORRECT — silent no-op if ScrollToPlugin is not yet loaded
gsap.to(window, { scrollTo: { y: 0 }, duration: 0.45 });

// ✅ CORRECT — protection via lazy loading flag (see pattern above)
await ensureScrollToPlugin();
gsap.to(window, { scrollTo: { y: 0 }, duration: 0.45 });

// ✅ ALSO CORRECT — fire-and-forget plus native fallback for the first call
ensureScrollToPlugin();
if (scrollToPluginRegistered) {
  gsap.to(window, { scrollTo: { y: 0 }, duration: 0.45 });
} else {
  window.scrollTo({ top: 0, behavior: 'auto' });
}
```

## `optimizePackageImports: ['gsap']` in `next.config`

GSAP exports many submodules. Tree-shaking via `optimizePackageImports` excludes unused submodules from the bundle.

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'gsap',
      '@gsap/react',
      // …other large libraries
    ],
  },
};
```

## Do not wrap route-critical animations in `IntersectionObserver`

GSAP animations for hero section / header appearance should trigger on the first render. `IntersectionObserver` adds measurable latency (round-trip of the first observation). Use it only for animations **below the fold** (product grids, footer elements).

```tsx
// ❌ INCORRECT — header appearance triggers with a delay of 50–200 ms due to IO
const HeaderAnimations = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useNearViewport(ref);
  useGSAP(() => {
    if (!isVisible) return;
    gsap.from('[data-header-anim="logo"]', { opacity: 0, y: -20 });
  }, [isVisible]);
  return <div ref={ref}>{children}</div>;
};

// ✅ CORRECT — header animates on mount; ScrollTrigger / IO — only for content below the fold
const HeaderAnimations = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.from('[data-header-anim="logo"]', { opacity: 0, y: -20 });
    },
    { scope: ref }
  );
  return <div ref={ref}>{children}</div>;
};

// Cards below the fold — here a ScrollTrigger is appropriate
const ProductCardAnimations = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.from('.product-card', {
        opacity: 0,
        y: 40,
        stagger: 0.05,
        scrollTrigger: { trigger: ref.current, start: 'top 90%' },
      });
    },
    { scope: ref }
  );
  return <div ref={ref}>{children}</div>;
};
```

## Stable type of root DOM node for animated containers

Animations write inline styles to target DOM nodes. If the parent re-renders a different type of element (e.g., `<button>` ↔ `<div>`), the new node loses these inline styles, and the CSS rules for pre-hiding are reapplied — the element disappears.

```tsx
// ❌ INCORRECT — root tag changes based on authentication state; opacity set by GSAP is lost
const NavItemProfile = () => {
  const { isAuth } = useContext(AuthContext);
  return isAuth ? <Link href="/profile">…</Link> : <button onClick={…}>…</button>;
};

// ✅ CORRECT — wrap both branches in the same root element
const NavItemProfile = () => {
  const { isAuth } = useContext(AuthContext);
  return (
    <div className="relative flex">
      {isAuth ? <Link href="/profile">…</Link> : <button onClick={…}>…</button>}
    </div>
  );
};
```

The wrapping `<div>` keeps the direct child `[data-header-anim="top-nav"]` (or whatever the animation selector targets) stable during state changes.

## Anti-patterns

- **Importing GSAP inside a server component** — `gsap` works only in the browser. Place it in files with `'use client'`.
- **`useEffect` with GSAP instead of `useGSAP`** — manual cleanup is error-prone. `useGSAP` from `@gsap/react` automatically performs `ctx.revert()`.
- **Greedy import of all plugins "just in case"** — each plugin weighs ~5–20 KB. Register them lazily if they trigger on interaction.
- **Reading from the DOM inside a GSAP tween** — read once before the timeline starts; tween from precomputed values.
- **Using `IntersectionObserver` for animations above the fold** — see the rule "route-critical animations."
- **Animating root nodes that change tag** — see the rule "stable root DOM."

## Checklist before commit

- [ ] `RegisterGSAP` is mounted at the root of the application with only core `gsap` + `useGSAP` + `ScrollTrigger`.
- [ ] Plugins that trigger on user actions (`ScrollToPlugin`, `Draggable`, `Flip`, …) are registered lazily on first use, with idempotent protection and promise deduplication.
- [ ] Each call to `useGSAP` has a ref in `{ scope }`.
- [ ] No `gsap.to(window, { scrollTo: … })` without `ensureScrollToPlugin()` (or native fallback).
- [ ] Animations above the fold trigger on mount; `ScrollTrigger` (or `useNearViewport` for cases without animation) is used for content below the fold.
- [ ] The type of the root DOM node of the animated container is stable during state changes.
- [ ] `next.config.ts` includes `gsap` (and `@gsap/react`) in `experimental.optimizePackageImports`.

> Related rules: `.claude/rules/performance.md` (lazy splitting of heavy libraries via `dynamic`), `.claude/rules/performance-popups.md` (animated popups via `DrawerAnimations`).
