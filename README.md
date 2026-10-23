# BigBeanBag

A collaborative music room for listening together. Everyone joins a room, drops YouTube or Spotify links into a shared queue, and the room stays in sync from an authoritative host.

Built as a pnpm monorepo with a React client, an Express + Socket.IO API, PostgreSQL via Prisma, and a shared Zod contract package.

## Features

- Google sign-in with server-side PostgreSQL sessions
- Public, unlisted, and private rooms with invite links, QR codes, revocation, and rotation
- Members can leave a room at any time; owners delete their room instead
- Owner / host / member roles with server-enforced permissions
- Shared queue in add order, with host drag-and-drop reordering and reshuffle
- Host autoplay that refills the queue from suggestions
- Owner or host drives playback; everyone else follows with drift correction
- Chat with muted and host-only modes, plus emoji reactions
- Timed song battles with live results
- Room polls with live results, multiple open polls, and one vote per person
- Member moderation: promote, demote, mute, unmute, kick, and ban
- YouTube and Spotify link support, with search and metadata resolution
- Responsive dark UI with room presence, connection status, and queue stats

## Stack

| Layer    | Technology                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| Client   | React 18, Vite, TypeScript, Tailwind CSS, Redux Toolkit / RTK Query, React Router |
| Server   | Node.js, Express, TypeScript, Socket.IO, Passport, Zod                            |
| Database | PostgreSQL (Neon-compatible) with Prisma                                          |
| Shared   | `@bigbeanbag/shared` Zod schemas, DTOs, constants, and permission helpers         |
| Tooling  | pnpm workspaces, Vitest, ESLint, Prettier, tsup                                   |

## Monorepo layout

```
packages/
  client/   React app (Vite dev server, Redux store, room workspace)
  server/   Express API, Socket.IO handlers, Prisma schema and services
  shared/   Zod schemas, types, constants, shared permission logic
```

## Requirements

- Node.js 20.19 or newer
- pnpm 9.15.9 (`corepack enable` or `npm i -g pnpm@9.15.9`)
- PostgreSQL 14+ (Neon works well)
- A Google OAuth client
- A YouTube Data API v3 key
- Optional: Spotify app credentials (search falls back to oEmbed and YouTube matching)

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

   Fill in `DATABASE_URL` and `DIRECT_URL`. On Neon, use the pooled connection string for `DATABASE_URL` (include `pgbouncer=true`) and the direct host for `DIRECT_URL`.

3. Create a Google OAuth client of type "Web application" and add the callback:

   ```
   http://localhost:4000/auth/google/callback
   ```

   Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` in `.env`.

4. Add a `YOUTUBE_API_KEY` from Google Cloud Console with the YouTube Data API v3 enabled.

5. Apply the database migrations:

   ```bash
   pnpm db:migrate
   ```

6. Start the API and client together:

   ```bash
   pnpm dev
   ```

   - Client: http://localhost:5173
   - API: http://localhost:4000
   - Health check: http://localhost:4000/api/health

The Vite dev server proxies `/api`, `/auth`, and `/socket.io` to the API, so the client can use same-origin cookies without CORS configuration.

## Environment variables

| Variable                | Required | Notes                                                                |
| ----------------------- | :------: | -------------------------------------------------------------------- |
| `NODE_ENV`              |    no    | `development`, `test`, or `production`                               |
| `PORT`                  |    no    | API port, defaults to `4000`                                         |
| `APP_URL`               |    no    | Client origin used for invite links, defaults to the dev client      |
| `SERVER_URL`            |    no    | Public API origin, defaults to `http://localhost:4000`               |
| `SESSION_SECRET`        |   yes*   | Long random string. Production requires a unique 32+ character value |
| `SESSION_COOKIE_NAME`   |    no    | Session cookie name, defaults to `bbb.sid`                           |
| `DATABASE_URL`          |   yes    | Pooled PostgreSQL connection string                                  |
| `DIRECT_URL`            |   yes    | Direct PostgreSQL connection string used by Prisma migrations        |
| `GOOGLE_CLIENT_ID`      |   yes*   | Google OAuth client ID                                               |
| `GOOGLE_CLIENT_SECRET`  |   yes*   | Google OAuth client secret                                           |
| `GOOGLE_CALLBACK_URL`   |    no    | Defaults to `http://localhost:4000/auth/google/callback`             |
| `YOUTUBE_API_KEY`       |   yes    | YouTube Data API v3 key for search, validation, and canonicalization |
| `SPOTIFY_CLIENT_ID`     |    no    | Enables the Spotify Web API; without it, Spotify links use oEmbed    |
| `SPOTIFY_CLIENT_SECRET` |    no    | Pairs with `SPOTIFY_CLIENT_ID`                                       |

\* Required in production. The server refuses to boot in production with the development session secret or without Google OAuth credentials.

Never commit `.env`. It is ignored by Git.

## How it works

### Auth and sessions

Google OAuth runs through Passport. Sessions are stored in PostgreSQL with `connect-pg-simple` and delivered as an httpOnly, `sameSite=lax` cookie (`secure` in production). Socket.IO authenticates by verifying the same session cookie and loading the session from the shared store, so REST and realtime share one identity.

### Room model and permissions

- `OWNER`: full control, including room settings, invite rotation, role changes, and deletion
- `HOST`: moderates members, controls playback, starts battles, and can close polls
- `MEMBER`: adds songs, chats, reacts, votes in polls and battles

The server re-checks the caller's membership and role for every action. The owner cannot be kicked, banned, muted, demoted, or modified by anyone. Hosts can only moderate members.

### Queue and playback

By default, queued songs play in the order they were added, using `createdAt` ascending. The owner or a host can drag songs by the handle on each row to any position or reshuffle the queue. The first drag or reshuffle switches the room to manual order, persisted with `QueueItem.position`. New songs join at the end of a manual queue. The client applies the drop optimistically so rows settle into their new order immediately, then reconciles with the server broadcast.

Autoplay is also controlled by the owner or a host. When it is on and playback runs out of queued songs, the server searches for suggestions seeded by recent queue artists and inserts up to three tracks before advancing. If the queue has no artist history yet, it falls back to mood-style queries. Autoplay tracks are attributed to the room owner in the queue.

Playback is server-authoritative. The owner or host issues play, pause, seek, and skip commands; the server stores an updated position and timestamp and broadcasts a `PlaybackState`. Followers run a YouTube IFrame player, compare their position, and correct drift. The host client reports track end, and the server advances to the next song in the active queue order.

Joining a room returns a full snapshot: room, members, queue, playback, recent chat, reaction summary, all open polls plus recent closed polls, recent battles, and server time.

### Media pipeline

- Only YouTube and Spotify links are accepted.
- YouTube items are resolved and validated through the YouTube Data API: music category and embeddable playback are required.
- Spotify only accepts individual tracks. Albums, playlists, episodes, and shows are rejected.
- Spotify tracks are resolved to an embeddable YouTube video; without Spotify credentials the server falls back to Spotify oEmbed metadata plus a YouTube match.
- Resolved metadata is cached in PostgreSQL.
- The add-song dialog and autoplay suggest tracks from artists already in the room queue; without artist history they offer mood shortcuts.

### Room chat and activity

Chat is stored per room, with the latest 50 messages in the join snapshot and a 200-message live window on the client. Muted members cannot chat or react. When chat is host-only, members can read but not send. Reactions are an allow-listed emoji set with one reaction per user per emoji.

Chat messages, poll cards, and battle cards share one chronological activity feed in the room chat. The snapshot includes all open polls and recent closed polls, plus recent battles, so the feed stays complete after a reload.

Polls allow all members to vote, and a room can keep multiple polls open at once. Each poll gives one vote per person. Tap an option to vote, tap another to switch, or tap your current pick again to clear it. The creator or a host can close any individual poll.

Battles are started by the owner or host between two queued songs with a 15-300 second timer. Only one battle can run at once. Members vote once each and can switch their pick. When time expires, the higher-vote song wins (ties go to the earlier queued song). Battle timers are per-process; a sweeper finalizes expired battles and the room snapshot repairs state after a restart.

### Realtime protection

Socket handlers use per-socket token buckets for chat, reactions, polls, battles, and queue actions. Payloads are parsed with shared Zod schemas. Test-only authentication (`x-test-user-id` and socket `auth.testUserId`) is enabled only when `NODE_ENV=test`.

## Scripts

| Command            | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `pnpm dev`         | Build shared, then run client and server in parallel |
| `pnpm build`       | Build every package                                  |
| `pnpm typecheck`   | TypeScript checks across the workspace               |
| `pnpm lint`        | ESLint across the workspace                          |
| `pnpm format`      | Prettier write                                       |
| `pnpm test`        | Run all Vitest suites                                |
| `pnpm db:migrate`  | Create/apply a development migration                 |
| `pnpm db:push`     | Push the Prisma schema without a migration           |
| `pnpm db:studio`   | Open Prisma Studio                                   |
| `pnpm db:generate` | Regenerate the Prisma client                         |

### Tests

- `@bigbeanbag/shared`: schema and permission unit tests, fully offline.
- `@bigbeanbag/server`: REST service tests plus Socket.IO integration tests that hit a real PostgreSQL database. Set `DATABASE_URL`/`DIRECT_URL` in `.env`; tests use `NODE_ENV=test` and clean up their users. The socket suite is intentionally slower because it exercises live timers.
- `@bigbeanbag/client`: reducer, queue-control, formatting, and YouTube error-copy tests.

```bash
pnpm test
pnpm --filter @bigbeanbag/server test -- src/socket.test.ts
```

## Deployment notes

### Vercel

The repository deploys as one Vercel project with two services:

| Service  | Root              | Public paths                                      |
| -------- | ----------------- | ------------------------------------------------- |
| `client` | `packages/client` | Everything not routed to the server               |
| `server` | `packages/server` | `/api/*`, `/auth/*`, `/socket.io/*`               |

`vercel.json` owns the public routing. The browser calls those paths directly, so no service-to-service bindings are needed. The client is a static Vite app; the server is an Express service with Socket.IO.

Set these Vercel environment variables:

- `APP_URL` and `SERVER_URL`: the public deployment origin, for example `https://your-project.vercel.app`
- `SESSION_SECRET`: a unique 32+ character secret
- `DATABASE_URL` and `DIRECT_URL`: the pooled and direct PostgreSQL URLs
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`: `https://your-project.vercel.app/auth/google/callback`
- `YOUTUBE_API_KEY`: required for media search
- Optional: `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`

Add the same production callback URL to the Google OAuth client. Run migrations against `DIRECT_URL` before deploying:

```bash
pnpm --filter @bigbeanbag/server exec prisma migrate deploy
```

Socket.IO is configured for WebSocket transport only because Vercel does not support Socket.IO's HTTP long-polling handshake across function instances. Vercel closes WebSocket connections when the function reaches its maximum duration; the client reconnects and rejoins the room automatically.

### Self-hosted

1. Set `NODE_ENV=production`, a unique 32+ character `SESSION_SECRET`, public `APP_URL` and `SERVER_URL`, and Google OAuth credentials. Production validation fails fast otherwise.
2. Run `pnpm --filter @bigbeanbag/server exec prisma migrate deploy` against `DIRECT_URL`.
3. Build with `pnpm build`. Start the API with `pnpm --filter @bigbeanbag/server start`.
4. Serve `packages/client/dist` from a static host or CDN. Proxy `/api`, `/auth`, and `/socket.io` (WebSocket upgrade included) to the API on the same origin. The server does not enable CORS by design.
5. Use HTTPS so the session cookie is sent with `secure`.
6. Add the production callback URL to the Google OAuth client.

The current realtime layer keeps rate limits, battle timers, and presence in memory. A single API instance is safe; horizontal scaling needs a Socket.IO Redis adapter and a shared rate-limit store. Vercel Functions can scale to multiple instances, so treat the Vercel deployment as a single-instance beta until those shared stores are added.

## Known limitations

- Playback is YouTube-only at runtime; Spotify is a metadata and discovery source.
- Spotify-to-YouTube matching can miss obscure tracks.
- YouTube playback depends on the video owner allowing embeds and on regional availability.
- Autoplay depends on the YouTube search quota; when it is exhausted, playback stops at the end of the queue.
- No file uploads or hosted audio.
- No password or guest login; Google is the only identity provider.
- Invite links grant access to unlisted/private rooms through a token until revoked or rotated.
- Chat history in the join snapshot is limited to the last 50 messages.

## License

Private project. All rights reserved.
