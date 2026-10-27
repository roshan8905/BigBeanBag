# BigBeanBag Performance Audit

**Target:** `https://bigbeanbag.vercel.app/`  
**Audit date:** 2026-10-27  
**Audit vantage point:** India (`bom1` edge)  
**API function region:** `iad1` (US East)  
**Database region:** `ap-southeast-1` (Singapore, Neon)  
**Application code:** not modified. All tooling lives in `perf/`.

## Scope and method

- Lighthouse 12 mobile (5 runs) and desktop (5 runs), medians reported.
- `curl` header, compression, cache, HTTP-version, and security-header checks.
- Vite production bundle with `rollup-plugin-visualizer`; per-module attribution with `source-map-explorer`.
- REST timing: 30 requests per endpoint, spread over time, p50/p95/p99 and error rate.
- Prisma hot-path review: queue fetch, vote, room join, snapshot broadcast.
- Socket.IO load: 5, 20, and 50 clients, isolated test room, fan-out and reconnect measurements.
- Gentle autocannon ramp capped at 50 connections and 20 requests/second.
- One YouTube search, two link resolves, and two queue adds (a 4:09 track and an 8:10 track); no YouTube/Spotify load tests.
- Test room `ADGZNY` (`cmvqo5axd0001jm0857fudiqt`) was created for authenticated tests and deleted at the end.

## Headline metrics

| Metric | Mobile | Desktop | Target | Result |
|---|---:|---:|---:|---|
| Performance score | 99 | 100 | - | PASS |
| LCP | 1,756.97 ms | 447.80 ms | < 2,500 ms | PASS |
| INP | not measured (lab) | not measured (lab) | < 200 ms | UNMEASURED |
| TBT (INP proxy) | 9.50 ms | 0.00 ms | < 200 ms | PASS (proxy) |
| CLS | 0.000193 | 0.000032 | < 0.1 | PASS |
| FCP | 1,715.40 ms | 447.80 ms | - | INFO |
| TTFB (document) | 47.39 ms | 63.90 ms | < 800 ms | PASS |
| Speed Index | 2,571.61 ms | 516.31 ms | - | INFO |
| Accessibility | 100 | 100 | 100 | PASS |
| Best Practices | 100 | 100 | 100 | PASS |
| SEO | 91 | 91 | 100 | FAIL (`robots.txt`) |
| Total page weight | 184,929 B | 184,932 B | - | INFO |
| Initial JS transfer | 171,830 B (br) | 171,830 B (br) | - | INFO |
| API p95 | 3,837 ms (`/api/rooms`) | - | < 300 ms | FAIL |
| Cold start, first `/api/health` | 941.75 ms (warm, uptime 1,158 s) | - | - | NOT OBSERVED |
| Room page LCP (authenticated, 1 run) | 5,868 ms | - | < 2,500 ms | FAIL |
| Room page weight (with YouTube) | 227,788 B | - | - | INFO |
| YouTube iframe contribution | 40,532 B / 3 requests | - | - | INFO |
| Realtime fan-out p95 | 4,103 ms (50 clients) | - | < 200 ms | FAIL |
| Playback drift (state projection) | 4 ms p50 / 1,186 ms max | - | < 1,500 ms | PASS* |
| Static asset cache | `max-age=0, must-revalidate` | - | immutable | FAIL |
| Compression | brotli | - | enabled | PASS |
| HTTP version | h2 | - | h2 | PASS |
| Client security headers | HSTS only | - | CSP + baseline | FAIL |

`*` Playback drift's numeric target passed, but one of nine seeks failed and the server closed the sockets at the end of the run.

## Headline findings

1. The homepage passes the lab targets: mobile LCP 1.76 s, TBT 9.5 ms, CLS 0.0002; desktop LCP 0.45 s; Performance 99 mobile and 100 desktop.
2. The API is the real bottleneck: `/api/rooms` p50 1.84 s / p95 3.84 s and authenticated `/api/auth/me` p50 0.99 s; even the no-database `/api/auth/config` has a 0.31 s sweep p50 (0.16 s warm), so the 300 ms target is already at the edge before any database access. A true cold start was not observed: the first request after the 15-minute idle window still had 1,158 s of uptime.
3. 3.33-10% of API requests fail after 19-30 s; the failure-inclusive p95 is therefore 19-30 s, not the 3.8 s shown by successful requests.
4. The authenticated room page LCP is 5.87 s, driven by `/api/auth/me` (2.55 s), `/api/rooms/:code` (2.71 s), and the socket snapshot; YouTube adds only 40.5 KB and 3 requests.
5. The client ships one 536 KB JS chunk (171.8 KB brotli); Lighthouse estimates 58.1% is unused on the homepage, and there is no route splitting. `zod` alone is 53 KB because it is pulled through the shared barrel.
6. Hashed assets use `Cache-Control: public, max-age=0, must-revalidate`; repeat visitors revalidate 171.8 KB of JS and 5.7 KB of CSS instead of using an immutable cache.
7. Client responses have only HSTS: no CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, or `X-Frame-Options`. `/robots.txt` and `/favicon.ico` return the SPA HTML, producing SEO 91.
8. A room join runs 10-13 queries against a Prisma pool limited to 5 connections. At 50 parallel joins, 34 of 50 failed with explicit pool-exhaustion errors; the successful joins had p50 12.9 s and p95 19.1 s.
9. Realtime fan-out is 2.3-4.1 s p95, 12-20x over the 200 ms target. A 5-client connection run lost all sockets at 42-47 s, a 20-client run ping-timed out all sockets, and the 50-client run only got 16 clients into the room.
10. YouTube quota is about 101 units per search, so the free 10,000-unit quota supports about 99 searches/day (~33 users/day at 3 searches each); the YouTube iframe and API load eagerly before the "Tap to join audio" gesture.

## Environment and deployment model

The Vercel project uses two services:

- `client`: static Vite SPA.
- `server`: Express + Socket.IO, built as CommonJS `dist/index.cjs`.

Routing sends `/api/*`, `/auth/*`, `/socket.io`, and `/socket.io/*` to `server`; all other paths go to `client`. Socket.IO is WebSocket-only on the same origin. The server is a Vercel Function, so each WebSocket connection is pinned to one instance and is subject to the function's maximum duration.

The function runs in `iad1` (US East). The Neon Postgres endpoint is in `ap-southeast-1` (Singapore). The audit client is in India. This creates two long hops for every database-backed request: India to US East, then US East to Singapore and back.

## Page load: Lighthouse

### Medians (5 runs each)

| Metric | Mobile | Desktop |
|---|---:|---:|
| Performance | 0.99 | 1.00 |
| Accessibility | 1.00 | 1.00 |
| Best Practices | 1.00 | 1.00 |
| SEO | 0.91 | 0.91 |
| LCP | 1,756.97 ms | 447.80 ms |
| TBT | 9.50 ms | 0.00 ms |
| CLS | 0.0001934 | 0.0000315 |
| FCP | 1,715.40 ms | 447.80 ms |
| TTFB | 47.39 ms | 63.90 ms |
| Speed Index | 2,571.61 ms | 516.31 ms |
| Total byte weight | 184,929 B | 184,932 B |

### Per-run values

| Profile | Run | Perf | LCP (ms) | TBT (ms) | CLS | FCP (ms) | TTFB (ms) | SI (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| mobile | 1 | 0.97 | 1,756.97 | 40.0 | 0 | 1,714.97 | 46.47 | 3,968.62 |
| mobile | 2 | 0.99 | 1,681.02 | 9.5 | 0 | 1,681.02 | 42.24 | 1,681.02 |
| mobile | 3 | 0.99 | 1,768.89 | 7.5 | 0 | 1,727.89 | 64.46 | 2,623.59 |
| mobile | 4 | 0.99 | 1,715.40 | 51.0 | 0 | 1,715.40 | 60.85 | 1,715.40 |
| mobile | 5 | 0.98 | 1,809.49 | 6.5 | 0 | 1,777.49 | 47.39 | 2,571.61 |
| desktop | 1 | 1.00 | 473.17 | 0 | 0 | 473.17 | 45.34 | 612.98 |
| desktop | 2 | 1.00 | 483.46 | 0 | 0 | 483.46 | 83.54 | 696.53 |
| desktop | 3 | 1.00 | 395.70 | 0 | 0 | 395.70 | 77.44 | 515.50 |
| desktop | 4 | 1.00 | 376.07 | 0 | 0 | 376.07 | 63.90 | 506.78 |
| desktop | 5 | 1.00 | 447.80 | 0 | 0 | 447.80 | 58.11 | 516.31 |

LCP is a text paragraph, not an image. The homepage has no image LCP and no render-blocking audit failures. The CSS is 5.7 KB compressed and the JS is a single module; the slowest requests are the two API calls, not static assets. The mobile Performance score is 99 despite a 536 KB JS chunk because the chunk is compressed to 171.8 KB and the page is mostly text/UI.

INP is not measured by Lighthouse navigation mode. TBT is reported as the lab proxy; field INP was not available.

### Network requests (representative mobile run)

| Resource | Type | Status | Protocol | Transfer (B) | Resource (B) | Duration (ms) |
|---|---|---:|---|---:|---:|---:|
| `/assets/index-Dn1CHHq8.js` | Script | 200 | h2 | 171,830 | 538,319 | 360.2 |
| `/assets/index-Bs5CnTAN.css` | Stylesheet | 200 | h2 | 5,689 | 23,980 | 363.6 |
| `/_vercel/speed-insights/script.js` | Script | 200 | h2 | 4,970 | 12,567 | 136.5 |
| `/` | Document | 200 | h2 | 873 | 555 | 225.1 |
| `/favicon.ico` | Other | 200 | h2 | 700 | 555 | 130.4 |
| `/api/auth/me` | Fetch | 200 | h2 | 657 | 13 | 414.6 |
| `/api/health` | Fetch | 200 | h2 | 210 | 89 | 947.6 |

The homepage does not load YouTube. The slowest requests are the two API calls, not the static assets. `/api/health` took 947.6 ms and `/api/auth/me` 414.6 ms in this run. These calls do not block LCP but they add server load and delay the homepage's API status UI.

### Compression, cache, HTTP version

- `brotli` is served for the JS and CSS assets (`Content-Encoding: br`).
- HTTP/2 is used by the browser (`h2` in Lighthouse network records).
- Hashed assets are edge-cached (`X-Vercel-Cache: HIT`) but use `Cache-Control: public, max-age=0, must-revalidate`.
- HTML uses `Cache-Control: public, max-age=0, must-revalidate` (appropriate for an SPA shell).
- API responses use `Cache-Control: public, max-age=0, must-revalidate` and `X-Vercel-Cache: MISS`. The same `public` policy was observed on an authenticated `/api/rooms/join` response; authenticated responses should be `private, no-store`.
- `Access-Control-Allow-Origin: *` is present on static responses.

The hashed asset cache policy is the important defect: every repeat visit revalidates the 171.8 KB JS and 5.7 KB CSS instead of using them from cache. The correct policy for content-hashed assets is `public, max-age=31536000, immutable`.

Representative asset response:

```text
HTTP/2 200
content-encoding: br
cache-control: public, max-age=0, must-revalidate
x-vercel-cache: HIT
```

### Security headers

Client responses include only:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

Missing on the client:

- `Content-Security-Policy`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Frame-Options`

The API has Helmet defaults. A CSP for the client must allow the YouTube iframe and YouTube API script; a strict API-style CSP cannot simply be copied to the SPA.

### SEO and static files

Lighthouse SEO is 91 because `robots.txt` is invalid. Both `/robots.txt` and `/favicon.ico` are rewritten to the 555-byte SPA `index.html` and return `200 text/html`.

Evidence:

```text
GET /robots.txt
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 555
X-Vercel-Cache: HIT
```

This produces 15 Lighthouse `robots-txt` errors and an extra HTML download for the favicon request. Add real `robots.txt` and `favicon.ico` files to the client's public directory.

## Bundle analysis

Production build from current `main`:

| Artifact | Raw | Gzip |
|---|---:|---:|
| JS entry `assets/index-B5r_RICF.js` | 536,030 B | 165.66 KB |
| CSS `assets/index-Bs5CnTAN.css` | 23,980 B | 5.23 KB |

The deployed JS is 538,319 B, essentially the same build (the hash differs because the local audit build is not byte-identical to the Vercel build). There is one JS chunk and no route splitting. Vite warns that the chunk exceeds 500 KB.

### Largest dependencies (minified attribution)

| Package | Minified | Share |
|---|---:|---:|
| `react-dom` | 128.2 KB | 24.5% |
| app source | 85.7 KB | 16.4% |
| `@reduxjs/toolkit` | 54.1 KB | 10.3% |
| `zod` | 53.0 KB | 10.1% |
| `react-router` | 38.8 KB | 7.4% |
| `@dnd-kit/core` | 34.9 KB | 6.7% |
| `lucide-react` | 20.5 KB | 3.9% |
| `engine.io-client` | 18.6 KB | 3.5% |
| `qrcode.react` | 16.4 KB | 3.1% |
| `immer` | 13.1 KB | 2.5% |
| `socket.io-client` | 12.2 KB | 2.3% |
| `react` | 7.3 KB | 1.4% |
| `@dnd-kit/sortable` | 6.4 KB | 1.2% |
| `socket.io-parser` | 5.3 KB | 1.0% |
| `@bigbeanbag/shared` | 4.5 KB | 0.9% |

Lighthouse estimates 99,788 B of the 171,642 B JS transfer is unused on the homepage: 58.1%.

### Why the homepage pays for room-only code

`App.tsx` statically imports every page, and there is no `React.lazy` or dynamic `import()` in `packages/client/src`. The room workspace and its dependencies are therefore in the initial chunk:

- `@dnd-kit/core` + `sortable` + utilities: ~44 KB
- `qrcode.react`: 16.4 KB
- `socket.io-client` + `engine.io-client` + parser: ~36 KB
- `YouTubeStage`, `AddSongDialog`, `QueuePanel`, `ChatPanel`, `PollPanel`, `BattlePanel`: ~37 KB
- `zod`: 53 KB, pulled through the `@bigbeanbag/shared` barrel

The shared package builds a single `dist/index.js` that imports `zod` and constructs every schema at module scope. The client imports value exports such as `MAX_SEARCH_RESULTS`, `REACTION_EMOJIS`, and permission helpers from that barrel. Tree-shaking does not remove the schema initializers, so the client pays for `zod` even though it only needs constants and types. Splitting constants/permissions into subpath exports (or a separate schema-free entry) is the direct fix.

## REST API and database

### Timing results (30 requests per endpoint at 500 ms intervals)

| Endpoint | Auth | n | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Error rate | Response bytes |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `GET /api/health` | no | 29 | 506.16 | 1,282.63 | 1,659.98 | 1,659.98 | 3.33% | 90 |
| `GET /api/auth/config` | no | 30 | 308.12 | 1,035.61 | 1,468.93 | 1,468.93 | 0% | 22 |
| `GET /api/auth/me` | no | 30 | 308.60 | 490.41 | 873.32 | 873.32 | 0% | 13 |
| `GET /api/auth/me` | yes | 29 | 993.43 | 2,339.30 | 2,860.77 | 2,860.77 | 3.33% | 206 |
| `GET /api/rooms` | yes | 27 | 1,838.34 | 3,837.29 | 5,157.38 | 5,157.38 | 10.00% | 656 |
| `GET /api/rooms/:code` | yes | 30 | 1,948.26 | 3,716.70 | 3,914.97 | 3,914.97 | 0% | 586 |
| `GET /api/rooms/:code/members` | yes | 29 | 1,838.08 | 3,014.38 | 5,633.35 | 5,633.35 | 3.33% | 252 |
| `GET /api/rooms/:code/invite` | yes | 30 | 2,131.39 | 3,356.81 | 3,403.06 | 3,403.06 | 0% | 120 |
| `POST /api/rooms/join` | yes | 30 | 1,850.23 | 2,751.70 | 3,076.74 | 3,076.74 | 0% | 586 |

All responses came from function region `iad1` with `X-Vercel-Cache: MISS`. The function instance was warm (`uptimeSeconds` was 865 s and rising), so these are not cold-start numbers.

Key observations:

- `/api/auth/config` does no database work. Its 30-request sweep p50 was 308 ms, but the warm autocannon ramp later measured 155-162 ms p50. The no-database floor is therefore ~155 ms warm and ~308 ms when the sweep includes cold/edge variance; the 300 ms target is at the edge. The response is effectively static, but it is sent with `Cache-Control: public, max-age=0, must-revalidate` and `X-Vercel-Cache: MISS`; edge-caching or inlining it at build time would remove this round trip.
- `/api/auth/me` without a cookie is 308.6 ms; with a cookie it is 993.4 ms p50. The difference is the session-store lookup in Postgres, which crosses the US East to Singapore hop.
- `/api/rooms` and `/api/rooms/:code` add room/member queries and reach 1.8-1.9 s p50, 3.7-3.8 s p95.
- Authenticated endpoints show a 3.33-10% error rate, with `status: 0` / `fetch failed` rows. One health request failed after 21.7 s.
- `sessionMiddleware` uses `connect-pg-simple` with `rolling: true`. Every request refreshes the session cookie and calls the store's `touch`, which is a Postgres write. That adds a cross-region write to every authenticated API request and every Socket.IO handshake. `/api/auth/me` is 308.6 ms anonymous versus 993.4 ms authenticated; part of that gap is the session read, and rolling adds a write.

These numbers are consistent with the region mismatch, not with a cold function.

Failed requests (excluded from the latency percentiles):

| Endpoint | Duration | Error |
|---|---:|---|
| `/api/health` | 21,686.94 ms | `fetch failed` |
| `/api/auth/me` (authenticated) | 19,268.73 ms | `fetch failed` |
| `/api/rooms` | 21,656.07 ms | `fetch failed` |
| `/api/rooms` | 30,015.01 ms | aborted by the 30 s client timeout |
| `/api/rooms` | 19,235.26 ms | `fetch failed` |
| `/api/rooms/:code/members` | 19,257.78 ms | `fetch failed` |

The successful-request percentiles therefore understate the real user experience: 3.33-10% of requests failed after roughly 19-30 seconds. The failure duration is consistent with a connection reset or a function/edge timeout, not a fast 5xx. A failure-inclusive p95 is therefore 19-30 seconds, not the 3.8 seconds shown for successful requests.

### Cold start

The cold-start script waited 15 minutes with no requests to the deployment, then sent one `/api/health` request, ten more at 1 s intervals, and five requests each to `/api/auth/me`, `/api/rooms`, and `/api/rooms/:code`. It records `uptimeSeconds` and `x-vercel-id` from the first response so a true cold instance can be distinguished from a warm one.

The first request is `/api/health`; the database-backed endpoints are probed only after ten warm health requests. This isolates function cold start, not a cold Neon connection.

Result:

| Probe | Value |
|---|---:|
| First `/api/health` | 941.75 ms, status 200, `X-Vercel-Cache: MISS` |
| First-response region | `iad1` |
| First-response `uptimeSeconds` | 1,158 s |
| Warm `/api/health` p50 | 488.59 ms |
| Warm `/api/health` p95 | 776.28 ms |
| Warm `/api/health` max | 776.28 ms |

The instance had been up for 1,158 s (~19 minutes), so the 15-minute idle window did not produce a cold function. The first request was 1.93x the warm p50, but that is not evidence of a cold start; it is within the warm tail and the response was a cache `MISS`. A true scale-to-zero cold start was not observed.

The warm database probes were consistent with the REST sweep: `/api/auth/me` p50 1,006 ms / p95 3,404 ms, `/api/rooms` p50 1,753 ms / p95 2,525 ms, and `/api/rooms/:code` p50 2,711 ms / p95 19,244 ms. The room-detail probe included one `status: 0` failure after 19,244 ms, the same ~19 s failure mode seen in the REST sweep.

### Autocannon ramp

Autocannon was capped with `overallRate` and `workers: 1`, so it never exceeded 50 connections or 20 requests/second. Each stage ran for 10 s except the 20 rps stages, which ran for 20 s.

| Endpoint | Connections | Target rps | Actual rps | p50 | p90 | p99 | Max | Non-2xx |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/api/auth/config` | 10 | 2 | 2.0 | 160 | 304 | 408 | 440 | 0 |
| `/api/auth/config` | 10 | 5 | 5.0 | 158 | 295 | 563 | 720 | 0 |
| `/api/auth/config` | 10 | 10 | 10.0 | 152 | 281 | 369 | 537 | 0 |
| `/api/auth/config` | 20 | 15 | 15.0 | 158 | 298 | 453 | 630 | 0 |
| `/api/auth/config` | 50 | 20 | 20.0 | 162 | 307 | 468 | 980 | 0 |
| `/api/auth/config` | 50 | 20 | 20.0 | 155 | 288 | 392 | 765 | 0 |
| `/api/health` | 10 | 2 | 1.5 | 340 | 1,227 | 2,145 | 2,246 | 0 |
| `/api/health` | 10 | 5 | 4.4 | 407 | 1,750 | 3,200 | 3,556 | 1 |
| `/api/health` | 10 | 10 | 8.5 | 428 | 1,806 | 2,925 | 3,651 | 0 |
| `/api/health` | 20 | 15 | 13.3 | 415 | 1,852 | 2,686 | 3,657 | 0 |
| `/api/health` | 50 | 20 | 19.1 | 327 | 1,009 | 2,970 | 3,760 | 1 |
| `/api/health` | 50 | 20 | 19.7 | 306 | 584 | 1,780 | 2,346 | 0 |

Autocannon's result object exposes p99 but not p95; the API timing section above is the p95 source.

`/api/auth/config` has no latency inflection through 20 rps: p50 stays at 152-162 ms and p99 at 369-563 ms. It is the no-database control. The function/edge path can therefore sustain 20 rps when the request does not touch Postgres.

`/api/health` is the opposite. Its p50 is 306-428 ms and its p99 is 1.78-3.20 s at every stage. The actual rate falls short of the target at 2, 5, 10, and 15 rps (1.5, 4.4, 8.5, 13.3), then reaches 19.1-19.7 at the 20 rps stage. The p99 tail is already seconds at 2 rps, so the inflection is not a throughput cliff; the endpoint is slow at every rate. The two non-2xx responses occurred at the 5 rps and 20 rps health stages. There were no socket errors, timeouts, or resets recorded.

## Prisma hot paths

### Room join and snapshot

`buildRoomSnapshot` runs a room query with members and owner, then `ensureBattleFresh`, queue rows, playback, chat, reactions, polls, and battles. It also calls `ensurePlayback`, which is an `upsert` on `PlaybackState` with an empty update. A room join also performs `requireRole` and a room lookup before the snapshot.

The join-write probe in the realtime test joined twice, 1.5 s apart, and observed the same `playback.updatedAt` and `positionMs`. In that run the upsert did not change the row, so it behaved as a no-op at the database level. It is still an extra round trip on every join and snapshot; making `ensurePlayback` a read with an explicit create-on-first-use would remove it from the hot path.

At cross-region latency, ~10-13 database round trips per join is the dominant cost. The join is not one query; it is a fan-out of sequential and parallel queries, plus an upsert call. `lib/pg.ts` also sets the session-store pool to `max: 5`, and Prisma's pool reported `connection limit: 5` in the 50-client failures. The two pools compete for the same Neon connection budget.

### Queue fetch

`loadQueueRows` filters `roomId` and `status in (QUEUED, PLAYING)`, orders by `createdAt`, and includes the adding user. It has no `take` or cursor. A room with a large queue returns every queued row on every snapshot and on every `broadcastQueue`. `broadcastQueue` is called after playback and queue mutations, so the full queue is refetched repeatedly.

Existing index `[roomId, status]` covers the filter but not the sort. Add `[roomId, status, createdAt]` and enforce a page size.

### Vote path

`votePoll` loads the full poll row (all options and all votes), writes the vote, then loads the full poll row again. `broadcastPoll` loads the poll row a third time and recomputes `toPollDto` once per socket. Each DTO filters the full vote list per option. At 50 voters, each vote reads ~150 vote rows across three queries and does O(sockets × options × votes) work.

Return the updated poll from the write, compute the DTO once, and send one payload. Personalize `myVoteOptionId` on the client or send a compact voter map.

### Missing indexes and unbounded results

Candidate indexes:

- `QueueItem`: `[roomId, status, createdAt]`
- `Reaction`: `[roomId, emoji]`
- `Poll`: `[roomId, status, createdAt]`
- `Battle`: `[roomId, status, createdAt]`
- `Room`: `[visibility, createdAt]`

Unbounded reads:

- `loadQueueRows` (no limit)
- open polls in `listPollRows` (no limit)
- `listReactionSummary` groups over every reaction in the room (no time window)
- `listRooms` membership list (no limit; public rooms are limited to 50)

No classic N+1 query was found in the hot paths. The problem is repeated full reads, an upsert call on every join, and per-socket DTO recomputation.

## Realtime

Test design:

- 5, 20, and 50 Socket.IO clients, WebSocket-only, 50 ms connect stagger.
- Same authenticated test user and isolated room; presence dedupes the user ID, so the test measures socket fan-out, not distinct-user presence.
- Event RTT via `sync:ping`; fan-out via `reaction:send` to all other sockets; reconnect via `engine.close()`; playback state via `playback:play` and `playback:seek`.
- 45-second playback hold at 5 and 20 clients; 300-second hold at 50 clients.
- All clients disconnected and the room deleted after the run.

Drift is measured against the host after both sides have applied the authoritative `playback:updated` state, which matches the client's `syncPlayer` behavior. The transient between the seek command and each client applying the state is reported separately as fan-out latency.

### Connection and fan-out results

The connection/fan-out harness used `reconnection: false` so a failed connection could not create a reconnect storm. Clients connected with a 100 ms stagger and joined in parallel. Fan-out was five `reaction:send` rounds from the first joined socket to the other joined sockets.

| Clients | Connected | Joined | Connect p50 / p95 | Join p50 / p95 | Fan-out samples | Fan-out p50 / p95 / max | Missing per round |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 5 | 5 | 2,899 / 3,093 ms | 3,934 / 5,691 ms | 20 | 2,312 / 2,800 / 2,814 ms | 0 / 4 |
| 20 | 20 | 20 | 2,337 / 3,776 ms | 10,291 / 15,218 ms | 80 | 2,276 / 3,617 / 3,619 ms | 3 / 19 |
| 50 | 50 | 16 | 1,601 / 2,777 ms | 12,889 / 19,094 ms | 48 | 3,001 / 4,103 / 4,103 ms | 3 / 15 (round 0: 15 / 15) |

The 20-client fan-out lost 3 of 19 listeners in every round even though all 20 clients joined; the fan-out harness did not record the disconnect reason. The 50-client round 0 lost all 15 listeners, then lost 3 of 15 in the later rounds.

At 50 clients, 34 of 50 `room:join` calls failed or timed out. The failures include explicit Prisma errors:

```text
Timed out fetching a new connection from the connection pool.
(Current connection pool timeout: 10, connection limit: 5)
```

The 50-client join p50 was 12.9 s and p95 19.1 s. Only 16 clients reached the room, so the 50-client fan-out is a 15-listener measurement, not a true 50-listener measurement.

### Stability

A separate 60-second connection-only run showed that the service is not stable under repeated load:

- 5 clients: all five connections closed with `transport close` at 42-47 s. The clients did not initiate the close; the server did.
- 20 clients: only 8 of 20 joins completed; the other 12 hit the 20 s join timeout. All 20 sockets then disconnected with `ping timeout` at 46-48 s.
- 50 clients: the sockets stayed connected for 60 s and answered 550 pings (p50 253 ms, p95 348 ms), but only 16 of 50 joins succeeded.

The same 50-client load produced a healthy 60-second connection run in one pass and a 42-48 s collapse in the 5/20 pass. Conversely, the dedicated 5-client playback run held for 309 s before the server closed the sockets. The 5-client lifetime is therefore also variable, not a fixed 42 s cutoff. The server's behavior is variable, which is worse than a consistently low limit: clients cannot predict whether a room will survive.

### Why fan-out is seconds, not milliseconds

`reaction:send` is not a memory broadcast. It performs a database write (`toggleReaction`), then `listReactionSummary` runs a `groupBy` over the room's reactions, then the server emits to every socket. The sender's ack waits for that chain. The 2.3-4.1 s fan-out is therefore the cross-region database path plus per-reaction work, not WebSocket serialization.

The connection handshake also reads the session from Postgres, and `room:join` runs the 10-13 query snapshot. At 50 parallel joins, the Prisma pool limit of 5 is exhausted before the snapshot can complete. This is the direct cause of the 34 join failures.

### Reconnect

The multi-client reconnect attempt (5 clients) failed with `connect timeout` after the 5-client sockets were closed by the server. A single-client connection stayed alive for 70 s, but its `sync:ping` latency degraded from ~250 ms to 1.2-2.7 s over the run.

A separate single-client reconnect test succeeded: connect 1,052 ms, join 4,478 ms, reconnect 2,240 ms, and rejoin 4,320 ms. Reconnect therefore works for one client but adds another ~6.6 s before the client is back in the room, and it was not reliable when the server had just closed five sockets.

### Playback drift

Five clients, one host and four listeners, held the room for 300 s. The harness issued a seek about every 30 s and sampled drift every 10 s after both the host and listeners had applied the authoritative state.

- Connect: p50 2,659 ms, p95 2,949 ms.
- Join: p50 7,391 ms, p95 8,370 ms.
- `sync:ping` RTT: p50 280 ms, p95 591 ms (50 samples).
- Drift: p50 4 ms, p95 4 ms, max 1,186.31 ms (25 samples over 309 s).
- The first eight seeks reached 4/4 listeners with a 2.1-4.7 s ack and ~4.7 ms drift.
- The ninth seek at 279 s reached 0/4 listeners and its ack timed out. The last sample at 309 s measured 1,186.31 ms of drift; the host had advanced while the listeners had not applied the seek.
- All five sockets then closed with `transport close` at ~309 s. The clients did not initiate the close.

The numeric target (< 1,500 ms) passes, but the margin is only 314 ms and it is the result of the run ending. The seek that failed is a real synchronization failure: the host and listeners diverged by 1.19 s, and the server closed the sockets before the next correction. This should be reported as a partial pass, not a clean pass.

The 50-client drift run was not possible: only 16 of 50 clients joined, and the 50-client connection run did not survive long enough to hold a 300 s playback window.

## YouTube and iframe cost

### Quota

| Flow | YouTube calls | Units | Capacity at 10,000 units/day |
|---|---|---:|---:|
| Search (search.list + videos.list) | 2 | 101 | ~99 searches/day |
| Add from link (videos.list, cached 7 days) | 1 | 1 | ~10,000 resolves/day |
| Add from search (search + cached video) | 2 | 101 | ~99 adds/day |
| Autoplay refill (up to 3 searches, each 101) | up to 6 | up to 303 | ~33 refills/day |

Search results are cached for 6 hours; video metadata is cached for 7 days. The first search for a query costs 101 units. Repeating the same query within 6 hours costs 0. Autoplay can issue up to three artist queries concurrently, so a single refill can consume 303 units. At the free quota, that is about 33 autoplay refills per day, shared with all users.

This audit consumed 101 units for one search plus 2 units for two link resolves (the 4:09 test track and the 8:10 drift track): 103 units total.

Free-quota user capacity: at 10,000 units/day and 101 units per search, the quota supports about 99 searches/day. If an average user performs 3 searches/day, that is about 33 users/day; at 5 searches/day, about 19 users/day; at 10 searches/day, about 9 users/day. Autoplay refills consume up to 303 units each, so a room that refills 10 times/day consumes about 3,030 units and reduces the remaining search capacity to about 69 searches/day.

### Iframe loading

`YouTubeStage` calls `loadYouTubeApi()` on mount and creates the iframe immediately when a current queue item exists. The player is muted and an overlay says "Tap to join audio", but the iframe and the YouTube API script are already loaded before that click. The iframe is therefore not lazy: entering a room with a playing item downloads the YouTube player even if the user never joins audio.

Measured on the authenticated room page (mobile viewport, cache disabled, one run with YouTube and one run with YouTube requests blocked):

| Metric | With YouTube | Without YouTube |
|---|---:|---:|
| LCP | 5,868 ms | 6,148 ms |
| FCP | 512 ms | 732 ms |
| CLS | 0 | 0 |
| Long tasks | 1 (64 ms) | 1 (55 ms) |
| Total transfer | 227,788 B | 187,672 B |
| YouTube requests | 3 | 2 attempted (blocked) |
| YouTube bytes | 40,532 B | 0 B |
| Iframes | 1 | 0 |

YouTube requests in the normal run:

| Request | Bytes | Duration |
|---|---:|---:|
| `i.ytimg.com/vi/5NV6Rdv1a3I/hqdefault.jpg` | 21,872 | 554.8 ms |
| `youtube.com/iframe_api` | 9,458 | 290.7 ms |
| `youtube.com/s/player/.../www-widgetapi.js` | 9,202 | 81.1 ms |

The LCP difference between the two runs is noise; the room page is API-bound, not YouTube-bound. The important findings are:

- The iframe and API script are requested eagerly, before the "Tap to join audio" gesture.
- The page also requests `/api/auth/me` (2,549 ms) and `/api/rooms/ADGZNY` (2,707 ms), then waits for the Socket.IO snapshot. The ~5.9 s LCP is the result of that chain.
- In the blocked run, `/api/rooms/ADGZNY/invite` took 1,868 ms, adding another cross-region query to the room page.
- The YouTube thumbnail is a 21.9 KB third-party JPEG (`hqdefault.jpg`); it has no `srcset` or modern-format fallback and could be replaced by a local placeholder until the user joins audio. The Google avatar is 1,331 B. The homepage has no images.

The homepage Lighthouse LCP is 1.76 s; the authenticated room page is ~5.9 s. The gap is not caused by the 40 KB of YouTube assets. It is caused by the authenticated API and room-snapshot latency.

## Top bottlenecks

1. **Cross-region API and database latency.** The function is in `iad1`, Neon is in `ap-southeast-1`, and the audit client is in India. `/api/auth/config` has a 308 ms sweep p50 (155 ms warm) with no database work; `/api/rooms` has a 1,838 ms p50 and a 3,837 ms p95. The authenticated room page takes ~5.9 s to LCP because it waits for `/api/auth/me` (2.5 s), `/api/rooms/:code` (2.7 s), and the socket snapshot. Fix: move the Vercel function to `sin1` (co-located with Neon) or move Neon to `us-east-1`; keep the edge close to users. Also move the session store off the cross-region database (JWT/signed cookie or Redis); `rolling: true` currently touches the session row on every request. Expected: API p50 roughly 50-100 ms and p95 under 300 ms, a 5-10x improvement, with the same effect on room joins and realtime database work.
2. **One 536 KB JS chunk with no route or feature splitting.** The homepage downloads room-only code and `zod` through the shared barrel; Lighthouse estimates 58.1% of the JS is unused on the homepage. Fix: `React.lazy` for routes, dynamic import for the room workspace/dialogs, split the shared package's constants/permissions from schemas, and consider replacing RTK Query for the small API surface. Expected: 30-45% less initial JS and lower mobile LCP/TBT.
3. **Hashed assets are not immutable-cached.** `/assets/*` returns `max-age=0, must-revalidate`, so repeat visitors revalidate 171.8 KB of JS and 5.7 KB of CSS every time. Fix: `Cache-Control: public, max-age=31536000, immutable` for `/assets/(.*)`. Expected: zero asset transfer on repeat visits and a large repeat-visit LCP improvement.
4. **The Prisma pool limit is 5 and a room join needs 10-13 queries.** At 50 parallel joins, 34 of 50 failed with `Timed out fetching a new connection from the connection pool (connection limit: 5)`; the successful joins had a 12.9 s p50 and 19.1 s p95. The queue read is unbounded, and `ensurePlayback` adds an upsert call to every join/snapshot. Fix: use a Neon pooler/PgBouncer and set a Prisma connection limit appropriate for the function concurrency, or cut the snapshot query count; make `ensurePlayback` read-only, add queue limits and the candidate indexes. Expected: all 50 joins complete and join p95 under 1 s.
5. **Realtime fan-out is database-bound and the socket server is pinned to one Vercel Function instance.** `reaction:send` writes a reaction, runs a `groupBy` summary, then broadcasts; the sender's ack waits for that chain. Five clients already see 2.3-2.8 s p95 fan-out, 20 clients see 3.6 s, and the 50-client run saw 4.1 s with only 16 of 50 clients able to join. The 5-minute drift run had all five sockets closed by the server at ~309 s, consistent with the function's maximum duration. Connections are pinned to one instance, and in-memory presence/rate limits do not span instances. Fix: coalesce or batch reactions, compute the summary once, move presence/rate limits and the Socket.IO adapter to Redis, and run realtime on a persistent host. Expected: fan-out p95 under 200 ms and stable 50-client rooms.

## Unmeasured

- Field INP and field CLS (no CrUX or real-user data); only lab TBT/CLS.
- True cold start after scale-to-zero (the instance had 1,158 s uptime after the 15-minute idle window; see the cold-start section).
- Actual YouTube media playback drift. The realtime script measures server-state projection drift, not audio/video drift inside the YouTube player.
- Spotify-backed search/resolve flows and their quota/error behavior.
- Load tests against YouTube/Spotify-backed endpoints (only single requests).
- More than 50 concurrent clients (not permitted by the audit rules).
- A true 50-listener fan-out: only 16 of 50 clients joined, so the 50-client fan-out used 15 listeners.
- A 50-client 5-minute playback drift: the drift run used 5 clients because only 16 of 50 joined.
- A successful multi-client reconnect: the only attempt timed out; the single-client reconnect is reported separately.
- A stable 5/20/50 connection lifetime: the 5/20 pass collapsed at 42-48 s, while the 50-client pass survived 60 s.
- Multi-instance realtime behavior (the test exercised the instance Vercel routed to).
- Database `EXPLAIN ANALYZE`, slow-query logs, and connection-pool metrics.
- Real mobile devices, Safari, and Firefox.
- Vercel function logs and dashboard metrics.
- A full CSP evaluation for the client.

## Raw result files

All JSON evidence is under `perf/results/`:

| File | Contents |
|---|---|
| `lighthouse-summary.json` | 5 mobile and 5 desktop Lighthouse runs, medians, network records |
| `bundle-report.json` | Rollup visualizer totals and chunk list |
| `sme-report.json` | Per-package and per-file source-map attribution |
| `api-timing.json` | 30 samples for each of the 9 REST probes, including failures |
| `room-page.json` | Authenticated room-page Puppeteer run with and without YouTube |
| `media.json` | Search and first resolve/add timings |
| `long-media.json` | Second resolve, queue add, and skip to the 8:10 track |
| `realtime.json` | 5-client, 5-minute playback drift run |
| `realtime-fanout.json` | 5/20/50-client fan-out rounds; the 5-client level is transcribed after the 20/50 pass overwrote it |
| `realtime-connections.json` | 50-client connection/join/ping run; final `io client disconnect` entries are cleanup |
| `realtime-stability.json` | 5/20-client 60 s connection run that collapsed |
| `realtime-lifetime.json` | Single-client 70 s connection and ping-latency drift |
| `realtime-failed.json` | First multi-client run that collapsed |
| `realtime-reconnect.json` | Single-client reconnect and rejoin |
| `autocannon.json` | Capped autocannon ramp results |
| `cold-start.json` | First-request and warm samples after the idle window |

## Exact commands

All commands run from `E:\PROJECTS\BigBeanBag\perf` unless noted.

```powershell
npm install
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node lighthouse.mjs
```

Bundle build (run from `E:\PROJECTS\BigBeanBag\packages\client`):

```powershell
& "E:\PROJECTS\BigBeanBag\perf\node_modules\.bin\vite.cmd" build --config "E:\PROJECTS\BigBeanBag\perf\vite.bundle.config.mjs"
```

Bundle reports (from `perf`):

```powershell
node bundle-report.mjs
node sme-report.mjs
```

API and room tests:

```powershell
node setup-room.mjs
$env:INTERVAL_MS='500'; node api-timing.mjs
node setup-media.mjs
node setup-playback.mjs
node setup-long.mjs
node room-page.mjs
$env:LEVELS='5'; node realtime-fanout.mjs
$env:LEVELS='20,50'; node realtime-fanout.mjs
$env:LEVELS='5,20'; node realtime-connections.mjs
$env:LEVELS='50'; node realtime-connections.mjs
node realtime-lifetime.mjs
node realtime-reconnect.mjs
$env:LEVELS='5'; $env:FANOUT_ROUNDS='0'; $env:SKIP_RECONNECT='1'; $env:HOLD_MS='300000'; $env:SHORT_HOLD_MS='300000'; node realtime.mjs
node autocannon-ramp.mjs
node cold-start.mjs
node cleanup-room.mjs
```

Header checks:

```powershell
curl.exe -sS -D - -o NUL https://bigbeanbag.vercel.app/
curl.exe -sS -D - -o NUL -H "Accept-Encoding: br, gzip" https://bigbeanbag.vercel.app/assets/index-Dn1CHHq8.js
curl.exe -sS -D - -o NUL https://bigbeanbag.vercel.app/api/health
curl.exe -sS -D - https://bigbeanbag.vercel.app/robots.txt -o NUL
```

## Cleanup

The test room is deleted with `node cleanup-room.mjs`. The script deletes `results/test-room.json` after a successful `204`/`404`. The session cookie lives only in `perf/.env.local`, which is ignored by Git and is never committed.
