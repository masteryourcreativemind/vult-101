// AI NOTE: Only reconciled, campaign-attributed cash entries count toward the real profit goal.
import { randomUUID } from 'node:crypto';
import { integerAmount, recordEvent } from '../storage/db.js';

const expenses = new Set(['refund', 'marketplace_fee', 'ai_cash_cost', 'subscription_cost', 'business_cost']);

export function createLedger(store, { clock = () => new Date() } = {}) {
    const { database } = store;
    const entries = () => database.prepare('SELECT * FROM ledger ORDER BY created_at, id').all().map(entry => ({ ...entry }));
    function totals() {
        const rows = database.prepare('SELECT kind, sum(amount_cents) AS amount FROM ledger WHERE reconciled = 1 GROUP BY kind').all();
        const byKind = Object.fromEntries(rows.map(row => [row.kind, row.amount]));
        const goalCents = database.prepare('SELECT goal_cents FROM campaign WHERE id = 1').get().goal_cents;
        const netCents = rows.reduce((sum, row) => sum + row.amount, 0);
        return {
            grossSalesCents: byKind.sale ?? 0,
            refundCents: -(byKind.refund ?? 0),
            marketplaceFeeCents: -(byKind.marketplace_fee ?? 0),
            aiCashCents: -(byKind.ai_cash_cost ?? 0) - (byKind.subscription_cost ?? 0),
            businessCostCents: -(byKind.business_cost ?? 0),
            netCents, goalCents, progress: Math.max(0, Math.min(1, netCents / goalCents)),
            entryCount: entries().length,
        };
    }
    return {
        entries,
        totals,
        recordSettled({ reference, kind, amountCents, evidence }) {
            integerAmount(amountCents, 'cash amount', 1);
            if (kind !== 'sale' && !expenses.has(kind)) throw new TypeError('Unrecognized cash entry kind.');
            if (typeof reference !== 'string' || !reference || reference.length > 300 || typeof evidence !== 'string' || evidence.trim().length < 3 || evidence.length > 2000) throw new TypeError('A unique reference and reconciliation evidence are required.');
            const signed = expenses.has(kind) ? -amountCents : amountCents;
            return store.transaction(() => {
                const existing = database.prepare('SELECT * FROM ledger WHERE reference = ?').get(reference);
                if (existing) {
                    if (existing.kind !== kind || existing.amount_cents !== signed || existing.evidence !== evidence) throw new Error('Cash reference conflicts with an existing entry.');
                    return { ...existing };
                }
                const id = randomUUID();
                database.prepare('INSERT INTO ledger (id, reference, kind, amount_cents, evidence, reconciled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
                    .run(id, reference, kind, signed, evidence, clock().toISOString());
                recordEvent(store, 'ledger', 'Reconciled cash entry recorded.', { id, kind, amountCents: signed }, clock());
                return { ...database.prepare('SELECT * FROM ledger WHERE id = ?').get(id) };
            });
        },
        latchGoal() {
            return store.transaction(() => {
                if (totals().netCents < totals().goalCents) return false;
                if (database.prepare("SELECT 1 FROM reservations WHERE state IN ('RESERVED', 'UNKNOWN') LIMIT 1").get() ||
                    database.prepare("SELECT 1 FROM operations WHERE state NOT IN ('SUCCEEDED', 'UNSENT') LIMIT 1").get()) return false;
                const campaign = database.prepare('SELECT state FROM campaign WHERE id = 1').get();
                if (campaign.state === 'GOAL_REACHED') return true;
                database.prepare("UPDATE campaign SET state = 'GOAL_REACHED', generation = generation + 1, reason = 'Reconciled net operating profit goal reached.', updated_at = ? WHERE id = 1").run(clock().toISOString());
                recordEvent(store, 'goal', 'Real net operating profit target reached.', { netCents: totals().netCents }, clock());
                return true;
            });
        },
    };
}
