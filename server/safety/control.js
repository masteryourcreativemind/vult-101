// AI NOTE: Only trusted operator code may change the durable campaign lifecycle.
import { recordEvent } from '../storage/db.js';

export function createControl(store, { clock = () => new Date() } = {}) {
    const get = () => ({ ...store.database.prepare('SELECT * FROM campaign WHERE id = 1').get() });
    function transition(state, reason) {
        return store.transaction(() => {
            const current = get();
            if (current.state === 'GOAL_REACHED') throw new Error('A completed campaign cannot be restarted.');
            store.database.prepare('UPDATE campaign SET state = ?, reason = ?, generation = generation + 1, updated_at = ? WHERE id = 1')
                .run(state, reason, clock().toISOString());
            recordEvent(store, 'control', reason, { state }, clock());
            return get();
        });
    }
    return {
        get,
        suspend(reason = 'Operator emergency suspension.') { return transition('SUSPENDED', reason); },
        start({ ready = false } = {}) {
            if (!ready) throw new Error('Live integrations, policy, models, and budgets must be commissioned first.');
            return transition('RUNNING', 'Operator authorized campaign execution.');
        },
        assertRunning(generation) {
            const current = get();
            if (current.state !== 'RUNNING' || (generation !== undefined && current.generation !== generation)) {
                throw new Error('Campaign is not running or execution authority has expired.');
            }
            return current;
        },
    };
}