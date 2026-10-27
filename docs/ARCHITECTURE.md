# Architecture

AI NOTE: SQLite and server authority are implemented; the Overseer-owned model runtime, managed subagents, image generation, and business workflows below remain future work.

```text
Owner-authorized instructions / approval / suspension
                  |
Browser Canvas + console <-- SSE snapshots -- Local Node server (127.0.0.1)
                  |                               |
                  +-- same-origin token POST ------+
                                                  |
                  SQLite <--- tasks / control / world / budgets / journal
                                                  |
                  Overseer-owned provider session (not connected)
                          |
                  managed, task-scoped subagents (not connected)
                          |
                  trusted actionGate <-- validated intents
                          |
                  commissioned handlers / credential broker (not connected)
```

## Implemented Ownership

| Surface | Owner |
| --- | --- |
| Composition, snapshot projections, lifecycle | `server/index.js` |
| HTTP origin/token checks and commands | `server/http/routes.js` |
| Confined public/vendor assets, SSE clients | `server/http/static.js`, `server/http/sse.js` |
| SQLite migrations, transactions, immutable records | `server/storage/db.js` |
| Exact canonical JSON and hashes, operation state | `server/storage/canonical.js`, `server/storage/operations.js` |
| Fixed roster, room geometry, authoritative coordinates | `server/sim/world.js`, `config/locked/facilities.json`, `config/locked/classes.json` |
| Four-neighbor A*, persisted paths, step movement | `server/sim/pathfinding.js`, `server/sim/movement.js` |
| Lease claims, dependencies, session/campaign fencing | `server/coordination/tasks.js` |
| Facility-bound admission, dispatch, commit, station locks | `server/sim/actionGate.js` |
| Suspension, cash/AI reservations, exact approvals | `server/safety/control.js`, `server/safety/killSwitch.js`, `server/safety/approvalQueue.js` |
| Append-only reconciled cash primitive and goal latch | `server/economy/ledger.js` |
| Deterministic restart recovery and kitchen escort | `server/agents/scheduler.js` (`createRecovery`, not an AI scheduler) |
| Class whitelist and atomic revision-checked saves | `server/agents/instructions.js` |
| DOM console, local raster sprites, Canvas projection | `public/js/main.js`, `net.js`, `assets.js`, `renderer.js` |

The geometry currently comes from the room definitions plus `mapSize`/`isWalkable`, not the unused scaffold map JSON. The server advances movement every 300ms without a model call per tile. The browser selects workers/rooms only and never initiates movement or business work.

## Local Boundary

- GET bootstrap/state/health, SSE, instructions by known class, and confined static assets.
- POST instruction text with exact revision, approval decision by ID, or stop/suspend. No start/resume/settings/generic-tool/money endpoint.
- Exact loopback Host and Origin, server-session token, bounded JSON, CSP, no raw event details or task lease tokens in snapshots.
- SQLite mutations are synchronous transactions; never hold a transaction open around network I/O.
- The registered live action/handler set is empty. All four commissioning indicators are unready and both resource caps default to zero.

## Pending Execution Pipeline

Overseer (single top-level provider connection) -> literal SDK-managed, task-scoped subagents -> five independent lab packets -> frozen synthesis -> two non-author reviews at lab review seats -> accepted exact-version report -> physically acknowledged marketing handoff -> product brief -> original GPT Image 2 artwork -> deterministic product/POD template composition and fabrication -> inspection -> provider-specific draft -> exact owner approval -> publication/fulfillment -> real accounting -> accepted lessons.

## AI Runtime Ownership

Only the Overseer may own the provider client, credentials, and top-level session. The Overseer must delegate worker work to actual SDK-managed subagents; dwellers are not separate provider integrations and must not create their own clients or hold credentials. Subagents receive only their task lease, role-scoped context/artifacts, and narrow allowlists; they cannot spawn nested agents or dispatch business actions around the server action gate. Subagent usage, cancellation, and stale-result fencing must be charged to and controlled by the Overseer-owned runtime. This is a required design; it is not implemented yet.

## Image And POD Pipeline

Use the explicit GPT Image 2 API model for original source artwork, then place that artwork into deterministic, versioned product templates with validated print areas, dimensions, bleed/safe zones, color/export settings, and truthful mockups. Generated source art is not itself a finished sellable item. Image API credentials and spend limits are separate from Copilot credits. The current Etsy scaffold is for digital downloads; no print-on-demand fulfillment provider is selected or connected, so physical product publishing/fulfillment remains blocked pending provider choice and integration.

Models receive only task-authorized concise context and artifacts, never other workers' full private sessions or raw credentials. Author-bound artifact APIs, room boards/handoffs, bounded critiques, task-specific tool allowlists, restricted SDK sessions, image processing/templates, and all real product/marketplace handlers still need implementation.

## Recovery And Money

In-flight actions lock stations and recheck authority before dispatch and commit. Suspension or worker-generation replacement fences late results. Timeouts hold dispatched resource reservations as UNKNOWN; the journal prevents a prepared operation from being silently replayed after dispatch.

Restart suspends a previously running campaign, marks ambiguous reservations/operations unknown, blocks interrupted task leases, and clears old station locks. Physical kitchen escort and generation changes work locally; actual SDK abort, context recreation, and replacement semantics are not connected yet.

Ledger values are integer USD cents with unique evidence references and immutable rows. No API ingests actual receipts/invoices yet. Billing reconciliation, campaign attribution, tax/payout handling, and prior-period liabilities must be completed before the primitive goal latch can represent audited commercial progress.
