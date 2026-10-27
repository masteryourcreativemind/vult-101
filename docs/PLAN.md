# Implementation Plan

AI NOTE: The user authorized implementation after planning. Checked items describe local working code, not live commercial evidence.

## 1. Runnable Foundation

- [x] Node 24.13+ ES modules, loopback HTTP, static serving, SSE, and fresh-checkout launch without credentials.
- [x] SQLite migrations, synchronous transactions, durable suspension, append-only cash entries, and fenced task leases.
- [x] Separate cash/AI reservations, daily/monthly admission, unknown-outcome holds, and overshoot suspension primitives.
- [x] Action gate checks role, facility, station, session/task generation, connector, and exact-approval hook; reserves stations and limits concurrency to two.
- [x] Local connector permission requests show intended access and persist owner approve/decline decisions. These decisions do not authenticate providers, set budgets, or enable execution.
- [x] Fixed 16-body roster, five research desks/review seats, marketing seats, and recovery kitchen. Geometry and routes checked by `npm run check:map`.
- [x] A* movement and deterministic escort/recovery state. No live provider session replacement is claimed.
- [x] Payload-bound one-use approvals, immutable artifact storage constraints, and external-operation journal with unknown-outcome recovery.
- [x] Canvas console, roster/tasks/ledger/approvals/log, revision-safe instruction editing, trial Stop, and campaign Emergency Suspend.
- [x] Isolated contract tests for these primitives. No live APIs or financial fixtures enter the real database.

## 2. Embodied Collective Work

- [x] Server-authored research orders, five fixed researcher assignments, and evidence packet provenance validation/isolated submission.
- [x] Immutable synthesis artifacts, two non-author reviews including the verifier, and an at-most-one-revision acceptance/block state machine.
- [ ] Distinct task-scoped scientist contexts and task-specific action allowlists.
- [ ] Five blind initial evidence packets: source/time/observations/sample/method/limitations, with inference distinguished from actual measurements.
- [ ] Execute synthesis/review through isolated model sessions and provide authenticated, task-scoped packet access; current state-machine tests use synthetic fixtures only.
- [ ] Room-authorized artifact reads and acknowledged exact-version physical marketing handoff.
- [ ] Dependency workflow through marketing brief, two design proposals, fabrication, inspection, draft, approval, accounting, and lessons.
- [ ] Watchdog for invalid/repeating intents, progress/deadline limits, actual context reset, one replacement, then blocked task. Connector outages must not trigger replacement storms.

## 3. Restricted Copilot Adapter

- [x] Pin the Copilot SDK; add isolated, owner-triggered browser sign-in and explicit account model discovery with sanitized process environment. No inference session is created.
- [ ] Only the Overseer owns the authenticated provider client and top-level model session. Verify account entitlement and affordable worker models.
- [ ] Implement workers as literal SDK-managed subagents created and supervised by the Overseer, not separate per-dweller provider clients or pretend/deterministic AI brains. Enforce task-scoped context, tool allowlists, usage limits, and no nested subagents.
- [ ] Deny built-in shell/filesystem/network, ambient plugins/MCP/memory, arbitrary permissions, and nested untracked agents on create and resume.
- [ ] Test explicit abort/disconnect and stale output fencing; a Promise timeout is not proof that remote inference stopped.
- [ ] Bound all continuation/retry/tool-loop usage, preserve account allowance for other use, and keep provider overage disabled.
- [ ] Couple reservations to verified cash/usage settlement; handle prior-period unknown liabilities and actual subscription charges.
- [ ] One small real inference only with explicit spend authorization. Do not authenticate or purchase services merely because the owner is away.

## 4. Real Read-Only Research

- [ ] Verify approved Etsy app/shop eligibility, current OAuth PKCE/HTTPS callback, scopes, rate limits, and creativity/disclosure policy.
- [ ] Trusted credential broker, centrally paced/cache-aware reads, provenance, and bounded retry/circuit-breaker behavior.
- [ ] Run and inspect one real five-scientist report and marketing handoff. Search/favorites/prices are proxies, not verified competitor sales.

## 5. GPT Image 2, POD Products, And Draft Operations

- [ ] Integrate GPT Image 2 for original source artwork with explicit model selection, separate image-API credentials, pre-reserved usage limits, and no paid fallback.
- [ ] Compose generated artwork into deterministic, versioned POD product templates; validate print-area placement, dimensions, bleed/safe zones, color/export profiles, and product-specific file requirements before mockup or listing generation.
- [ ] Select and verify a print-on-demand provider and its current product/template, draft, fulfillment, cancellation, and reconciliation APIs. The Etsy scaffold is digital-download-only and is not a POD fulfillment connection.
- [ ] Produce original functional printable files and truthful previews of the actual final assets, with licensed fonts/assets.
- [ ] Deterministic package/format/dimension/text checks plus original-content, IP-risk, claims, and policy inspection.
- [ ] Real POD product/listing draft creation, upload, and readback through the operation journal; unknown writes reconcile rather than replay blindly.
- [ ] Exact inspected payload/version/price approval before one separately authorized publication. No unattended publishing by default.

## 6. Real Trial And Campaign

- [ ] Verify real stop/abort/restart behavior against commissioned adapters without pretending to undo remote writes.
- [ ] Reconcile actual shop/campaign-attributed sales, refunds, taxes, marketplace fees, invoices, subscription cost, and payout evidence.
- [ ] $1,000,000 net-profit latch requires genuine reconciled entries and no unresolved cost/write liabilities. No forecast or test revenue qualifies.
- [ ] Campaign opt-in and any unattended publishing envelope need separate owner approval. Emergency suspension always remains available.
- [ ] Outcome-driven learning and measured cost per product; no automatic cap increases, paid fallback, hiring, or guaranteed sales.

Missing prerequisites leave the application in SETUP/SUSPENDED. Tests and local screenshots do not establish Etsy policy compliance, account entitlement, a working live agent team, or commercial success.
