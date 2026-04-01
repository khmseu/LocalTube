## Phase 2 Complete: Video Indexing, Catalog, And Resume Data Model

Implemented single-directory video indexing into SQLite, added catalog browse/detail APIs, and introduced resume/progress persistence from the start. Added and expanded backend tests using a tests-first flow, including validation and error-handling edge cases, and verified all workspace tests pass.

**Files created/changed:**
- apps/backend/src/server.ts
- apps/backend/src/db.ts
- apps/backend/src/video-indexer.ts
- apps/backend/tests/server.test.ts
- apps/backend/package.json
- package-lock.json

**Functions created/changed:**
- `createDatabase` in apps/backend/src/db.ts
- `walkVideoFiles` in apps/backend/src/video-indexer.ts
- `toVideoId` in apps/backend/src/video-indexer.ts
- API route handlers in `buildServer` in apps/backend/src/server.ts

**Tests created/changed:**
- `scan inserts videos` in apps/backend/tests/server.test.ts
- `rescan updates and deletes stale entries` in apps/backend/tests/server.test.ts
- `resume position upsert` in apps/backend/tests/server.test.ts
- `resume rejects NaN and Infinity` in apps/backend/tests/server.test.ts
- `rescan returns controlled error for invalid video root` in apps/backend/tests/server.test.ts
- `catalog pagination` in apps/backend/tests/server.test.ts

**Review Status:** APPROVED

**Git Commit Message:**
feat: add sqlite indexing and resume api

- add recursive single-root video indexing into sqlite catalog
- implement catalog list/detail and rescan endpoints under /api
- add resume get/put endpoints with finite-value validation and tests
