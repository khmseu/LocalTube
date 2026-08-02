## Phase 5 Complete: Hardening, Packaging, And Docs

Hardened local-only access rules with strict host and origin checks, added startup config validation for required video root configuration, and finalized run/build scripts with updated documentation. Added tests for host validation, mutating-origin enforcement, and missing video-root configuration, with all workspace tests passing.

**Files created/changed:**
- apps/backend/src/server.ts
- apps/backend/src/index.ts
- apps/backend/tests/server.test.ts
- package.json
- apps/backend/package.json
- apps/frontend/package.json
- README.md

**Functions created/changed:**
- `isAllowedHostHeader` in apps/backend/src/server.ts
- `isAllowedOrigin` in apps/backend/src/server.ts
- `validateServerConfig` in apps/backend/src/server.ts
- `buildServer` request hardening hook in apps/backend/src/server.ts
- `start` in apps/backend/src/index.ts

**Tests created/changed:**
- `host header validation` in apps/backend/tests/server.test.ts
- `origin checks for mutating endpoints` in apps/backend/tests/server.test.ts
- `config validation rejects missing video dir` in apps/backend/tests/server.test.ts

**Review Status:** APPROVED

**Git Commit Message:**
chore: harden local access and finalize run docs

- enforce host and mutating-origin checks for localhost-only access
- validate required video root configuration at startup
- add backend tests for host/origin/config hardening rules
- finalize root/backend/frontend run and build scripts
- document setup, build, and local run workflow in readme
