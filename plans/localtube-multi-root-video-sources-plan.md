## Plan: Multi-root Recursive Video Sources

This changes LocalTube from a single configured video root to a list of roots, each searched recursively. The scanner already walks subdirectories, so the main work is config parsing, root-aware persistence, and resolving stream/thumbnail paths against the correct source root.

**Phases 4**
1. **Phase 1: Config Contract Expansion**
    - **Objective:** Replace the single-root config with a multi-root list and update startup validation accordingly.
    - **Files/Functions to Modify/Create:** [apps/backend/src/server.ts](../apps/backend/src/server.ts), [apps/backend/src/index.ts](../apps/backend/src/index.ts), [apps/backend/tests/server.test.ts](../apps/backend/tests/server.test.ts), [apps/backend/.env.example](../apps/backend/.env.example), [README.md](../README.md)
    - **Tests to Write:** config accepts a list of roots; empty list is rejected; malformed list is rejected; startup wiring passes the parsed list through unchanged
    - **Steps:**
        1. Add failing tests for list-based config parsing and validation.
        2. Run backend tests to confirm the new cases fail.
        3. Implement multi-root parsing and validation at the config boundary.
        4. Re-run backend tests to confirm config behavior passes.

2. **Phase 2: Root-aware Catalog Schema**
    - **Objective:** Store enough source provenance per indexed video to distinguish identical relative paths from different roots.
    - **Files/Functions to Modify/Create:** [apps/backend/src/db.ts](../apps/backend/src/db.ts), [apps/backend/src/video-indexer.ts](../apps/backend/src/video-indexer.ts), [apps/backend/src/server.ts](../apps/backend/src/server.ts), [apps/backend/tests/server.test.ts](../apps/backend/tests/server.test.ts)
    - **Tests to Write:** same relative path under different roots creates distinct records; catalog identity stays stable per root; prune logic does not remove valid rows from other roots
    - **Steps:**
        1. Add failing tests for duplicate relative-path scenarios across roots.
        2. Run backend tests to confirm the catalog assumptions fail.
        3. Implement root provenance in persistence and identity handling.
        4. Re-run backend tests to confirm catalog behavior passes.

3. **Phase 3: Multi-root Rescan and Read-path Resolution**
    - **Objective:** Scan all configured roots in one rescan cycle and resolve playback assets against the correct root for each row.
    - **Files/Functions to Modify/Create:** [apps/backend/src/server.ts](../apps/backend/src/server.ts), [apps/backend/tests/server.test.ts](../apps/backend/tests/server.test.ts)
    - **Tests to Write:** rescan indexes videos from every configured root; stream endpoint resolves the correct physical file; thumbnail endpoint resolves the correct physical file; deleting a file in one root does not affect matching files in another root
    - **Steps:**
        1. Add failing API tests for multi-root scan and asset resolution.
        2. Run backend tests to see the current single-root assumptions fail.
        3. Implement multi-root rescan orchestration and per-row path reconstruction.
        4. Re-run backend tests to confirm request-time resolution passes.

4. **Phase 4: Docs and Regression Lock-in**
    - **Objective:** Update docs and lock in regression coverage for the new config contract and recursive multi-root behavior.
    - **Files/Functions to Modify/Create:** [README.md](../README.md), [apps/backend/.env.example](../apps/backend/.env.example), [apps/backend/tests/server.test.ts](../apps/backend/tests/server.test.ts)
    - **Tests to Write:** legacy single-root startup is no longer accepted; recursive discovery remains covered; core list and playback endpoints still pass under multi-root config
    - **Steps:**
        1. Add or update regression tests around the final supported config contract.
        2. Run backend tests to confirm the documentation-backed behavior is exercised.
        3. Update docs and examples to show the new list-based environment variable.
        4. Re-run backend tests to confirm everything stays green.

**Open Questions**
1. None; the config direction is now fixed to new multi-root input only.