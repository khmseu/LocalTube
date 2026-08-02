## Plan: Local Copilot Customizations

Add project-local customization assets to reduce repeated prompting and improve review consistency. This adds one custom agent and two skills, then wires discoverability from the project instruction entrypoint.

**Phases 4**
1. **Phase 1: Create Compatibility Audit Agent**
    - **Objective:** Add a custom agent for compatibility drift checks and documentation alignment.
    - **Files/Functions to Modify/Create:** .github/agents/compatibility-audit.agent.md
    - **Tests to Write:** N/A
    - **Steps:**
        1. Create the agent file with actionable discovery description and trigger phrases.
        2. Define workflow for compatibility verification and drift detection.
        3. Add concise output structure and safety constraints.

2. **Phase 2: Create Protocol Schema Rollout Skill**
    - **Objective:** Add a reusable skill for protocol/schema rollout tasks.
    - **Files/Functions to Modify/Create:** .github/skills/protocol-schema-rollout/SKILL.md
    - **Tests to Write:** N/A
    - **Steps:**
        1. Create skill frontmatter and discovery description.
        2. Add workflow checklist for schema/version/migration/docs synchronization.
        3. Add output expectations for concise implementation plans.

3. **Phase 3: Create Commit Review Skill**
    - **Objective:** Add a reusable skill for commit-scoped review and risk checks.
    - **Files/Functions to Modify/Create:** .github/skills/commit-review/SKILL.md
    - **Tests to Write:** N/A
    - **Steps:**
        1. Create skill frontmatter and trigger phrases for commit review requests.
        2. Add review workflow with severity-first findings format.
        3. Add checklist for tests, docs, and regression risk.

4. **Phase 4: Wire Discoverability**
    - **Objective:** Reference new local agent and skills from the project instruction entrypoint.
    - **Files/Functions to Modify/Create:** .github/copilot-instructions.md
    - **Tests to Write:** N/A
    - **Steps:**
        1. Add a short section describing local customizations and intended usage.
        2. Keep existing Mermaid and SonarQube guidance intact.
        3. Verify paths and naming consistency.

**Open Questions**
1. None.
