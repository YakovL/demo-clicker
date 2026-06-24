# Design plan
+ design + discuss with AI:
  + data model (single collection: users)
  + DB highload (indexes, connection pooling, caching, rank/leaderboard)
    . debouncing – on FE [energy verification – on BE]
  + BE logic
    + tie-breaker: numberOfClicks: -1, _id: 1 compound
  + transport: REST > WS .. + endpoints/schemas
    . no queue since users expect immediate feedback
  + FE logic (send batched with optimistic update; ..)
    . localStorage is ok for jwt (no XSS expected)
+ design FE: 2 pages, main elements and user flows


# Implementation plan
~+ data model and DB:
  + model.ts
  + users repository:
    + connection, repo skeleton, .findById, .create
      + fix connectToDatabase: avoid cold-start race by tracking shared connectionPromise
      + ensureIndexes, index by tgId
    + implement addLigitimateClicks (use findOneAndUpdate)
      + validate amount > 0, is integer, no more than maxEnergy/clickEnergyCost *1.5 (tolerance ration)
    + implement leaderboard getter, rank getter, add index by numberOfClicks
      + separate _getLeaderboard method (no getRank), use with caching in getLeaderboard
      + getRank perf: use buckets and return approximate for users ~far from top
        + auxiliary repository for rank_buckets collection
    . tuning maxPoolSize: later, based on load testing
  * zod/ORM validation of data in Mongo (in .findById, ..)
~+ API layer:
  + Hono app
  + routes:
    + GET  /v1/me
    + POST /v1/me/clicks
    + GET  /v1/leaderboard
    + GET  /v1/me/rank
    + POST /v1/auth/telegram + auth middleware (@grammyjs/validator, jwt)
  + add grammy bot, /start → create user if not exists + button to open TMA
  - issueLogger: adapt for highload
+ front
  + TMA, auth
  + pages and router
  + API
  + leaderboard functionality
  + main page functionality
    + optimistic updates
    + optimistic energy regen
    + debouncing and batching click claims
  ~+ consistent UI/UX
    + leaderboard: spacing, test vertical scroll, long user titles; link color
      * long titles: no-wrap + ellipsis?
    + main: fonts, colors, spacing, message
    + leaderboard: fix retry button/layout
    + leaderboard: always show Back to main and header
    + leaderboard: reduce spacing between Back to main and header
    + leaderboard: fix jumping on loading finish (align vertically to top, not center)
    * cool loading indicator?
    * main: progressbar for energy
    * all buttons (effectively Retry ones for error states):
      specify colors for border and bg, hover/active
+ review

# Debt
- performance/highload:
  - issueLogger: use something suitable for highload (async, like pino, probably not file-based, like Sentry)
    . just throttling is not enough unless the interval is enforced between each writes
  * use _id instead of tgId in users, get rid of the extra index
  . connection pooling params (params of MongoClient): later during production, based on load testing
- behavior consistency:
  - buckets drifting: either make writes transactional (in rankBucketsRepository.updateBucketCount,
    usersRepository.create, .addLegitimateClicks), add re-indexing, or tolerate
  - optimistic energy regen @front: check if works correctly when clock @front differs from server
  - claimAddClick@front: notify user on discrepancy? set UI into "stale" state?
    periodically refetch if stale? (!isUserDataInSync, after clickDebounceIntervalMs; rank refetching for top users?)
    show a note for user about optimistic updates?
  - auth @front: also reissue jwt if API receives { error: 'invalid_token_payload' }, 401
  ..see other TODOs in Main.tsx
- code consistency, DX:
  - "timestamp": use term consistently, substitute ISO strings with numbers (Unix ms)
  - ensure ensureIndexes is idempotent, run ensureIndexes and ensureCollections on app start
  - add CD
  * cleanup remaining CSS from Vite (index.css)
  * app.ts: move non-auth routing to a separate file
  * front: use api.authTelegram in auth.ts
  * share headers between back and front

# Ideas
+ add encouraging phrases on click
