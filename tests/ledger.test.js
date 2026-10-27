// AI NOTE: Money and resource controls use integer units and preserve uncertainty across restarts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/storage/db.js';
import { createBudget } from '../server/safety/killSwitch.js';
import { createControl } from '../server/safety/control.js';
import { createLedger } from '../server/economy/ledger.js';
test('real cash entries are append-only, deduplicated, and net of actual expenses', context => {
    const { store } = fixture(context);
    const ledger = createLedger(store);
    const entry = { reference: 'receipt-1', kind: 'sale', amountCents: 2500, evidence: 'Settled campaign receipt 1' };
    ledger.recordSettled(entry);
    ledger.recordSettled(entry);
    ledger.recordSettled({ reference: 'subscription-oct', kind: 'subscription_cost', amountCents: 10000, evidence: 'Paid monthly provider invoice' });
    ledger.recordSettled({ reference: 'fee-1', kind: 'marketplace_fee', amountCents: 250, evidence: 'Marketplace payment statement' });
    assert.equal(ledger.totals().netCents, -7750);
    assert.equal(ledger.totals().entryCount, 3);
    assert.throws(() => ledger.recordSettled({ ...entry, amountCents: 5000 }), /conflicts/);
    assert.throws(() => store.database.prepare('DELETE FROM ledger').run(), /append-only/);
    assert.throws(() => store.database.prepare("UPDATE ledger SET amount_cents = 999999").run(), /append-only/);
});

test('the profit goal latches only on reconciled net cash and cannot restart', context => {
    const { store, control, budget } = fixture(context);
    const ledger = createLedger(store);
    ledger.recordSettled({ reference: 'goal-receipt', kind: 'sale', amountCents: 100000000, evidence: 'Isolated test settlement' });
    budget.reserve({ id: 'pending', resource: 'cash_cents', units: 200, reference: 'unresolved-run' });
    budget.markUnknown('pending');
    assert.equal(ledger.latchGoal(), false);
    budget.settle('pending', 0);
    assert.equal(ledger.latchGoal(), true);
    assert.equal(control.get().state, 'GOAL_REACHED');
    assert.throws(() => control.start({ ready: true }), /completed campaign/);
});

const clock = () => new Date('2026-10-23T12:00:00.000Z');

function fixture(context, filename = ':memory:') {
    const store = openStore(filename);
    context.after(() => store.close());
    const budget = createBudget(store, { clock });
    budget.setLimit('2026-10', 'cash_cents', 15000);
    budget.setLimit('2026-10-23', 'cash_cents', 500);
    return { store, budget, control: createControl(store, { clock }) };
}

test('new campaigns fail closed rather than silently starting fake or live work', context => {
    const { control } = fixture(context);
    assert.equal(control.get().state, 'SETUP');
    assert.throws(() => control.start(), /commissioned/);
    assert.throws(() => control.assertRunning(), /not running/);
});

test('concurrent admissions cannot claim the same remaining budget', async context => {
    const { budget } = fixture(context);
    const attempts = await Promise.allSettled([1, 2].map(index => Promise.resolve().then(() =>
        budget.reserve({ id: `call-${index}`, resource: 'cash_cents', units: 400, reference: `task-${index}` }))));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(budget.getUsage('2026-10-23', 'cash_cents').remaining, 100);
});

test('unknown usage remains reserved and cannot be released as unsent', context => {
    const { budget } = fixture(context);
    budget.reserve({ id: 'call', resource: 'cash_cents', units: 400, reference: 'research' });
    budget.markUnknown('call');
    assert.throws(() => budget.releaseUnsent('call'), /provably unsent/);
    assert.equal(budget.getUsage('2026-10', 'cash_cents').used, 400);
    budget.settle('call', 250);
    assert.equal(budget.getUsage('2026-10', 'cash_cents').used, 250);
    assert.throws(() => budget.settle('call', 250), /not open/);
});

test('AI usage has its own allowance and is not counted as cash', context => {
    const { budget } = fixture(context);
    assert.throws(() => budget.reserve({ id: 'unverified', resource: 'ai_units', units: 1, reference: 'research' }), /exhausted/);
    budget.setLimit('2026-10', 'ai_units', 1000);
    budget.setLimit('2026-10-23', 'ai_units', 50);
    budget.reserve({ id: 'credit', resource: 'ai_units', units: 30, reference: 'research' });
    budget.settle('credit', 20);
    assert.equal(budget.getUsage('2026-10', 'cash_cents').used, 0);
    assert.equal(budget.getUsage('2026-10', 'ai_units').used, 20);
});

test('overshooting a reservation trips suspension without hiding actual usage', context => {
    const { budget, control } = fixture(context);
    control.start({ ready: true });
    budget.reserve({ id: 'call', resource: 'cash_cents', units: 100, reference: 'task' });
    budget.settle('call', 600);
    assert.equal(control.get().state, 'SUSPENDED');
    assert.equal(budget.getUsage('2026-10-23', 'cash_cents').used, 600);
});

test('suspension and unknown reservations survive reopening the database', context => {
    const directory = mkdtempSync(join(tmpdir(), 'vult-test-'));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const filename = join(directory, 'state.sqlite');
    const first = openStore(filename);
    const budget = createBudget(first, { clock });
    budget.setLimit('2026-10', 'cash_cents', 15000);
    budget.setLimit('2026-10-23', 'cash_cents', 500);
    budget.reserve({ id: 'unknown', resource: 'cash_cents', units: 450, reference: 'task' });
    budget.markUnknown('unknown');
    createControl(first, { clock }).suspend();
    first.close();
    const second = openStore(filename);
    try {
        assert.equal(createControl(second).get().state, 'SUSPENDED');
        assert.equal(createBudget(second).getUsage('2026-10', 'cash_cents').used, 450);
    } finally { second.close(); }
});

test('failed transactions roll back and unsafe amounts are rejected', context => {
    const { store, budget } = fixture(context);
    assert.throws(() => store.transaction(() => {
        store.database.prepare("UPDATE campaign SET state = 'RUNNING' WHERE id = 1").run();
        throw new Error('rollback');
    }), /rollback/);
    assert.equal(createControl(store).get().state, 'SETUP');
    assert.throws(() => store.transaction(async () => { }), /synchronous/);
    for (const units of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
        assert.throws(() => budget.reserve({ id: 'bad', resource: 'cash_cents', units, reference: 'task' }), /integer/);
    }
});
