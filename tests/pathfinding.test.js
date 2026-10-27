// AI NOTE: Every workstation and the recovery kitchen must be physically reachable without crossing walls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPath } from '../server/sim/pathfinding.js';
import { stations, isWalkable, createWorld } from '../server/sim/world.js';
import { openStore } from '../server/storage/db.js';
import { createControl } from '../server/safety/control.js';
import { createTasks } from '../server/coordination/tasks.js';
import { createMovement } from '../server/sim/movement.js';
import { createRecovery } from '../server/agents/scheduler.js';
import { createOperationJournal } from '../server/storage/operations.js';

test('all workstations connect through the actual room doors with four-neighbor paths', () => {
    const start = stations[0];
    for (const station of stations.slice(1)) {
        const path = findPath(start, station);
        assert.ok(path.length > 0, station.id);
        let previous = start;
        for (const tile of path) {
            assert.equal(isWalkable(tile), true);
            assert.equal(Math.abs(previous.x - tile.x) + Math.abs(previous.y - tile.y), 1);
            previous = tile;
        }
        assert.deepEqual(path.at(-1), { x: station.x, y: station.y });
    }
});

test('unreachable and out-of-bounds destinations produce no path', () => {
    const walkable = tile => tile.x !== 2;
    assert.deepEqual(findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, { width: 5, height: 5, walkable }), []);
    assert.deepEqual(findPath({ x: 0, y: 0 }, { x: -1, y: 0 }), []);
});

test('revoked sessions walk to the kitchen before a reset and do not teleport', context => {
    const store = openStore();
    context.after(() => store.close());
    const world = createWorld(store);
    const control = createControl(store);
    const tasks = createTasks(store);
    const movement = createMovement({ store, world, control, tasks });
    const recovery = createRecovery({ store, world, control, movement, gate: { abortWorker() { } }, operations: createOperationJournal(store) });
    const before = world.getWorker('researcher-1');
    recovery.recoverWorker(before.id, 'Repeated non-progressing tool intents.');
    assert.equal(world.getWorker(before.id).x, before.x);
    recovery.tick();
    assert.ok(world.getWorker(before.id).path.length > 0);
    let steps = 0;
    while (world.getWorker(before.id).status === 'RECOVERING' && steps < 500) { movement.tick(); steps += 1; }
    const recovered = world.getWorker(before.id);
    assert.equal(world.facilityAt(recovered), 'kitchen_break_room');
    assert.equal(recovered.status, 'IDLE');
    assert.equal(recovered.generation, before.generation + 1);
    assert.ok(steps > 1);
});
