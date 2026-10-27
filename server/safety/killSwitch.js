// AI NOTE: Atomic reservations prevent parallel workers from reusing the same money or AI allowance.
import { integerAmount } from '../storage/db.js';

const resources = new Set(['cash_cents', 'ai_units']);

export function createBudget(store, { clock = () => new Date() } = {}) {
    const { database } = store;
    function periods() {
        const day = clock().toISOString().slice(0, 10);
        return { day, month: day.slice(0, 7) };
    }
    function getUsage(period, resource) {
        if (!resources.has(resource)) throw new TypeError('Unknown budget resource.');
        const limit = database.prepare('SELECT limit_units FROM budget_limits WHERE period = ? AND resource = ?').get(period, resource);
        const { used } = database.prepare(`SELECT coalesce(sum(CASE
			WHEN state IN ('RESERVED', 'UNKNOWN') THEN max(reserved_units, charged_units)
			WHEN state = 'SETTLED' THEN charged_units ELSE 0 END), 0) AS used
			FROM reservations WHERE resource = ? AND (day = ? OR month = ?)`)
            .get(resource, period, period);
        return { period, resource, limit: limit?.limit_units ?? 0, used, remaining: Math.max(0, (limit?.limit_units ?? 0) - used) };
    }
    return {
        getUsage,
        setLimit(period, resource, units) {
            if (!resources.has(resource) || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(period)) throw new TypeError('Invalid budget period or resource.');
            integerAmount(units, 'limit');
            database.prepare('INSERT INTO budget_limits VALUES (?, ?, ?) ON CONFLICT(period, resource) DO UPDATE SET limit_units = excluded.limit_units')
                .run(period, resource, units);
        },
        reserve({ id, resource, units, reference }) {
            integerAmount(units, 'reservation', 1);
            if (typeof id !== 'string' || !id || typeof reference !== 'string' || !reference) throw new TypeError('A reservation ID and reference are required.');
            return store.transaction(() => {
                const existing = database.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
                if (existing) throw new Error('Reservation ID has already been used.');
                const { day, month } = periods();
                for (const period of [day, month]) {
                    if (getUsage(period, resource).remaining < units) throw new Error(`Budget exhausted for ${period}.`);
                }
                database.prepare("INSERT INTO reservations (id, resource, reserved_units, state, day, month, reference, created_at) VALUES (?, ?, ?, 'RESERVED', ?, ?, ?, ?)")
                    .run(id, resource, units, day, month, reference, clock().toISOString());
                return { id, units };
            });
        },
        settle(id, units) {
            integerAmount(units, 'actual usage');
            return store.transaction(() => {
                const entry = database.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
                if (!entry || !['RESERVED', 'UNKNOWN'].includes(entry.state)) throw new Error('Reservation is not open.');
                database.prepare("UPDATE reservations SET charged_units = ?, state = 'SETTLED' WHERE id = ?").run(units, id);
                if (units > entry.reserved_units) {
                    database.prepare("UPDATE campaign SET state = 'SUSPENDED', generation = generation + 1, reason = 'Provider exceeded its reserved usage bound.' WHERE id = 1 AND state != 'GOAL_REACHED'").run();
                }
            });
        },
        markUnknown(id) {
            const result = database.prepare("UPDATE reservations SET state = 'UNKNOWN' WHERE id = ? AND state = 'RESERVED'").run(id);
            if (result.changes !== 1) throw new Error('Reservation is not open.');
        },
        releaseUnsent(id) {
            const result = database.prepare("UPDATE reservations SET state = 'RELEASED' WHERE id = ? AND state = 'RESERVED'").run(id);
            if (result.changes !== 1) throw new Error('Only a provably unsent reservation may be released.');
        },
    };
}
