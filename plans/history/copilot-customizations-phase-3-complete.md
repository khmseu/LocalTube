## Phase 3 Complete: Create Commit Review Skill

Added a project-local commit-review skill that standardizes severity-first review output and focuses on regression risk, missing tests, and documentation mismatches. This reduces repeated prompting for review format and priorities.

**Files created/changed:**
- .github/skills/commit-review/SKILL.md

**Functions created/changed:**
- N/A

**Tests created/changed:**
- N/A

**Review Status:** APPROVED

**Git Commit Message:**
feat(skill): add commit review workflow skill

- add project-local commit-review skill definition
- prioritize severity-first findings and regression checks
- include test-gap and docs-mismatch review checklist
