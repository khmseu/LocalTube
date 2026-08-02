---
name: commit-review
description: Commit-scoped review workflow for commit review, review staged changes, regression risk, missing tests, and docs mismatch checks.
---

# Skill: Commit Review

Use this skill for focused review requests on a commit or staged diff.

## Workflow

1. Gather scope

- Review only the commit or staged changes requested.
- Identify touched files, behavior changes, and public contract impact.

2. Report severity-first findings

- List findings by severity: critical, high, medium, low.
- For each finding, include file reference, risk, and minimal fix guidance.

3. Prioritize behavior and regression risk

- Flag behavior changes that can break existing flows or compatibility.
- Call out risky assumptions, edge cases, and rollback concerns.

4. Check test coverage gaps

- Verify whether changed behavior is covered by tests.
- Identify missing unit, integration, or regression tests.

5. Check documentation mismatch

- Compare code changes against README, API docs, examples, and comments.
- Flag stale or missing docs caused by the change.

6. End with a concise summary

- Status: approve, approve with follow-ups, or changes requested.
- Summary format: top risks, required fixes, optional improvements.
