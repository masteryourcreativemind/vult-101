# VULT-101

Public source repository for VULT-101, a local-only operations console for an embodied AI enterprise. The application does not expose a public service. The goal is **$1,000,000 in reconciled net operating profit**, in real USD before personal income tax. The pixel vault represents the work; it is not a fake-money game or an income guarantee.

No open-source license has been selected. Public visibility does not grant permission to reuse or redistribute the code.

## Run

Requires Node.js 24.13 or later and npm.

```sh
npm ci
npm start
```

Open the URL printed by the server, normally <http://127.0.0.1:4310>. If that port is occupied, the server tries the next nine ports. It binds only to `127.0.0.1`.

No configuration file or account is required to inspect the console. Optional launch settings are documented in [.env.example](.env.example). `npm run dev` currently uses the same launch command, without automatic reload. Node 24.13 prints an experimental warning for its built-in SQLite module.

## Current Status

**The first runnable foundation is implemented. Live business execution remains locked.**

- Original Canvas floor plan: 15 rooms, 36 reachable workstations, and a fixed roster of 16 bodies, including five researchers.
- Roster selection, tasks, cash ledger, exact-version approval display, event log, and class instruction editor.
- SQLite persistence, task leases, session generations, station locks, two-action concurrency limit, budget reservations, append-only cash entries, and durable external-operation records.
- Connector permission requests now show the access being sought and store an explicit local owner decision. This does not grant provider OAuth/API access or unlock live execution.
- After approving Copilot setup, the owner can start isolated browser sign-in and explicitly list account-visible models. No inference session is created; live execution and budgets remain locked.
- The Tasks view can queue a research order as five distinct researcher tasks; evidence packets, immutable synthesis, independent reviews, and one-revision rules are enforced. No AI workers or research APIs are connected yet.
- A* movement and deterministic kitchen recovery primitives, covered by isolated tests. With no live agent scheduler, workers correctly remain idle in the application.
- Local HTTP/SSE boundary, revision-protected instruction saves, trial Stop, and campaign Emergency Suspend. The browser cannot start work, move workers, raise budgets, or add income.

**Not connected or implemented yet:** Copilot inference sessions and verified affordable models/allowances, task-scoped worker sessions, live research, physical artifact handoffs, original product generation/inspection, Etsy OAuth and drafts/publishing, and real receipt/invoice reconciliation. Some scaffold files still contain future-work notes.

All cash and AI allowances start at zero. No model requests, shop writes, or purchases run at startup. Empty financial totals mean there are no reconciled entries, not that a connected business has been audited as cost-free.

## Operating Boundaries

Normal creative input is limited to [config/instructions](config/instructions), also editable through **Instructions**. Worker positions, policy, money, keys, and limits are not UI-editable. Publishing approval and suspension are separate operator controls.

`LIVE_TRIAL` exposes Stop trial. `LIVE_CAMPAIGN` exposes Emergency Suspend instead of an ordinary stop. Neither profile authorizes execution. A restart preserves suspension; interrupted external requests are marked unknown rather than retried blindly.

The intended AI/subscription ceiling is $150/month, subject to verified account costs and explicit commissioning. It is not automatically enabled by a setting. Included AI allowance and cash expense are separate resources; no automatic top-ups or paid-provider fallback.

Runtime state is stored in the gitignored SQLite database under `data/`. Keep credentials out of instructions, products, logs, screenshots, and browser payloads. There is no cloud deployment or public authentication layer.

## Verification

```sh
npm test
npm run check:map
```

Tests use isolated databases and instruction fixtures; they do not call a provider, create a listing, or contribute to actual profit. The map checker verifies bounds, capacity, unique stations, and physical routes, including the kitchen.

Implementation status and the remaining commissioning gates are in [docs/PLAN.md](docs/PLAN.md). Architecture is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); contributor rules are in [AGENTS.md](AGENTS.md).
