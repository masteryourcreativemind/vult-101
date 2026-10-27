// AI NOTE: SQLite is the authority for campaign state, resource reservations, and execution history.
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openStore(filename = ':memory:') {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(filename);
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    const version = database.prepare('PRAGMA user_version').get().user_version;
    if (version > 7) {
        database.close();
        throw new Error('Database belongs to a newer application version.');
    }
    if (version === 0) {
        database.exec(`
			BEGIN IMMEDIATE;
			CREATE TABLE campaign (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				profile TEXT NOT NULL CHECK (profile IN ('LIVE_TRIAL', 'LIVE_CAMPAIGN')),
				state TEXT NOT NULL CHECK (state IN ('SETUP', 'RUNNING', 'SUSPENDED', 'GOAL_REACHED')),
				generation INTEGER NOT NULL DEFAULT 1,
				reason TEXT NOT NULL,
				goal_cents INTEGER NOT NULL DEFAULT 100000000,
				updated_at TEXT NOT NULL
			) STRICT;
			INSERT INTO campaign (id, profile, state, reason, updated_at)
				VALUES (1, 'LIVE_TRIAL', 'SETUP', 'Live integrations are not commissioned.', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
			CREATE TABLE events (
				sequence INTEGER PRIMARY KEY AUTOINCREMENT,
				kind TEXT NOT NULL,
				message TEXT NOT NULL,
				details TEXT NOT NULL DEFAULT '{}',
				created_at TEXT NOT NULL
			) STRICT;
			CREATE TABLE budget_limits (
				period TEXT NOT NULL,
				resource TEXT NOT NULL CHECK (resource IN ('cash_cents', 'ai_units')),
				limit_units INTEGER NOT NULL CHECK (limit_units >= 0),
				PRIMARY KEY (period, resource)
			) STRICT;
			CREATE TABLE reservations (
				id TEXT PRIMARY KEY,
				resource TEXT NOT NULL CHECK (resource IN ('cash_cents', 'ai_units')),
				reserved_units INTEGER NOT NULL CHECK (reserved_units > 0),
				charged_units INTEGER NOT NULL DEFAULT 0 CHECK (charged_units >= 0),
				state TEXT NOT NULL CHECK (state IN ('RESERVED', 'SETTLED', 'UNKNOWN', 'RELEASED')),
				day TEXT NOT NULL,
				month TEXT NOT NULL,
				reference TEXT NOT NULL,
				created_at TEXT NOT NULL
			) STRICT;
			CREATE TABLE ledger (
				id TEXT PRIMARY KEY,
				reference TEXT NOT NULL UNIQUE,
				kind TEXT NOT NULL,
				amount_cents INTEGER NOT NULL,
				evidence TEXT NOT NULL,
				reconciled INTEGER NOT NULL CHECK (reconciled IN (0, 1)),
				created_at TEXT NOT NULL
			) STRICT;
			CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT, 'Ledger is append-only'); END;
			CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT, 'Ledger is append-only'); END;
			PRAGMA user_version = 1;
			COMMIT;
		`);
    }
    if (version < 2) {
        database.exec(`
			BEGIN IMMEDIATE;
			CREATE TABLE workers (
				id TEXT PRIMARY KEY, name TEXT NOT NULL, class TEXT NOT NULL, team TEXT NOT NULL,
				x INTEGER NOT NULL, y INTEGER NOT NULL, generation INTEGER NOT NULL DEFAULT 1,
				status TEXT NOT NULL DEFAULT 'IDLE', path TEXT NOT NULL DEFAULT '[]',
				recovery_count INTEGER NOT NULL DEFAULT 0, progress_at TEXT NOT NULL
			) STRICT;
			CREATE TABLE tasks (
				id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, class TEXT NOT NULL,
				facility TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'QUEUED',
				worker_id TEXT REFERENCES workers(id), worker_generation INTEGER,
				lease_token TEXT, lease_until TEXT, campaign_generation INTEGER,
				attempts INTEGER NOT NULL DEFAULT 0, result TEXT, created_at TEXT NOT NULL
			) STRICT;
			CREATE TABLE dependencies (
				task_id TEXT NOT NULL REFERENCES tasks(id), depends_on TEXT NOT NULL REFERENCES tasks(id),
				PRIMARY KEY(task_id, depends_on), CHECK(task_id != depends_on)
			) STRICT;
			CREATE TABLE station_locks (
				station_id TEXT PRIMARY KEY, worker_id TEXT NOT NULL UNIQUE REFERENCES workers(id),
				task_id TEXT NOT NULL REFERENCES tasks(id), lease_token TEXT NOT NULL
			) STRICT;
			CREATE TABLE artifacts (
				id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), author_id TEXT NOT NULL REFERENCES workers(id),
				kind TEXT NOT NULL, version INTEGER NOT NULL, hash TEXT NOT NULL,
				content TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'DRAFT', created_at TEXT NOT NULL,
				UNIQUE(task_id, kind, version)
			) STRICT;
			CREATE TABLE reviews (
				artifact_id TEXT NOT NULL REFERENCES artifacts(id), reviewer_id TEXT NOT NULL REFERENCES workers(id),
				verdict TEXT NOT NULL CHECK(verdict IN ('PASS', 'REVISE', 'BLOCK')),
				notes TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(artifact_id, reviewer_id)
			) STRICT;
			CREATE TABLE operations (
				id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
				kind TEXT NOT NULL, payload_hash TEXT NOT NULL, state TEXT NOT NULL,
				remote_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
			) STRICT;
			PRAGMA user_version = 2;
			COMMIT;
		`);
    }
    if (version < 3) {
        database.exec(`
			BEGIN IMMEDIATE;
			CREATE TABLE approvals (
				id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
				kind TEXT NOT NULL, payload_hash TEXT NOT NULL, payload TEXT NOT NULL,
				state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING', 'APPROVED', 'REJECTED', 'CONSUMED')),
				created_at TEXT NOT NULL, decided_at TEXT
			) STRICT;
			CREATE TRIGGER immutable_artifact_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT, 'Artifacts are immutable'); END;
			CREATE TRIGGER immutable_artifact_delete BEFORE DELETE ON artifacts BEGIN SELECT RAISE(ABORT, 'Artifacts are immutable'); END;
			PRAGMA user_version = 3;
			COMMIT;
		`);
    }
    if (version < 4) {
        database.exec(`
			BEGIN IMMEDIATE;
			-- Fake-money game state; deliberately separate from the real ledger and budgets.
			CREATE TABLE game (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
			PRAGMA user_version = 4;
			COMMIT;
		`);
    }
    if (version < 5) {
        database.exec(`
			BEGIN IMMEDIATE;
			CREATE TABLE connector_permissions (
				connector_id TEXT PRIMARY KEY CHECK (connector_id IN ('copilot', 'models', 'etsy', 'budget')),
				decision TEXT NOT NULL CHECK (decision IN ('OWNER_APPROVED_SETUP_ONLY', 'OWNER_DECLINED')),
				decided_at TEXT NOT NULL
			) STRICT;
			PRAGMA user_version = 5;
			COMMIT;
		`);
    }
    if (version < 6) {
        database.exec(`
			BEGIN IMMEDIATE;
			CREATE TABLE research_orders (
				id TEXT PRIMARY KEY,
				topic TEXT NOT NULL,
				question TEXT NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('COLLECTING', 'PACKETS_COMPLETE', 'BLOCKED')),
				created_at TEXT NOT NULL
			) STRICT;
			CREATE TABLE research_assignments (
				order_id TEXT NOT NULL REFERENCES research_orders(id),
				task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
				worker_id TEXT NOT NULL REFERENCES workers(id),
				artifact_id TEXT UNIQUE REFERENCES artifacts(id),
				PRIMARY KEY(order_id, worker_id),
				UNIQUE(order_id, task_id)
			) STRICT;
			PRAGMA user_version = 6;
			COMMIT;
		`);
    }
    if (version < 7) {
        database.exec(`
			BEGIN IMMEDIATE;
			CREATE TABLE research_syntheses (
				order_id TEXT PRIMARY KEY REFERENCES research_orders(id),
				artifact_id TEXT NOT NULL UNIQUE REFERENCES artifacts(id),
				revision INTEGER NOT NULL CHECK (revision IN (1, 2)),
				review_status TEXT NOT NULL CHECK (review_status IN ('IN_REVIEW', 'REVISION_REQUIRED', 'ACCEPTED', 'BLOCKED')),
				updated_at TEXT NOT NULL
			) STRICT;
			PRAGMA user_version = 7;
			COMMIT;
		`);
    }
    let depth = 0;
    return {
        database,
        transaction(operation) {
            if (operation.constructor.name === 'AsyncFunction') throw new TypeError('Transactions must be synchronous.');
            if (depth > 0) return operation();
            database.exec('BEGIN IMMEDIATE');
            depth += 1;
            try {
                const result = operation();
                if (result?.then) throw new TypeError('Transactions must not return a promise.');
                database.exec('COMMIT');
                return result;
            } catch (error) {
                database.exec('ROLLBACK');
                throw error;
            } finally {
                depth -= 1;
            }
        },
        close() { database.close(); },
    };
}

export function recordEvent(store, kind, message, details = {}, now = new Date()) {
    store.database.prepare('INSERT INTO events (kind, message, details, created_at) VALUES (?, ?, ?, ?)')
        .run(kind, message, JSON.stringify(details), now.toISOString());
}

export function integerAmount(value, name = 'amount', minimum = 0) {
    if (!Number.isSafeInteger(value) || value < minimum || value > 1_000_000_000_000) {
        throw new TypeError(`${name} must be an integer between ${minimum} and 1000000000000.`);
    }
    return value;
}
