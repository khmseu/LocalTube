## Plan: LocalTube Web Interface

Build a local-only YouTube-like web app with TypeScript on both server and browser. The backend will index one configured video directory, provide metadata/search/resume APIs, and stream media with range support; the frontend will provide browse/watch/search UX similar to YouTube for local libraries.

**Phases 5**
1. **Phase 1: Workspace And App Skeleton**
    - **Objective:** Scaffold a strict TypeScript full-stack workspace with backend and frontend apps, and enforce localhost-only access at server bootstrap.
    - **Files/Functions to Modify/Create:** package manifests, tsconfig files, backend app bootstrap and localhost guard, frontend app shell, dev scripts.
    - **Tests to Write:** `server starts on loopback only`, `non-loopback request blocked`, `frontend shell renders`.
    - **Steps:**
        1. Write failing tests for backend localhost-only behavior and frontend shell rendering.
        2. Create monorepo structure and strict TypeScript configs for server and browser builds.
        3. Implement minimal backend and frontend integration to pass tests.

2. **Phase 2: Video Indexing, Catalog, And Resume Data Model**
    - **Objective:** Index a single configured video directory into SQLite and include resume tracking model from day one.
    - **Files/Functions to Modify/Create:** scanner module, SQLite schema/migrations, catalog repository, resume repository, indexing API routes.
    - **Tests to Write:** `scan inserts videos`, `rescan updates/deletes stale entries`, `resume position upsert`, `catalog pagination`.
    - **Steps:**
        1. Write failing tests for scanner, catalog persistence, and resume persistence behaviors.
        2. Implement SQLite schema and repository methods for videos and playback progress.
        3. Implement indexing and list/detail API endpoints to satisfy tests.

3. **Phase 3: Streaming, Metadata Enrichment, And Thumbnails**
    - **Objective:** Stream videos with robust range handling, extract metadata via ffprobe, and generate cached thumbnails via ffmpeg.
    - **Files/Functions to Modify/Create:** range streaming handler, metadata enricher, thumbnail service/cache, media endpoints.
    - **Tests to Write:** `range request returns 206`, `invalid range returns 416`, `ffprobe metadata persisted`, `thumbnail generation cached`.
    - **Steps:**
        1. Write failing tests around streaming semantics, metadata extraction, and thumbnail cache behavior.
        2. Implement range-safe streaming and ffprobe integration.
        3. Implement lazy thumbnail generation and caching to pass tests.

4. **Phase 4: YouTube-Like Frontend Browse And Watch Experience**
    - **Objective:** Build a responsive UI with feed/search/watch pages and connect playback and resume APIs.
    - **Files/Functions to Modify/Create:** app shell, browse grid, search UI, watch page/player, API query hooks, resume sync logic.
    - **Tests to Write:** `browse grid renders paged videos`, `search param state reflected in URL`, `watch page loads stream URL`, `resume posted on playback updates`.
    - **Steps:**
        1. Write failing component/integration tests for browse/search/watch/resume flows.
        2. Implement pages/components and API integration for catalog and playback.
        3. Implement resume syncing and responsive layout behavior to pass tests.

5. **Phase 5: Hardening, Packaging, And Docs**
    - **Objective:** Harden local-only protections, finalize scripts, and provide clear setup/run docs.
    - **Files/Functions to Modify/Create:** host/origin validation middleware, config validation, production build scripts, README.
    - **Tests to Write:** `host header validation`, `origin checks for mutating endpoints`, `config validation rejects missing video dir`.
    - **Steps:**
        1. Write failing tests for hardening and config validation behaviors.
        2. Implement middleware and validation with least-privilege defaults.
        3. Finalize scripts and documentation, then run targeted tests.

**Open Questions 0**
Resolved during approval:
1. One video root directory.
2. ffmpeg/ffprobe dependency is acceptable.
3. Resume/progress support starts in early architecture (Phase 2 and frontend integration in Phase 4).
