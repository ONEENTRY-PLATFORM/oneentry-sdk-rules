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
import type { IError } from 'oneentry/dist/base/utils';
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
  // we only get here if isShell:false (or non-SDK throw).
  // With default isShell:true, network/parsing/unexpected do NOT throw, but
  // are returned as order value (raw Error without statusCode → isError does not catch it).
  const apiError = handleApiError('createOrder', e);
  return { ok: false, error: apiError.message };
}
```

> ⚠️ `isError` (SDK guard) and `isIError` (local) duplicate each other — in new projects use one: either `isError` from `@/lib/oneentry`, or `isIError` from `errorHandler.ts`. Not both.

## Normalizing `message`

The type declares `message: string`, but in case of form validator errors (`postFormsData`), the API actually sends **an array of strings**:

```typescript
function normalizeErrorMessage(message: string | string[]): string {
  return Array.isArray(message) ? message.join('; ') : message
}
// Usage: return { error: normalizeErrorMessage(result.message) }
```

## "Resource is closed" — graceful fallback

`statusCode: 403` + `message: "Resource is closed"` means that the resource is not open in the admin panel (the page, form, block is not configured). This is **not a real authorization error** — it is a signal that "the admin has not set it up yet". Handle it as an empty result and log the item in `mismatch-log.md` (Section C):

```typescript
const reviews = await getProductReviews(productId);
// graceful fallback: will return [] instead of throw if the review_form is not open in the admin panel
```

## Trace for intentionally swallowed errors

`handleApiError` is for errors that are **returned upwards**. It does not cover another, more common case: the loader returned `null`/`[]` from `catch`, the section simply did not render, the error object did not reach anyone. The showcase looks functional, but half of the blocks are empty — and it is unclear whether to fix the content or the code.

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

The difference from `handleApiError` is that it logs **always**; here a toggleable trace is needed in production, otherwise the expected degradation (unclosed resource, empty collection) clutters the logs. Write `scope` with call arguments: `blocks.getBlockByMarker(hero)` finds the problem immediately, `error in loader` does not.

> Degradation **during assembly** is a separate case, where `console.warn` is needed without a flag: see `.claude/rules/troubleshooting.md`. Profiling the same loaders — `.claude/rules/observability.md`.

## Response Codes

| Code | Value | What to do |
| --- | --- | --- |
| 400 | Bad Request | check the request body — see `troubleshooting.md` |
| 401 | Unauthorized | token is missing or expired — retry with the token from localStorage, only log out after retry |
| 403 | Forbidden | group permissions in the admin panel (`/admin-grant-permissions`) or auth method called from the server |
| 404 | Not Found | marker does not exist — check via `/inspect-api` |
| 429 | Rate Limit | backoff |
| 500, 502, 503, 504 | Server Error | retry, then graceful fallback |

A complete breakdown of specific messages — `troubleshooting.md`.
