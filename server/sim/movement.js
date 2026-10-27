// AI NOTE: Trusted agent intents produce durable paths; kitchen escorts are a bounded safety exception.
import { findPath } from './pathfinding.js';
import { stations } from './world.js';
import { recordEvent } from '../storage/db.js';

export function createMovement({ store, world, tasks, control }) {
    const { database } = store;
    function route(workerId, stationId, escort = false) {
        const worker = world.getWorker(workerId);
        const station = stations.find(item => item.id === stationId);
        if (!worker || !station || (escort && station.facility !== 'kitchen_break_room')) throw new Error('Invalid movement destination.');
        if (database.prepare('SELECT 1 FROM station_locks WHERE worker_id = ?').get(workerId)) throw new Error('Action is still in flight.');
        const path = findPath(worker, station);
        if (!path.length && (worker.x !== station.x || worker.y !== station.y)) throw new Error('Destination is unreachable.');
        database.prepare('UPDATE workers SET path = ?, status = ? WHERE id = ?').run(JSON.stringify(path), escort ? 'RECOVERING' : 'TRAVELLING', workerId);
        return path;
    }
    return {
        move(context, stationId) {
            control.assertRunning(context.campaignGeneration);
            tasks.assertLease(context);
            return route(context.workerId, stationId);
        },
        escort(workerId) {
            const worker = world.getWorker(workerId);
            if (!worker || worker.status !== 'RECOVERING') throw new Error('Only revoked workers may receive a safety escort.');
            return route(workerId, 'kitchen_break_room:desk:0', true);
        },
        tick() {
            let changed = 0;
            for (const row of database.prepare("SELECT id FROM workers WHERE status IN ('TRAVELLING', 'RECOVERING')").all()) {
                const worker = world.getWorker(row.id);
                if (worker.status === 'TRAVELLING' && control.get().state !== 'RUNNING') continue;
                const destination = worker.path[0];
                if (destination) {
                    world.moveStep(worker.id, destination);
                    database.prepare('UPDATE workers SET path = ? WHERE id = ?').run(JSON.stringify(worker.path.slice(1)), worker.id);
                    changed += 1;
                } else if (worker.status === 'RECOVERING') {
                    database.prepare("UPDATE workers SET status = 'IDLE' WHERE id = ?").run(worker.id);
                    recordEvent(store, 'recovery', worker.recovery_count === 1 ? 'Worker session reset at the kitchen.' : 'Same-role replacement commissioned at the kitchen.', { workerId: worker.id });
                    changed += 1;
                } else {
                    database.prepare("UPDATE workers SET status = 'WORKING' WHERE id = ?").run(worker.id);
                    changed += 1;
                }
            }
            return changed;
        },
    };
}
