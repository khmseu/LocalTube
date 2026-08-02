# Copilot Instructions

<!-- mermaid-ai-skills:start -->

## Mermaid Diagrams

When the user asks to create, edit, or visualize a diagram, follow the
instructions in `.github/instructions/mermaid.instructions.md`.
<!-- mermaid-ai-skills:end -->

## SonarQube MCP

When the user asks for code quality, static analysis, or SonarQube-related
checks, follow the instructions in
`.github/instructions/sonarqube_mcp.instructions.md`.

## Project Quick Start

- Install deps: `npm install`
- Backend dev: `npm run dev:backend`
- Frontend dev: `npm run dev:frontend`
- Build all: `npm run build`
- Test all: `npm test`

Reference: [README.md](../README.md)

## Architecture Snapshot

- Monorepo with `apps/backend` (Fastify + SQLite) and `apps/frontend` (React + Vite).
- Frontend dev server runs on `127.0.0.1:4173` and proxies `/api` to backend `127.0.0.1:3000`.
- Backend is intentionally loopback-only and applies host/origin validation.

Key files:

- [apps/backend/src/server.ts](../apps/backend/src/server.ts)
- [apps/backend/src/db.ts](../apps/backend/src/db.ts)
- [apps/backend/src/video-indexer.ts](../apps/backend/src/video-indexer.ts)
- [apps/frontend/src/App.tsx](../apps/frontend/src/App.tsx)

## Agent Guardrails

- Use existing npm scripts instead of ad hoc command variants.
- Keep changes scoped to the requested task; avoid unrelated refactors.
- Prefer updating docs when behavior/commands/env defaults change.
- For environment setup, follow [apps/backend/.env.example](../apps/backend/.env.example).

## Local Customizations

Use `.github/agents/compatibility-audit.agent.md` when validating compatibility
drift, schema drift, protocol version mismatches, and documentation sync gaps.

Use `.github/skills/protocol-schema-rollout/SKILL.md` when planning or
implementing protocol or schema rollout steps, versioning, and migration
boundaries.

Use `.github/skills/commit-review/SKILL.md` when reviewing commit-scoped
changes for severity-first findings, regression risks, test gaps, and docs
consistency.
