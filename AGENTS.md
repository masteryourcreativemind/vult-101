# VULT-101 - AI MEMORY (read this first, every session)

AI NOTE: Contributor memory; keep implementation status accurate and distinguish working code from scaffold notes.

## Product And Authorization

- This is a real, single-owner AI enterprise visualized as an original aerial pixel vault, not a fake-money game.
- Goal: $1,000,000 cumulative reconciled net operating profit in USD, before personal tax. No income or timing guarantee.
- The user said **Start implementation**, superseding the earlier notes-only restriction. Code and local validation are authorized; spending, account changes, live inference, and Etsy writes are not.
- The user is away and prefers conservative recommended choices over questions. Missing credentials or approvals mean a visible setup gate, never invented success.
- One supreme commander uses the existing `overseer` identity. Requested "GPT 6.1sol" is not a verified executable model ID; verify model discovery and account entitlement before any adapter uses it.

## Hard Rules

1. Normal user editing is limited to `config/instructions/*.md`. Explicit publishing approval and emergency controls are administrative exceptions. No browser movement, map editing, money insertion, key exposure, or budget changes.
2. AI chooses normal destinations; A* computes physical paths. Deterministic escort to `kitchen_break_room` is the recovery-only exception. No teleporting to obtain action authority.
3. Every business tool must pass `server/sim/actionGate.js`: trusted identity/session generation, task lease, role, facility, station, connector, budget, and exact approval. Recheck before dispatch and result commit; reserve the station while work runs.
4. Owner authorizes capabilities/spend; commander proposes strategy; deterministic server executes. Models and instructions cannot raise limits, approve themselves, or change financial records.
5. Fixed 16 bodies: commander, five researchers, three marketing, three design, inspector, shopkeeper, accountant, archivist. At most two concurrent gate actions, one per worker. No automatic hiring.
6. Five independent research packets precede synthesis; two non-author reviewers including the skeptic, at most one revision, immutable accepted report, acknowledged exact-version marketing handoff. This workflow is not implemented yet.
7. Draft-first Etsy. Publishing requires exact inspected-version owner approval. No `AUTO_PUBLISH` bypass. Unattended policy envelopes need separate explicit authorization and implementation.
8. Intended AI/subscription ceiling is $150/month; current effective allowance is zero. Separate included AI quota from actual cash. No auto top-up, paid fallback, subscription purchase, or account-entitlement assumptions.
9. Unknown remote outcomes retain reservations and block blind replay. Suspension, session fencing, and goal completion survive restart. Trial has Stop; campaign always retains Emergency Suspend.
10. Secrets belong only in gitignored `.env` or `data/secrets/`. Never log them, expose them to models/browser, or put them in notes. Copilot child sessions must not inherit unrestricted credentials, shell/filesystem, ambient MCP/plugins, or nested agents.
11. Original products only; no competitor artwork, trademarks, franchise characters, celebrity claims, or vault-theme IP in sold files. Current Etsy creativity/AI-disclosure policy is a launch gate, not legal clearance from an LLM.
12. Server binds only `127.0.0.1`. No cloud deployment, public callback relay, or changes to unrelated A2/cPanel projects.

## Stack And Commands

- Node.js 24.13+, plain ES modules, built-in HTTP/fetch and `node:sqlite`. SQLite is authoritative from the first runtime; no parallel JSON money/state store.
- Vanilla Canvas with integer raster scaling and disabled smoothing; local Lucide SVG icons and Fontsource fonts. Minimal pinned dependencies and lockfile.
- `npm ci`, `npm start` (or `npm run dev`, currently without watch mode). Defaults to port 4310, trying nine following ports if occupied.
- `npm test`; `npm run check:map`. Tests use isolated fixtures and never count as actual income or external integration evidence.
- Use Context7 for current package/API docs. Preserve a one-line AI NOTE in implementation files. Never commit, delete user data, or revert unrelated work without authorization.

## Implemented Foundation

- SQLite migrations/transactions, persistent control state, task leases/generations, station occupancy, budget reservations, immutable cash ledger, approval hashes, and operation journal.
- Fifteen rooms, 36 connected workstations, 16 seeded bodies, A* movement, and deterministic physical kitchen escort/recovery state.
- Loopback-only HTTP and SSE, static asset confinement, origin/session-token protections, revision-checked atomic instruction editor, trial/campaign suspension controls.
- Version 5 SQLite migration and authenticated connector permission requests; local owner approval is setup intent only and never grants provider access or execution authority.
- Operational Canvas console with roster, tasks, ledger, approvals, log, original raster sprites, and honest unconnected-system status. No fake work animation or money.

## Pending Before Live Work

- No live action handlers or AI scheduler are registered. Copilot SDK/session isolation, verified models, allowance bounds, actual abort semantics, and provider admission must be implemented and tested.
- Research provenance, author-bound artifact/review workflow, task-specific tool allowlists, physical handoffs, actual session reset/replacement, product creation/inspection, Etsy OAuth/writes, and receipt/invoice reconciliation remain pending.
- Reconcile reservation-to-ledger charges, campaign attribution/taxes/settled payouts, subscription costs, and outstanding liabilities across period rollover before live spending or goal claims.
- Existing integration/action/product modules may still be notes-only. Do not treat a placeholder, database table, or passing unit test as a completed external workflow.
- Previous scaffold Etsy auth URLs and "Copilot is not callable" claims were stale. Reverify the SDK and current Etsy OAuth/HTTPS, rate-limit, policy, and scope requirements; see `docs/INTEGRATIONS.md`.

## Next Work

See `docs/PLAN.md` and `docs/ARCHITECTURE.md`. Continue with the versioned five-scientist workflow and restricted adapter boundary. Keep the app in SETUP/SUSPENDED until commissioning prerequisites and owner authorization are actually satisfied.
