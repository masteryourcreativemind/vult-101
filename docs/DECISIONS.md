# DECISIONS LOG (AI): append, don't rewrite

- 2026-10-23: Node 24 + vanilla Canvas, no framework, minimal deps. Reason: single user, local, easy to hack.
- 2026-10-23: Server-authoritative sim; LLMs emit intents only; actionGate enforces facility location.
- 2026-10-23: User-editable surface = config/instructions/*.md ONLY.
- 2026-10-23: Digital products first (no shipping/inventory).
- 2026-10-23: Etsy drafts + manual approval by default.
- 2026-10-23: Overseer model "GPT 6.1sol" requested; unverified ID, kept configurable.
- 2026-10-23: Procedural pixel art from palette maps (tools/sprite-gen), no external asset packs.

## Implementation Superseding The Initial Scaffold

- 2026-10-23: User authorized implementation of a real enterprise, not a fake-money game. Goal is $1,000,000 reconciled net operating profit before personal tax, not merely break-even.
- 2026-10-23: SQLite from the first runtime for transactional leases, money/reservations, exact approvals, and durable operation outcomes. JSON scaffold snapshots are not authoritative.
- 2026-10-23: Profiles are LIVE_TRIAL and LIVE_CAMPAIGN; missing integrations leave SETUP, not a user-facing fake SIM. Test doubles stay isolated in tests.
- 2026-10-23: Fixed 16 bodies, five independent researchers, maximum two concurrent gate actions, and a separate recovery kitchen. No autonomous hiring or limit increases.
- 2026-10-23: Initial UI uses original raster sprites generated directly in Canvas, local Lucide icons, Barlow Condensed and IBM Plex Mono fonts. Atlas generation and sound remain optional future work.
- 2026-10-23: Supersede instruction-only wording with narrow administrative exceptions for exact publishing approval and suspension. No ordinary campaign stop, but Emergency Suspend always remains available.
- 2026-10-23: Copilot SDK is a viable integration direction, contrary to old notes. Actual account entitlements/model IDs, restricted tools, usage bounds, and cancellation remain unverified; no automatic provider substitution.
- 2026-10-23: Draft-first/manual publication remains mandatory; remove an AUTO_PUBLISH environment bypass. Any unattended policy envelope needs separate owner approval and implementation.
- 2026-10-23: Default launch port 4310; host is fixed to 127.0.0.1. Development currently uses normal launch because Node 24.13 watch mode attempts to watch an absent optional .env file.
- 2026-10-24: Only the Overseer owns a real provider integration and top-level session; worker minis must be actual bounded SDK-managed subagents spawned/supervised by the Overseer, with no per-dweller clients, credentials, or nested agents.
- 2026-10-24: Use GPT Image 2 to generate original source artwork, then compose and validate it in deterministic POD product templates. The POD fulfillment provider is not selected; Etsy's existing scaffold is digital-download-only. No image/model calls until credentials and enforceable spend limits are commissioned.
