<!-- META
type: rules
fileName: security.md
rulePaths: ["next.config.ts","middleware.ts","app/**/*.tsx","components/**/*.tsx"]
paths:
  - "next.config.ts"
  - "middleware.ts"
  - "app/**/*.tsx"
  - "components/**/*.tsx"
-->

# Frontend Security on OneEntry — CSP, Headers, CMS-HTML Sanitization

The architecture of OneEntry necessitates two decisions that are not secure by themselves:

- **App Token lives in the bundle** (`NEXT_PUBLIC_ONEENTRY_URL` / `NEXT_PUBLIC_ONEENTRY_TOKEN`) — the SDK is isomorphic, public methods are called from the browser.
- **Customer session lives in `localStorage`**, not in httpOnly cookies — the refresh token is tied to the browser's `x-device-metadata`, and server-side storage breaks rotation (see `.claude/rules/tokens.md`).

Both decisions are correct, but together they mean: **any script that runs on the page can take the customer session**. This rule is about how this is compensated.

---

## 1. CMS-HTML Sanitization — mandatory

`localizeInfos.htmlContent` (pages, blocks) and `attributeValues.*.value.htmlValue` (attributes of type `text`) — this is HTML from the admin panel editor. It goes into `dangerouslySetInnerHTML`, and this is the **only** channel through which foreign markup can enter the DOM of the storefront.

**Threat model** — a compromised or unscrupulous content manager account. The surface is narrow, but the cost is the customer session from `localStorage`.

```tsx
// ❌ INCORRECT — raw HTML from CMS
<div dangerouslySetInnerHTML={{ __html: page.localizeInfos?.htmlContent || '' }} />

// ✅ CORRECT
import { sanitizeHtml } from '@/lib/sanitize-html'
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.localizeInfos?.htmlContent) }} />
```

### The sanitizer must be isomorphic

Insertion points are Client Components, but Next renders them **on the server** as well. Sanitization only in the browser means: raw payload goes into the initial HTML and executes **before hydration**. Therefore, DOM sanitizers (DOMPurify without jsdom) are not suitable — a tokenizer on strings is needed, working the same in both runtimes.

### Allow-list, not block-list

Collect the result from the allowed, rather than cutting out the known bad: anything unaccounted for is then discarded, rather than passing through.

```typescript
// lib/sanitize-html.ts — list composition

// Allowed tags: text, lists, headings, tables, a/img/figure
const ALLOWED_TAGS = new Set(['p','br','hr','span','div','strong','b','em','i','u','s','del','ins',
  'mark','small','sub','sup','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','h5','h6',
  'a','img','figure','figcaption','table','thead','tbody','tfoot','tr','th','td','caption'])

// Removed TOGETHER WITH CONTENT. svg/math/template/noscript switch the parser mode — a classic way to sneak markup past a naive filter.
const DROP_WITH_CONTENT = new Set(['script','style','iframe','object','embed','applet','noscript',
  'template','svg','math','form','input','button','select','option','textarea','link','meta','base',
  'title','head','frame','frameset','audio','video','source','track','canvas','portal'])

// Attributes — one by one per tag. class and style are NOT included in the list.
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  td: new Set(['colspan', 'rowspan']),
  ol: new Set(['start']),
}
const GLOBAL_ATTRS = new Set(['title', 'dir', 'lang'])
```

**Why `class` and `style` are outside the list:** they do not execute scripts, but on a Tailwind storefront `class="fixed inset-0 z-50"` — a ready-made clickjacking overlay over the payment button. The same goes for `style` with `position:fixed`.

### Four traps where a naive sanitizer leaks

1. **URL schemes are decoded by the browser before checking.** `java&#09;script:` and `&#106;avascript:` execute. Normalize entities and control characters **before** checking the scheme, and discard `javascript:`, `vbscript:`, `data:`, `blob:`, `file:`, `about:`.

   ```typescript
   // NUL, tab, newline, spaces are ignored by the URL parser: `java	script:` — working payload
   const cleaned = decodeEntities(value).replace(/[\u0000-\u0020]+/g, '').toLowerCase()
   return !/^(javascript|vbscript|livescript|mocha|data|blob|file|about):/.test(cleaned)
   ```

2. **`<[^>]*>` for tag parsing — leaky regex:** `>` inside quotes breaks the token, and the tail of the attribute list leaks into the output as text. The tokenizer must allow `>` in quoted values.

3. **Duplicate attribute.** `href="ok" href="javascript:…"` — browsers take the **first** occurrence; repeat this rule, otherwise the checked value will lose to the unchecked one.

4. **`target="_blank"` without `rel`** gives the opened page access to `window.opener`. Set `rel="noopener noreferrer"` **instead of** the author's, not in addition.

Escape `<` and `"`. Do not touch `&` — the editor already delivers entities, and re-escaping will show `&amp;nbsp;` in the text.

> The sanitizer is an ideal candidate for unit tests on fixtures: see `.claude/rules/unit-testing.md`.

---

## 2. CSP — not about blocking scripts, but about leak channels

`script-src` in the App Router **must** contain `'unsafe-inline'`: RSC payload is streamed with inline `<script>`. The nonce alternative requires per-request rendering — that is, it kills ISR across the entire site. Do not try to "fix" this.

The value of CSP here is one step later: to close the channels through which injected code **exports** the stolen token.

```typescript
// next.config.ts
const isDev = process.env.NODE_ENV !== 'production'

/** Tenant origin — from env, so that the policy follows the project, not hardcoded. */
const oneEntryOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_ONEENTRY_URL ?? ''
  try { return raw ? new URL(raw).origin : '' } catch { return '' }
})()

const cspDirectives: Array<[string, string[]]> = [
  ['default-src', ["'self'"]],
  // 'unsafe-eval' — requirement of React Fast Refresh, only in dev
  ['script-src', ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['font-src', ["'self'", 'data:']],
  ['img-src', ["'self'", 'data:', 'blob:', 'https://*.oneentry.cloud']],
  ['connect-src', ["'self'", 'https://*.oneentry.cloud', 'wss://*.oneentry.cloud',
    ...(oneEntryOrigin ? [oneEntryOrigin] : []),
    ...(isDev ? ['ws:', 'http://localhost:*'] : [])]],
  ['frame-src', ["'none'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],       // blocks <base href> substitution
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
  ['upgrade-insecure-requests', []],
]

const contentSecurityPolicy = cspDirectives
  .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(' ')}` : name))
  .join('; ')
```

Key directives — `connect-src`, `img-src`, `form-action`, `base-uri`: these prevent injected code from sending the token to a foreign host. `wss://` is needed if the `WS` module (event subscriptions) is used.

> `connect-src` is built from `NEXT_PUBLIC_ONEENTRY_URL`, **not hardcoded**: each project has its own subdomain, and a hardcoded origin silently breaks the production of another tenant.

---

## 3. Minimum set of headers

```typescript
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Duplicates frame-ancestors in modern browsers, cheaply insures in others
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,   // do not disclose the stack
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
```

---

## 4. Secrets and env

- In `NEXT_PUBLIC_*` — only what will go to the browser anyway: project URL and App Token. Everything else (admin credentials, `PERF_DUMP_TOKEN`, payment keys) — without a prefix, only on the server.
- Credentials for the internal admin API — **only from env**, never in code and in the repository (see `.claude/rules/admin-api.md`, `.claude/rules/admin-ui.md`).
- `.mcp.json` is committed to the repository — do not write the token there, use substitution `${NEXT_PUBLIC_ONEENTRY_TOKEN:-}` (see skill `/setup-oneentry`).
- `remotePatterns` in `images` — specific hosts, never `hostname: '**'` (SSRF through image optimizer); details — `.claude/rules/performance-images.md`.

---

## 5. What is deliberately absent here

- **httpOnly cookie for the session** — does not work with the refresh token tied to the browser fingerprint. If the project does switch to cookies, this is a conscious deviation: document it in `MISMATCH-LOG.md` (see `.claude/rules/mismatch-log.md`).
- **Hiding the App Token** — impossible by design: public SDK methods are called from the browser. Limit not the token, but the rights of the "Guests" group in the admin panel.

---

## Checklist

1. All points `dangerouslySetInnerHTML` go through `sanitizeHtml` — check `grep -rn 'dangerouslySetInnerHTML' app components`.
2. The sanitizer is isomorphic (string tokenizer), not DOM-based.
3. `class` and `style` are not in the allow-list; `svg`/`math`/`template`/`noscript` are removed with content.
4. CSP is built from env, `connect-src` includes the tenant origin and `wss://` when using WS.
5. `poweredByHeader: false`, five headers from section 3 are returned on all routes.
6. E2E spec checks headers **and absence of CSP violations in the console** — a CSP that silently cuts off fonts is worse than none (see `.claude/rules/playwright-e2e.md`).
