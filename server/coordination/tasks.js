// AI NOTE: Durable leases fence stale sessions and prevent two workers from owning the same task.
import { randomUUID } from 'node:crypto';
import { recordEvent } from '../storage/db.js';

export function createTasks(store, { clock = () => new Date(), leaseMs = 180000 } = {}) {
    const { database } = store;
    function get(id) {
        const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        return task ? { ...task } : null;
    }
    function assertLease(context) {
        const task = get(context.taskId);
        const worker = database.prepare('SELECT * FROM workers WHERE id = ?').get(context.workerId);
        if (!task || !worker || task.state !== 'LEASED' || task.worker_id !== worker.id ||
            task.lease_token !== context.leaseToken || task.worker_generation !== worker.generation ||
            context.sessionGeneration !== worker.generation || task.campaign_generation !== context.campaignGeneration ||
            Date.parse(task.lease_until) <= clock().getTime()) throw new Error('Task lease is missing, stale, or expired.');
        return task;
    }
    return {
        get,
        assertLease,
        create({ id = randomUUID(), title, kind, classId, facility, dependencies = [] }) {
            if (![title, kind, classId, facility].every(value => typeof value === 'string' && value.length > 0 && value.length <= 500)) throw new TypeError('Invalid task definition.');
            return store.transaction(() => {
                database.prepare('INSERT INTO tasks (id, title, kind, class, facility, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(id, title, kind, classId, facility, clock().toISOString());
                for (const parent of dependencies) database.prepare('INSERT INTO dependencies VALUES (?, ?)').run(id, parent);
                recordEvent(store, 'task', title, { taskId: id }, clock());
                return get(id);
            });
        },
        claim(id, workerId) {
            return store.transaction(() => {
                const task = get(id);
                const worker = database.prepare('SELECT * FROM workers WHERE id = ?').get(workerId);
                const campaign = database.prepare('SELECT * FROM campaign WHERE id = 1').get();
                if (campaign.state !== 'RUNNING') throw new Error('Campaign is not running.');
                if (!task || !worker || task.class !== worker.class || !['IDLE', 'WORKING'].includes(worker.status)) throw new Error('Worker cannot claim this task.');
                if (task.state !== 'QUEUED' || task.attempts >= 3) throw new Error('Task is already claimed or retry budget is exhausted.');
                if (database.prepare("SELECT 1 FROM tasks WHERE worker_id = ? AND state = 'LEASED'").get(workerId)) throw new Error('Worker already has a leased task.');
                if (database.prepare("SELECT 1 FROM dependencies JOIN tasks ON tasks.id = dependencies.depends_on WHERE task_id = ? AND tasks.state != 'COMPLETED'").get(id)) throw new Error('Task dependencies are incomplete.');
                const token = randomUUID();
                database.prepare("UPDATE tasks SET state = 'LEASED', worker_id = ?, worker_generation = ?, lease_token = ?, lease_until = ?, campaign_generation = ?, attempts = attempts + 1 WHERE id = ?")
                    .run(workerId, worker.generation, token, new Date(clock().getTime() + leaseMs).toISOString(), campaign.generation, id);
                database.prepare("UPDATE workers SET status = 'WORKING', progress_at = ? WHERE id = ?").run(clock().toISOString(), workerId);
                return { workerId, sessionGeneration: worker.generation, taskId: id, leaseToken: token, campaignGeneration: campaign.generation };
            });
        },
        complete(context, result) {
            return store.transaction(() => {
                assertLease(context);
                const campaign = database.prepare('SELECT state, generation FROM campaign WHERE id = 1').get();
                if (campaign.state !== 'RUNNING' || campaign.generation !== context.campaignGeneration) throw new Error('Campaign authority expired.');
                database.prepare("UPDATE tasks SET state = 'COMPLETED', result = ? WHERE id = ?").run(JSON.stringify(result), context.taskId);
                database.prepare("UPDATE workers SET status = 'IDLE', progress_at = ? WHERE id = ?").run(clock().toISOString(), context.workerId);
                return get(context.taskId);
            });
        },
        list() { return database.prepare('SELECT * FROM tasks ORDER BY created_at, id').all().map(task => ({ ...task })); },
    };
}