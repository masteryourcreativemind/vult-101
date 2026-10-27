// AI NOTE: Isolated fixtures exercise exact approvals and unknown remote outcomes without live writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/storage/db.js';
import { createWorld } from '../server/sim/world.js';
import { createTasks } from '../server/coordination/tasks.js';
import { createApprovalQueue } from '../server/safety/approvalQueue.js';
import { createOperationJournal } from '../server/storage/operations.js';
import { contentHash } from '../server/storage/canonical.js';

function fixture(context) {
    const store = openStore();
    context.after(() => store.close());
    createWorld(store);
    createTasks(store).create({ id: 'listing', title: 'Original planner', kind: 'draft', classId: 'shopkeeper', facility: 'trading_post' });
    return { store, approvals: createApprovalQueue(store), journal: createOperationJournal(store) };
}

test('operator approval matches exact listing content and can only be consumed once', context => {
    const { approvals } = fixture(context);
    const payload = { title: 'Original planner', priceCents: 500, files: [{ sha256: 'a'.repeat(64) }] };
    const request = approvals.request({ taskId: 'listing', kind: 'publish_listing', payload });
    assert.equal(approvals.check(request.id, 'listing', 'publish_listing', payload), false);
    approvals.decide(request.id, 'APPROVED');
    assert.equal(approvals.check(request.id, 'listing', 'publish_listing', payload), true);
    assert.equal(approvals.check(request.id, 'listing', 'publish_listing', { ...payload, priceCents: 600 }), false);
    assert.equal(approvals.check(request.id, 'different', 'publish_listing', payload), false);
    approvals.consume(request.id, 'listing', 'publish_listing', payload);
    assert.throws(() => approvals.consume(request.id, 'listing', 'publish_listing', payload), /approval/);
});

test('interrupted writes become unknown and cannot be blindly retried', context => {
    const { journal } = fixture(context);
    const definition = { id: 'listing:create:version1', taskId: 'listing', kind: 'etsy_draft', payload: { title: 'Original planner' } };
    journal.prepare(definition);
    journal.markDispatched(definition.id);
    assert.equal(journal.recoverInterrupted(), 1);
    assert.equal(journal.get(definition.id).state, 'UNKNOWN');
    assert.throws(() => journal.markDispatched(definition.id), /reconcile/);
    assert.throws(() => journal.prepare({ ...definition, payload: { title: 'Changed' } }), /conflicts/);
    journal.settle(definition.id, 'verified-etsy-listing-id');
    assert.equal(journal.get(definition.id).state, 'SUCCEEDED');
});

test('content fingerprints ignore object key ordering but reject unsafe values', () => {
    assert.equal(contentHash({ title: 'A', price: 5 }), contentHash({ price: 5, title: 'A' }));
    assert.notEqual(contentHash({ files: ['one', 'two'] }), contentHash({ files: ['two', 'one'] }));
    assert.throws(() => contentHash({ value: Number.NaN }), /finite JSON/);
});
