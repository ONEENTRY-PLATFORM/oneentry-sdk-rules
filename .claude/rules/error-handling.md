---
paths:
  - "lib/oneentry.ts"
  - "src/lib/oneentry.ts"
  - "lib/oneentry/**/*.ts"
  - "src/lib/oneentry/**/*.ts"
  - "app/actions/**/*.ts"
  - "src/app/actions/**/*.ts"
---
# Error Handling in OneEntry SDK — Advanced Patterns

The basic rule (`isError` + `IError` structure) is in CLAUDE.md, section "Error Handling". Here is what you need for large projects.

## Centralized handler — `ApiError` + `handleApiError`

In projects with many SDK call sites, it is convenient to extract error normalization into one place: `src/app/utils/errorHandler.ts`. This provides:

- a consistent error shape at all levels (`ApiError` extends `Error` + `.statusCode` + `.originalError`);
- a unified log collector with `handle` (caller name) and `timestamp`;
- mapping status code → user-facing message in one place.

```typescript
// src/app/utils/errorHandler.ts
import type { IError } from 'oneentry';
import { toast } from 'react-toastify'; // or your toast library

export class ApiError extends Error {
  statusCode: number;
  originalError?: unknown;

  constructor(message: string, statusCode: number, originalError?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

export function isIError(error: unknown): error is IError {
  return typeof error === 'object' && error !== null && 'statusCode' in error && 'message' in error;
}

export function handleApiError(handle: string, error: unknown): ApiError {
  if (isIError(error)) {
    console.log('API Error:', { handle, message: error.message, statusCode: error.statusCode, timestamp: new Date().toISOString() });
    return new ApiError(String(error.message) || 'An error occurred', error.statusCode || 500, error);
  }
  if (error instanceof Error) {
    console.log('Generic Error:', { handle, message: error.message, timestamp: new Date().toISOString() });
    return new ApiError(error.message || 'An error occurred', 500, error);
  }
  console.log('Unknown Error:', { handle, error, timestamp: new Date().toISOString() });
  return new ApiError('An unknown error occurred', 500, error);
}

// Optional hook — toast + ApiError in one call
export function useApiErrorHandler() {
  return (error: unknown): ApiError => {
    const apiError = handleApiError('useApiErrorHandler', error);
    toast.error(apiError.message);
    return apiError;
  };
}

// Mapping by status codes — user-friendly text
export function formatErrorMessage(error: unknown, defaultMessage = 'An error occurred'): string {
  if (isIError(error)) {
    switch (error.statusCode) {
      case 400: return 'Bad Request: Please check your input';
      case 401: return 'Unauthorized: Please log in';
      case 403: return 'Forbidden: You do not have permission';
      case 404: return 'Not Found: The requested resource was not found';
      case 500: return 'Internal Server Error: Please try again later';
      default:  return Array.isArray(error.message) ? error.message.join('; ') : (error.message || defaultMessage);
    }
  }
  return error instanceof Error ? (error.message || defaultMessage) : defaultMessage;
}
```

**Usage on the call site:**

```typescript
import { handleApiError } from '@/app/utils/errorHandler';

try {
  const order = await getApi().Orders.createOrder(storage, body);
  if (isError(order)) {
    // isShell:true (default) — HTTP error returned as IError (has statusCode)
    const e = handleApiError('createOrder', order);
    return { ok: false, error: e.message };
  }
  return { ok: true, orderId: order.id };
} catch (e) {
  // we only reach here with isShell:false (or non-SDK throw).
  // With default isShell:true, the network and unparsed response do NOT throw,
  // but return as a value — with v1.0.168/1.0.169 they have a statusCode, see below.
  const apiError = handleApiError('createOrder', e);
  return { ok: false, error: apiError.message };
}
```

## `statusCode: 0` — no response from the platform (v1.0.168 / v1.0.169)

Before 1.0.168, a connection drop with default `isShell: true` returned as a thrown `TypeError`, which serialized to `{}`: neither `statusCode` nor message, and `isError` did not catch such a value. "No connection" could not be distinguished from "no data" — on one site, such a value ended up in the page cache and was served minutes after the connection was restored, while the static build baked the site from 404 and reported success.

Now both cases of "no useful response received" are described the same way:

```ts
// request did not reach the platform (drop, timeout, DNS) — v1.0.168
{ statusCode: 0, message: 'TypeError: fetch failed', pageData: null, timestamp: '…' }

// response came, but it's not JSON — v1.0.169. The platform can respond 200 OK
// with content-type: text/html and its own admin page in the body (CMS-957)
{ statusCode: 0, message: 'Expected JSON from the platform, received text/html (HTTP 200): <!DOCTYPE html>…' }
```

- **`statusCode: 0` — a value that no HTTP response has.** Treat it as "no response": do not cache, do not count as an empty result, during build — fail the build, not write 404 to the page.
- If non-JSON came with an unsuccessful code, the code that the server actually sent (`502` etc.) is preserved, and the message also names the received `content-type`.
- `isError` catches both: the value has `statusCode` and `message`. Distinguish "no response" from platform error by `statusCode === 0`:

```ts
if (isError(result)) {
  if (result.statusCode === 0) {
    // there was no response: retry, degrade to cache, fail build
  }
  // otherwise — the platform responded and explained what went wrong
}
```

> ⚠️ `isError` (SDK guard) and `isIError` (local) duplicate each other — in new projects use one: either `isError` from `@/lib/oneentry`, or `isIError` from `errorHandler.ts`. Not both.

## Normalizing `message`

The type declares `message: string`, but when form validator errors (`postFormsData`) occur, the API actually sends **an array of strings**:

```typescript
function normalizeErrorMessage(message: string | string[]): string {
  return Array.isArray(message) ? message.join('; ') : message
}
// Usage: return { error: normalizeErrorMessage(result.message) }
```

## "Resource is closed" — graceful fallback

`statusCode: 403` + `message: "Resource is closed"` means that the resource is not open in the admin panel (the page, form, block is not configured). This **is not a real authorization error** — it is a signal that "the admin has not set it up yet". Handle it as an empty result and log the item in `mismatch-log.md` (Section C):

```typescript
const reviews = await getProductReviews(productId);
// graceful fallback: will return [] instead of throw if the review_form is not open in the admin panel
```

## Trail for intentionally swallowed errors

`handleApiError` is for errors that **are returned upwards**. It does not cover another, more common case: the loader returned `null`/`[]` from `catch`, the section simply did not render, the error object did not reach anyone. The showcase looks operational, but half of the blocks are empty — and it is unclear whether to fix the content or the code.

A tiny logger in each `catch` of degradation paths is sufficient:

```typescript
// src/lib/oneentry/log.ts
const explicitlyEnabled = process.env.OE_LOG_CAUGHT === '1' || process.env.OE_PROFILE === '1'
// dev logs by default, prod — only by flag
const enabled = explicitlyEnabled || process.env.NODE_ENV !== 'production'

export function logCaught(scope: string, err: unknown): void {
  if (!enabled) return
  console.warn(`[oe] ${scope} swallowed:`, err)
}

// in the loader
try {
  const res = await getApi().Blocks.getBlockByMarker(marker)
  if (isError(res)) return null
  return res
} catch (err) {
  logCaught(`blocks.getBlockByMarker(${marker})`, err)
  return null
}
```

The difference from `handleApiError` is that it logs **always**; here, a switchable log in production is needed, otherwise, expected degradation (unclosed resource, empty collection) clutters the logs. Write `scope` with call arguments: `blocks.getBlockByMarker(hero)` finds the problem immediately, `error in loader` does not.

> Degradation **during build** — a separate case, there you need `console.warn` without a flag: see `.claude/rules/troubleshooting.md`. Profiling the same loaders — `.claude/rules/observability.md`.

## Response Codes

| Code | Value | What to do |
| --- | --- | --- |
| 400 | Bad Request | check the request body — see `troubleshooting.md` |
| 401 | Unauthorized | no or expired token — retry with token from localStorage, log out only after retry |
| 403 | Forbidden | group permissions in the admin panel (`/admin-grant-permissions`) or auth method called from the server |
| 404 | Not Found | marker does not exist — check via `/inspect-api` |
| 429 | Rate Limit | backoff |
| 500, 502, 503, 504 | Server Error | retry, then graceful fallback |

A complete breakdown of specific messages — `troubleshooting.md`.
