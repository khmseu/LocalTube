## Phase 3 Complete: Streaming, Metadata Enrichment, And Thumbnails

Implemented HTTP range-request streaming for video playback, integrated ffprobe for metadata extraction (duration, codecs, dimensions), and added a thumbnail generation and caching service via ffmpeg. All streaming endpoints handle edge cases correctly (invalid ranges, tool unavailability). Added comprehensive test coverage including graceful degradation when ffmpeg/ffprobe are not available.

**Files created/changed:**
- apps/backend/src/server.ts
- apps/backend/src/db.ts
- apps/backend/tests/server.test.ts
- apps/backend/vitest.config.ts
- apps/backend/package.json
- package-lock.json

**Functions created/changed:**
- `parseRange` in apps/backend/src/server.ts
- `strictParseInt` in apps/backend/src/server.ts
- `probeVideoMetadata` in apps/backend/src/server.ts
- `rescanIntoDatabase` in apps/backend/src/server.ts (updated to call ffprobe)
- `defaultMediaCommandRunner` in apps/backend/src/server.ts
- API endpoints in `buildServer`:
  - GET /api/videos/:id/stream (range request support)
  - GET /api/videos/:id/thumbnail (lazy generation with caching)

**Tests created/changed:**
- `range request returns 206` in apps/backend/tests/server.test.ts
- `invalid range returns 416` in apps/backend/tests/server.test.ts
- `ffprobe metadata persisted` in apps/backend/tests/server.test.ts
- `thumbnail generation cached` in apps/backend/tests/server.test.ts
- `thumbnail endpoint returns 503 when ffmpeg unavailable` in apps/backend/tests/server.test.ts
- `rescan succeeds and metadata remains null when ffprobe unavailable` in apps/backend/tests/server.test.ts
- `malformed numeric ranges rejected (parseInt partial match)` in apps/backend/tests/server.test.ts

**Review Status:** APPROVED

**Git Commit Message:**
feat: add streaming, metadata extraction, and thumbnails

- implement http range request support for video streaming (206/416 semantics)
- integrate ffprobe for metadata extraction (duration, codecs, dimensions)
- add lazy thumbnail generation and filesystem caching via ffmpeg
- include graceful degradation tests for unavailable tools
- reject malformed numeric ranges to prevent bypass attacks
