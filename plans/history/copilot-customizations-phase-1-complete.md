## Phase 1 Complete: Create Compatibility Audit Agent

Created a project-local custom agent that guides compatibility drift reviews with a severity-first output structure. The file is discoverable via trigger phrases and focused on behavior, contract, and documentation consistency checks.

**Files created/changed:**
- .github/agents/compatibility-audit.agent.md

**Functions created/changed:**
- N/A

**Tests created/changed:**
- N/A

**Review Status:** APPROVED

**Git Commit Message:**
feat(agent): add compatibility audit custom agent

- add project-local compatibility audit agent definition
- include schema drift and protocol mismatch trigger phrases
- define severity-first workflow with docs sync checks
