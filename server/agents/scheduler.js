// AI NOTE: Deterministic recovery revokes capabilities before routing a stuck worker to the kitchen.
import { recordEvent } from '../storage/db.js';

export function createRecovery({ store, world, control, movement, gate, operations, clock = () => new Date() }) {
    const { database } = store;
    return {
        recoverWorker(workerId, reason = 'Task lease expired.') {
            const worker = world.getWorker(workerId);
            if (!worker || worker.status === 'RECOVERING') return false;
            gate.abortWorker(workerId);
            store.transaction(() => {
                const ambiguous = database.prepare("SELECT 1 FROM operations JOIN tasks ON tasks.id = operations.task_id WHERE tasks.worker_id = ? AND operations.state IN ('DISPATCHED', 'UNKNOWN') LIMIT 1").get(workerId);
                const nextState = ambiguous || worker.recovery_count >= 2 ? 'BLOCKED' : 'QUEUED';
                database.prepare("UPDATE tasks SET state = ?, lease_token = NULL, lease_until = NULL WHERE worker_id = ? AND state = 'LEASED'").run(nextState, workerId);
                database.prepare("UPDATE workers SET generation = generation + 1, status = 'RECOVERING', recovery_count = recovery_count + 1, path = '[]', progress_at = ? WHERE id = ?").run(clock().toISOString(), workerId);
                recordEvent(store, 'recovery', reason, { workerId, taskState: nextState }, clock());
            });
            return true;
        },
        tick() {
            if (control.get().state === 'RUNNING') {
                for (const task of database.prepare("SELECT worker_id FROM tasks WHERE state = 'LEASED' AND lease_until <= ?").all(clock().toISOString())) this.recoverWorker(task.worker_id);
            }
            for (const worker of database.prepare("SELECT id FROM workers WHERE status = 'RECOVERING' AND path = '[]'").all()) {
                if (world.facilityAt(world.getWorker(worker.id)) === 'kitchen_break_room') continue;
                if (!database.prepare('SELECT 1 FROM station_locks WHERE worker_id = ?').get(worker.id)) movement.escort(worker.id);
            }
        },
        recoverRestart() {
            store.transaction(() => {
                if (control.get().state === 'RUNNING') control.suspend('Restart interrupted execution; operator review is required.');
                operations.recoverInterrupted();
                database.prepare("UPDATE reservations SET state = 'UNKNOWN' WHERE state = 'RESERVED'").run();
                const interrupted = database.prepare("SELECT id FROM workers WHERE status IN ('WORKING', 'TRAVELLING')").all();
                database.prepare("UPDATE tasks SET state = 'BLOCKED', lease_token = NULL WHERE state = 'LEASED'").run();
                for (const worker of interrupted) database.prepare("UPDATE workers SET generation = generation + 1, status = 'IDLE', path = '[]' WHERE id = ?").run(worker.id);
                database.prepare('DELETE FROM station_locks').run();
                if (interrupted.length) recordEvent(store, 'recovery', 'Interrupted tasks blocked after restart; no remote work was replayed.', { workers: interrupted.length }, clock());
            });
        },
    };
}
