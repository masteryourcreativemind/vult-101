// AI NOTE: Model intents never establish identity, location, spending, or publication authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/storage/db.js';
import { createWorld } from '../server/sim/world.js';
import { createTasks } from '../server/coordination/tasks.js';
import { createControl } from '../server/safety/control.js';
import { createBudget } from '../server/safety/killSwitch.js';
import { createActionGate } from '../server/sim/actionGate.js';

function fixture(context, options = {}) {
    const store = openStore();
    context.after(() => store.close());
    const world = createWorld(store);
    const tasks = createTasks(store);
    const control = createControl(store);
    const budget = createBudget(store);
    control.start({ ready: true });
    tasks.create({ id: 'research', title: 'Find evidence', kind: 'research', classId: 'researcher', facility: 'comms_lab' });
    const identity = tasks.claim('research', 'researcher-1');
    const gate = createActionGate({
        store, world, tasks, control, budget,
        actions: [{ id: 'research', facility: 'comms_lab', classes: ['researcher'] }],
        handlers: { research: async () => ({ value: 'evidence' }) }, ...options
    });
    return { store, world, tasks, control, budget, identity, gate };
}

test('authorized task at a real workstation runs; off-site and spoofed calls fail', async context => {
    const { gate, identity, store } = fixture(context);
    assert.deepEqual(await gate.run(identity, 'research'), { value: 'evidence' });
    assert.equal(gate.check(identity, 'research', { workerId: 'overseer-1' }).ok, false);
    store.database.prepare('UPDATE workers SET x = 5, y = 6 WHERE id = ?').run(identity.workerId);
    assert.match(gate.check(identity, 'research').reason, /facility/);
});

test('replacement sessions, unknown actions, and emergency suspension invalidate tools', context => {
    const { gate, identity, store, control } = fixture(context);
    assert.equal(gate.check(identity, 'shell').ok, false);
    assert.equal(gate.check({ ...identity, sessionGeneration: 99 }, 'research').ok, false);
    store.database.prepare('UPDATE workers SET generation = generation + 1 WHERE id = ?').run(identity.workerId);
    assert.match(gate.check(identity, 'research').reason, /lease/);
    control.suspend();
    assert.match(gate.check(identity, 'research').reason, /not running/);
});

test('an in-flight action reserves its station and rechecks authority at dispatch', async context => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const current = fixture(context, {
        handlers: {
            research: async (args, tools) => {
                await waiting;
                return tools.dispatch(() => ({ value: 'should not execute' }));
            }
        }
    });
    const running = current.gate.run(current.identity, 'research');
    await Promise.resolve();
    const worker = current.world.getWorker('researcher-1');
    assert.throws(() => current.world.moveStep(worker.id, { x: worker.x + 1, y: worker.y }), /reserved/);
    current.control.suspend();
    release();
    await assert.rejects(running, /not running/);
    assert.equal(current.store.database.prepare('SELECT count(*) AS count FROM station_locks').get().count, 0);
});

test('uncommissioned connectors and missing publication approvals fail closed', context => {
    const { gate, identity } = fixture(context, {
        actions: [
            { id: 'research', facility: 'comms_lab', classes: ['researcher'], connector: 'etsy' },
            { id: 'publish', facility: 'comms_lab', classes: ['researcher'], needsApproval: true },
        ], handlers: { research: () => { }, publish: () => { } }
    });
    assert.match(gate.check(identity, 'research').reason, /commissioned/);
    assert.match(gate.check(identity, 'publish').reason, /approval/);
});

test('task ownership is exclusive and dependent work cannot start early', context => {
    const { tasks, identity } = fixture(context);
    assert.throws(() => tasks.claim('research', 'researcher-2'), /already claimed/);
    tasks.create({ id: 'followup', title: 'Review evidence', kind: 'review', classId: 'researcher', facility: 'comms_lab', dependencies: ['research'] });
    assert.throws(() => tasks.claim('followup', 'researcher-2'), /dependencies/);
    tasks.complete(identity, { evidence: [] });
    assert.equal(tasks.claim('followup', 'researcher-2').taskId, 'followup');
});

test('only two actions may be in flight across the entire vault', async context => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const { gate, tasks, identity, store } = fixture(context, {
        handlers: { research: async () => { await waiting; return { value: 'evidence' }; } },
    });
    const identities = [identity];
    for (const index of [2, 3]) {
        tasks.create({ id: `research-${index}`, title: 'Independent evidence', kind: 'research', classId: 'researcher', facility: 'comms_lab' });
        identities.push(tasks.claim(`research-${index}`, `researcher-${index}`));
    }
    const first = gate.run(identities[0], 'research');
    const second = gate.run(identities[1], 'research');
    await assert.rejects(gate.run(identities[2], 'research'), /two in-flight/);
    assert.equal(store.database.prepare('SELECT count(*) AS count FROM station_locks').get().count, 2);
    release();
    await Promise.all([first, second]);
    assert.deepEqual(await gate.run(identities[2], 'research'), { value: 'evidence' });
    assert.equal(store.database.prepare('SELECT count(*) AS count FROM station_locks').get().count, 0);
});
