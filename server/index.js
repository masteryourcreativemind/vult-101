// AI NOTE: Local-only composition root; uncommissioned live integrations must never start work.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openStore, recordEvent } from './storage/db.js';
import { createOperationJournal } from './storage/operations.js';
import { createControl } from './safety/control.js';
import { createBudget } from './safety/killSwitch.js';
import { createApprovalQueue } from './safety/approvalQueue.js';
import { createPermissionRequests } from './safety/permissions.js';
import { createResearchWorkflow } from './coordination/research.js';
import { createLedger } from './economy/ledger.js';
import { createWorld, classes } from './sim/world.js';
import { createTasks } from './coordination/tasks.js';
import { createMovement } from './sim/movement.js';
import { createActionGate } from './sim/actionGate.js';
import { createRecovery } from './agents/scheduler.js';
import { createInstructions } from './agents/instructions.js';
import { createEventHub } from './http/sse.js';
import { createRoutes } from './http/routes.js';
import { createGame } from './game/simulation.js';

export function createApp(options = {}) {
    const config = { ...loadConfig(), ...options };
    const store = openStore(config.databasePath);
    const control = createControl(store);
    if (control.get().state === 'SETUP') store.database.prepare('UPDATE campaign SET profile = ? WHERE id = 1').run(config.profile);
    const world = createWorld(store);
    const tasks = createTasks(store);
    const budget = createBudget(store);
    const approvals = createApprovalQueue(store);
    const permissions = createPermissionRequests(store);
    const ledger = createLedger(store);
    const operations = createOperationJournal(store);
    const instructions = createInstructions(config.instructionsRoot);
    const game = createGame(store);
    const research = createResearchWorkflow({ store, tasks });
    const gate = createActionGate({ store, world, tasks, control, budget });
    const movement = createMovement({ store, world, tasks, control });
    const recovery = createRecovery({ store, world, control, movement, gate, operations });
    recovery.recoverRestart();
    recordEvent(store, 'system', 'Local console online. Live actions remain locked.');
    const hub = createEventHub();
    let revision = 1;
    function snapshot() {
        const now = new Date();
        const day = now.toISOString().slice(0, 10);
        const month = day.slice(0, 7);
        return {
            revision, timestamp: now.toISOString(), campaign: control.get(), world: world.serialize(),
            classes: classes.map(({ id, home, team }) => ({ id, home, team })),
            tasks: tasks.list().map(({ id, title, kind, facility, state, worker_id, attempts }) => ({ id, title, kind, facility, state, workerId: worker_id, attempts })),
            ledger: { ...ledger.totals(), entries: ledger.entries() }, approvals: approvals.list(),
            budgets: { cashDay: budget.getUsage(day, 'cash_cents'), cashMonth: budget.getUsage(month, 'cash_cents'), aiDay: budget.getUsage(day, 'ai_units'), aiMonth: budget.getUsage(month, 'ai_units') },
            connectors: permissions.list(), researchOrders: research.list(), game: game.view(),
            events: store.database.prepare('SELECT sequence, kind, message, created_at FROM events ORDER BY sequence DESC LIMIT 100').all().map(row => ({ ...row })),
        };
    }
    function notify() { revision += 1; hub.broadcast(snapshot()); }
    const csrfToken = randomBytes(32).toString('hex');
    const server = createServer({ requestTimeout: 10000, headersTimeout: 10000, maxHeaderSize: 8192 }, createRoutes({
        snapshot, csrfToken, instructions, approvals, permissions, research, control, gate, hub, notify, game,
        instructionSaved(saved) { recordEvent(store, 'instructions', `Operator updated ${saved.classId} instructions.`, { classId: saved.classId, revision: saved.revision }); },
    }));
    const timer = setInterval(() => {
        try { recovery.tick(); if (movement.tick()) notify(); }
        catch { control.suspend('Movement or recovery validation failed.'); gate.abortAll(); notify(); }
        try { if (game.tick()) notify(); }
        catch { game.pause(); notify(); }
    }, 300);
    timer.unref();
    let closed = false;
    return {
        server, snapshot,
        async listen(port = config.port) {
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
            return `http://127.0.0.1:${server.address().port}`;
        },
        async close() {
            if (closed) return;
            closed = true;
            clearInterval(timer);
            game.pause();
            if (control.get().state === 'RUNNING') control.suspend('Local server shut down.');
            gate.abortAll();
            hub.close();
            await new Promise(resolve => server.close(resolve));
            store.close();
        },
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const config = loadConfig();
    const app = createApp(config);
    let listening = false;
    for (let offset = 0; offset < 10; offset += 1) {
        try { console.log(`VULT-101 local console: ${await app.listen(config.port + offset)}`); listening = true; break; }
        catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
    }
    if (!listening) { await app.close(); throw new Error('No free local console port in the configured range.'); }
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().then(() => process.exit(0)); });
}
