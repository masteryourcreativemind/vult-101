// AI NOTE: Operator publication decisions bind to an immutable, exact-version payload hash.
import { randomUUID } from 'node:crypto';
import { canonicalJSON, contentHash } from '../storage/canonical.js';
import { recordEvent } from '../storage/db.js';

export function createApprovalQueue(store, { clock = () => new Date() } = {}) {
    const { database } = store;
    const get = id => database.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
    return {
        request({ taskId, kind, payload }) {
            if (!['publish_listing', 'spend_envelope'].includes(kind)) throw new Error('Unknown approval type.');
            const id = randomUUID();
            const hash = contentHash(payload);
            database.prepare('INSERT INTO approvals (id, task_id, kind, payload_hash, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(id, taskId, kind, hash, canonicalJSON(payload), clock().toISOString());
            return { ...get(id), payload: JSON.parse(get(id).payload) };
        },
        decide(id, decision) {
            if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('Invalid operator decision.');
            return store.transaction(() => {
                const changed = database.prepare("UPDATE approvals SET state = ?, decided_at = ? WHERE id = ? AND state = 'PENDING'").run(decision, clock().toISOString(), id);
                if (changed.changes !== 1) throw new Error('Approval is not awaiting a decision.');
                recordEvent(store, 'approval', `Operator ${decision.toLowerCase()} an exact-version request.`, { id, hash: get(id).payload_hash }, clock());
                return { ...get(id), payload: JSON.parse(get(id).payload) };
            });
        },
        check(id, taskId, kind, payload) {
            const approval = get(id);
            return Boolean(approval && approval.state === 'APPROVED' && approval.task_id === taskId && approval.kind === kind && approval.payload_hash === contentHash(payload));
        },
        consume(id, taskId, kind, payload) {
            return store.transaction(() => {
                if (!this.check(id, taskId, kind, payload)) throw new Error('Exact-version approval is absent or already consumed.');
                database.prepare("UPDATE approvals SET state = 'CONSUMED' WHERE id = ?").run(id);
            });
        },
        list() { return database.prepare('SELECT * FROM approvals ORDER BY created_at DESC').all().map(row => ({ ...row, payload: JSON.parse(row.payload) })); },
    };
}
