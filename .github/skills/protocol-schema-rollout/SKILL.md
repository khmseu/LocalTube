---
name: protocol-schema-rollout
description: Practical workflow for protocol rollout, schema migration, version contract updates, compatibility boundary decisions, and docs sync.
---

Use this skill when planning or implementing changes that alter protocol messages, persisted schemas, API payloads, or cross-service data contracts.

## Workflow

1. Map affected contracts and schemas
- List all touched interfaces: API specs, event payloads, DB schemas, config formats, and client SDK types.
- Mark producers, consumers, storage locations, and deployment order constraints.
- Capture current and target versions for each contract.

2. Define the compatibility boundary
- Decide compatibility policy: backward, forward, both, or breaking.
- Set explicit version contract rules: accepted versions, deprecation window, and removal criteria.
- Document boundary checks for mixed-version operation during rollout.

3. Implement migrations and guards
- Add migrations for stored data and transformation logic for in-flight messages.
- Add runtime guards: version validation, feature flags, fallback parsing, and clear error paths.
- Ensure old and new versions can coexist within the defined boundary.

4. Update docs and examples
- Update protocol docs, schema references, changelog notes, and upgrade guidance.
- Refresh code samples, fixtures, and integration examples to match new contracts.
- Call out breaking behavior and required operator actions.

5. Produce a concise implementation checklist
- Contracts mapped with owners and dependencies.
- Compatibility boundary and version contract documented.
- Migrations implemented and guarded.
- Tests cover old/new interoperability and failure modes.
- Docs and examples updated and reviewed.
