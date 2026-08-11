---
paths:
  - "lib/**/*.ts"
  - "src/lib/**/*.ts"
  - "app/api/**/*.ts"
  - "src/app/api/**/*.ts"
---
# Profiling OneEntry Loaders

When the page "sometimes lags," we need to distinguish three reasons: a slow round-trip to OneEntry, a cache miss where a hit was expected, and a slow render. The logs `validation: { logErrors: true }` (see `.claude/rules/troubleshooting.md`) do not show this — measurement is required.

The rule for a **cheap** method: no APM, no external services, ~100 lines.

---

## 1. `withTiming` is placed OUTSIDE the cache

This is the only important aspect of the wrapper's placement. Inside `unstable_cache`, the measurement will always show the duration of the request itself — and a cache hit will be indistinguishable from a miss. Outside, a hit is visible as ~1 ms, a miss — as a real round-trip. **This split is the goal of the measurement.**

```typescript
// ✅ CORRECT — outside
export const getProduct = (id: number) =>
  withTiming(`product:${id}`, () => cachedGetProduct(id))

const cachedGetProduct = unstable_cache(
  async (id: number) => { /* … */ },
  ['product'],
  { revalidate: REVALIDATE_PRODUCT },
)

// ❌ INCORRECT — inside: cache hits are not visible
const cachedGetProduct = unstable_cache(
  async (id: number) => withTiming(`product:${id}`, () => fetchProduct(id)),
  ['product'],
  { revalidate: REVALIDATE_PRODUCT },
)
```

The same goes for React `cache()` — wrap it outside.

---

## 2. ⚠️ Buffer state pinned to `globalThis`

The main pitfall that causes profiling to "not work": Next compiles the same module into **multiple server bundles**. The route handler (`src/app/api/perf-dump/route.ts`) and the SSR page each get their own copy of the module with a private scope. `withTiming` writes to the ring of one bundle, the endpoint reads from the ring of another — the dump **is always empty**, even under load.

```typescript
const RING_KEY = '__oneentryTimingRing__'
type GlobalWithRing = typeof globalThis & { [RING_KEY]?: RingState }

function getRing(): RingState {
  const g = globalThis as GlobalWithRing
  let state = g[RING_KEY]
  if (!state) {
    state = { buffer: new Array(RING_CAPACITY), head: 0, count: 0 }
    g[RING_KEY] = state
  }
  return state
}
```

Side bonus: survives HMR in `next dev` — reloading the module does not affect `globalThis`.

---

## 3. Circular buffer, not an infinite array

```typescript
interface TimingRecord {
  name: string        // 'product:42' — with arguments, otherwise the culprit cannot be found
  durationMs: number
  ok: boolean         // false if the wrapped call threw
  ts: number
}

// ~10 minutes of load at ~3 calls/s per process: enough for a k6 run,
// without evicting early samples (otherwise p95 will skew).
const RING_CAPACITY = 5000
```

An array without limits in a long-lived Node process — a memory leak disguised as diagnostics.

---

## 4. Dump — under secrecy and `force-dynamic`

```typescript
// src/app/api/perf-dump/route.ts
export const dynamic = 'force-dynamic'  // otherwise Next will cache the response

export async function GET(req: Request) {
  const token = process.env.PERF_DUMP_TOKEN
  // without a token in env — the endpoint does not exist at all, not "open to everyone"
  if (!token || req.headers.get('x-perf-token') !== token) {
    return new Response('Not found', { status: 404 })
  }
  return Response.json(summarize(getRing()))
}
```

Return aggregates (count / p50 / p95 / max / share of `ok`) by `name`, not the raw ring: no one reads raw data of 5000 records, while p95 by loader name answers the question immediately.

A separate flag for enabling (`OE_PROFILE=1`) — measurement should not run in production by default. The same flag conveniently enables `logCaught` (see `.claude/rules/error-handling.md`): if you are profiling, you are already agreeing to noisy logs.

> `PERF_DUMP_TOKEN` — **without** the prefix `NEXT_PUBLIC_`, otherwise the secret will end up in the bundle (see `.claude/rules/security.md`).

---

## Checklist

1. `withTiming` outside `unstable_cache` / `cache()`.
2. Ring on `globalThis`, otherwise the dump is empty.
3. `name` contains call arguments: `product:42`, not `product`.
4. Ring capacity is limited.
5. Dump endpoint: `force-dynamic` + secret from env without `NEXT_PUBLIC_`, 404 when token is missing.
6. Profiling is enabled by a flag, not always.

> Related rules: `.claude/rules/isr-config.md` (what is cached and for how long), `.claude/rules/performance.md` (strategies), `.claude/rules/error-handling.md` (`logCaught` for swallowed errors).
