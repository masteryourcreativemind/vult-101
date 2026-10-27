// AI NOTE: Ambiguous writes are reconciled, never automatically replayed as new operations.
import { contentHash } from './canonical.js';

export function createOperationJournal(store, { clock = () => new Date() } = {}) {
    const { database } = store;
    const get = id => {
        const operation = database.prepare('SELECT * FROM operations WHERE id = ?').get(id);
        return operation ? { ...operation } : null;
    };
    return {
        get,
        prepare({ id, taskId, kind, payload }) {
            if (typeof id !== 'string' || !id || typeof kind !== 'string' || !kind) throw new TypeError('Operation identity is required.');
            return store.transaction(() => {
                const previous = get(id);
                const hash = contentHash(payload);
                if (previous) {
                    if (previous.payload_hash !== hash || previous.task_id !== taskId || previous.kind !== kind) throw new Error('Operation identity conflicts with its original payload.');
                    return previous;
                }
                const now = clock().toISOString();
                database.prepare("INSERT INTO operations (id, task_id, kind, payload_hash, state, created_at, updated_at) VALUES (?, ?, ?, ?, 'PREPARED', ?, ?)").run(id, taskId, kind, hash, now, now);
                return get(id);
            });
        },
        markDispatched(id) {
            if (database.prepare("UPDATE operations SET state = 'DISPATCHED', updated_at = ? WHERE id = ? AND state = 'PREPARED'").run(clock().toISOString(), id).changes !== 1) throw new Error('Operation cannot be dispatched again; reconcile its prior outcome.');
        },
        markUnknown(id) {
            if (database.prepare("UPDATE operations SET state = 'UNKNOWN', updated_at = ? WHERE id = ? AND state = 'DISPATCHED'").run(clock().toISOString(), id).changes !== 1) throw new Error('Operation was not dispatched.');
        },
        settle(id, remoteId) {
            if (typeof remoteId !== 'string' || !remoteId) throw new Error('Remote evidence is required.');
            if (database.prepare("UPDATE operations SET state = 'SUCCEEDED', remote_id = ?, updated_at = ? WHERE id = ? AND state IN ('DISPATCHED', 'UNKNOWN')").run(remoteId, clock().toISOString(), id).changes !== 1) throw new Error('Operation is not awaiting reconciliation.');
        },
        recoverInterrupted() {
            return database.prepare("UPDATE operations SET state = 'UNKNOWN', updated_at = ? WHERE state = 'DISPATCHED'").run(clock().toISOString()).changes;
        },
        list() { return database.prepare('SELECT * FROM operations ORDER BY created_at').all().map(row => ({ ...row })); },
    };
}