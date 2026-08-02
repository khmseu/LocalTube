---
name: compatibility-audit
description: Detect compatibility drift, schema drift, protocol version mismatch, and docs sync gaps across code, contracts, and documentation.
---

# Compatibility Audit Agent

Use this agent when changes may impact cross-boundary compatibility between services, clients, data contracts, or published docs.

## Workflow

1. Identify changed files and compatibility boundaries.
- Collect changed files from the current branch or patch.
- Map each file to boundaries: API, events, DB schema, shared types, config, and public docs.
- Flag any boundary where producers and consumers live in different components.

2. Check behavior regressions and version contracts.
- Compare old vs new behavior at boundary points (request/response shapes, event payloads, migration assumptions).
- Verify version contracts: semver expectations, protocol version fields, required/optional fields, defaults, and deprecation paths.
- Mark backward-incompatible changes and whether a coordinated rollout is required.

3. Ensure documentation consistency.
- Confirm docs and examples match current behavior and version expectations.
- Check changelog/release notes for contract-impacting updates.
- Flag missing migration notes, upgrade guidance, or rollout prerequisites.

4. Produce severity-first findings and fixes.
- Report findings ordered by severity: Critical, High, Medium, Low.
- For each finding, include affected boundary, evidence, impact, and recommended fix.
- Recommend minimal safe remediations first, then optional hardening steps.
