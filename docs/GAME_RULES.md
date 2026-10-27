# Embodied Execution Rules

AI NOTE: Enforce rules in trusted code, not client animation or prompt persuasion. Business handlers are not implemented yet.

## Canonical Rooms

Source: `config/locked/facilities.json`; runtime geometry and stations: `server/sim/world.js`.

| ID | Purpose | Home class / team |
| --- | --- | --- |
| overseer_office | Command strategy | overseer |
| comms_lab | Five research terminals and five review seats | researcher |
| diner | Marketing and briefing seats | trendsetter / marketing |
| art_studio | Two original design proposals | creative |
| workshop | Deterministic product export | fabricator |
| stock_exchange | Evidence-based price/margin analysis | wallstreet |
| library | Listing copy | copywriter |
| security | Quality, originality, policy inspection | inspector |
| trading_post | Approved Etsy operations | shopkeeper |
| treasury | Real expense/sales reconciliation | accountant |
| records | Accepted artifacts and lessons | archivist |
| kitchen_break_room | Context reset and bounded replacement | deterministic recovery |
| clinic | Reserved supporting space, not context reset | none |
| quarters | Reserved supporting space | none |
| atrium | Circulation/support | none |

## Implemented Movement And Gate

- AI-selected station destinations are the future scheduling contract. The engine already computes four-neighbor A* routes and persists one physical step per 300ms tick. No paid reasoning per tile.
- The UI only selects a worker/room; there is no move endpoint. Deterministic recovery escort is the explicit exception when a worker cannot plan safely.
- An action requires RUNNING campaign generation, valid owned task lease/session generation, authorized class, matching task/worker facility, and a real station of the required kind.
- Admission locks the station and any configured resource reservation. One action per body and two across the vault. Active stations cannot be left until action authority is released.
- Connector and exact-version approval hooks fail closed. Authority is rechecked before dispatch/commit and before accepting the result.
- Dispatched ambiguous usage stays UNKNOWN. Suspension/replacement fences late calls; restart cannot replay writes or clear a halt.

## Remaining Spatial Contracts

Task-specific action allowlists, artifact possession/read authorization, shared-board privacy, author-bound blind packets, simultaneous review-seat quorum, lockers/acknowledged handoffs, transit collision/queue policy, and actual SDK reset/replacement must still be implemented. Existing coordinates and storage tables alone do not provide these workflows.

The diner is marketing, not failure recovery. API authentication/rate-limit outages must pause the connector rather than send every worker into a reset loop. Simulation speed, sprite animation, and headcount cannot change real API pacing, spending caps, or income.
