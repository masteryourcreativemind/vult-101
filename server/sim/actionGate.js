// AI NOTE: Every business tool must pass admission, dispatch, and result-commit checks here.
import { randomUUID } from 'node:crypto';

export function createActionGate({ store, world, tasks, control, budget, actions = [], handlers = {}, connectors = {}, approvalCheck = () => false, timeoutMs = 120000 }) {
    const registry = new Map(actions.map(action => [action.id, Object.freeze({ ...action })]));
    const active = new Map();
    function validate(context, actionId, args) {
        control.assertRunning(context.campaignGeneration);
        const action = registry.get(actionId);
        if (!action || typeof handlers[actionId] !== 'function') throw new Error('Unknown or unavailable action.');
        if (!args || typeof args !== 'object' || Array.isArray(args) || 'workerId' in args || 'sessionGeneration' in args || 'leaseToken' in args) throw new Error('Invalid tool arguments or attempted identity override.');
        const worker = world.getWorker(context.workerId);
        const task = tasks.assertLease(context);
        if (!worker || worker.status !== 'WORKING' || !action.classes.includes(worker.class)) throw new Error('Worker class or lifecycle is not authorized.');
        if (world.facilityAt(worker) !== action.facility || task.facility !== action.facility) throw new Error('Action requires the assigned facility.');
        const station = world.stationAt(worker);
        if (!station || (action.stationKind && station.kind !== action.stationKind)) throw new Error('Action requires the assigned workstation.');
        if (action.connector && !connectors[action.connector]?.ready) throw new Error('Live connector has not been commissioned.');
        if (action.needsApproval && !approvalCheck(context, action, args)) throw new Error('Exact-version operator approval is required.');
        if (action.validate && !action.validate(args)) throw new Error('Tool arguments failed validation.');
        return { action, worker, task, station };
    }
    return {
        check(context, actionId, args = {}) {
            try { validate(context, actionId, args); return { ok: true }; }
            catch (error) { return { ok: false, reason: error.message }; }
        },
        abortAll() { for (const controller of active.values()) controller.abort(new Error('Operator suspended execution.')); },
        abortWorker(workerId) { active.get(workerId)?.abort(new Error('Worker execution authority was revoked.')); },
        async run(context, actionId, args = {}) {
            let reservationId;
            let dispatched = false;
            const controller = new AbortController();
            const admitted = store.transaction(() => {
                const admitted = validate(context, actionId, args);
                if (active.has(context.workerId)) throw new Error('Worker already has an in-flight action.');
                if (active.size >= 2) throw new Error('The vault already has two in-flight actions.');
                world.reserveStation(admitted.worker, admitted.task);
                if (admitted.action.resource) {
                    reservationId = randomUUID();
                    budget.reserve({ id: reservationId, resource: admitted.action.resource, units: admitted.action.maxUnits, reference: context.taskId });
                }
                active.set(context.workerId, controller);
                return admitted;
            });
            let timer;
            const assertCurrent = () => {
                controller.signal.throwIfAborted();
                const current = validate(context, actionId, args);
                if (current.worker.x !== admitted.worker.x || current.worker.y !== admitted.worker.y) throw new Error('Worker left its workstation.');
            };
            const aborted = new Promise((resolve, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
            timer = setTimeout(() => controller.abort(new Error('Action timed out; remote outcome must be reconciled.')), timeoutMs);
            try {
                const result = await Promise.race([Promise.resolve().then(() => {
                    assertCurrent();
                    return handlers[actionId](args, {
                        ...context, signal: controller.signal,
                        async dispatch(operation) { assertCurrent(); dispatched = true; return operation(controller.signal); },
                        commit(operation) { return store.transaction(() => { assertCurrent(); return operation(); }); },
                    });
                }), aborted]);
                assertCurrent();
                if (reservationId) {
                    if (!Number.isSafeInteger(result?.usageUnits) || result.usageUnits < 0) throw new Error('Provider usage is unknown.');
                    budget.settle(reservationId, result.usageUnits);
                    reservationId = undefined;
                }
                return result;
            } catch (error) {
                if (reservationId) {
                    if (dispatched) budget.markUnknown(reservationId);
                    else budget.releaseUnsent(reservationId);
                }
                throw error;
            } finally {
                clearTimeout(timer);
                controller.abort(new Error('Action capability has expired.'));
                active.delete(context.workerId);
                world.releaseStation(context.workerId, context.leaseToken);
            }
        },
    };
}
