# AI NOTE: runtime data (gitignored except this file + .gitkeep)

- `vault.sqlite` plus SQLite WAL/SHM sidecars: authoritative campaign, workers, tasks/leases, reservations, immutable cash entries/artifacts, approvals, events, and external operations.
- Database files are created with mode 0600; keep the containing directory private. Backups must preserve consistent SQLite state and unknown-operation liabilities.
- Do not create parallel authoritative JSON balances, reset the database to clear a stop, or count test fixtures as real cash.
- Future `cache/`, `products/`, and `secrets/` hold permitted source caches, original deliverables, and private integration tokens. Those integrations are not connected yet.
- Provider runtime/session directories must be isolated from ambient user-wide tools, credentials, plugins, and memory before live use.
