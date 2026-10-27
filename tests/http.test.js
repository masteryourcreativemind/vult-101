// AI NOTE: HTTP tests use isolated SQLite and instruction fixtures, never a real shop or account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';

async function fixture(context, options = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'vult-http-'));
    await writeFile(join(directory, 'researcher.md'), '# Original instructions\n');
    const app = createApp({ databasePath: ':memory:', ...options, instructionsRoot: directory });
    const url = await app.listen(0);
    context.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
    const bootstrap = await (await fetch(`${url}/api/bootstrap`)).json();
    const headers = { Origin: url, 'Content-Type': 'application/json', 'X-Vault-Token': bootstrap.token };
    return { app, url, bootstrap, headers };
}

test('local snapshot reports real setup state without task capabilities or secrets', async context => {
    const { bootstrap, url } = await fixture(context);
    assert.equal(bootstrap.state.campaign.state, 'SETUP');
    assert.equal(bootstrap.state.world.workers.length, 16);
    assert.equal(bootstrap.state.ledger.netCents, 0);
    assert.equal(bootstrap.state.connectors.every(connector => !connector.ready), true);
    assert.equal(JSON.stringify(bootstrap.state).includes('lease_token'), false);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
});

test('research orders require the operator token and queue five distinct tasks without starting work', async context => {
    const { url, headers, bootstrap } = await fixture(context);
    const path = `${url}/api/research/orders`;
    assert.deepEqual(await (await fetch(path)).json(), []);
    const body = JSON.stringify({ topic: 'Planner demand', question: 'Which features appear in current planners?' });
    assert.equal((await fetch(path, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body })).status, 403);
    assert.equal((await fetch(path, { method: 'POST', headers, body: JSON.stringify({ topic: 'Planner demand', question: 'Question', budgetCents: 500 }) })).status, 400);

    const created = await fetch(path, { method: 'POST', headers, body });
    assert.equal(created.status, 201);
    const order = await created.json();
    assert.equal(order.assignments.length, 5);
    assert.equal(new Set(order.assignments.map(item => item.researcherId)).size, 5);
    const state = await (await fetch(`${url}/api/state`)).json();
    assert.equal(state.tasks.length, 5);
    assert.equal(state.tasks.every(task => task.state === 'QUEUED'), true);
    assert.equal(state.campaign.state, 'SETUP');
    assert.equal(state.connectors.every(connector => !connector.ready), true);
});

test('cross-origin commands, missing tokens, arbitrary configuration, and live starts are rejected', async context => {
    const { url, headers } = await fixture(context);
    const body = JSON.stringify({ action: 'suspend' });
    assert.equal((await fetch(`${url}/api/control`, { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body })).status, 403);
    assert.equal((await fetch(`${url}/api/control`, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body })).status, 403);
    assert.equal((await fetch(`${url}/api/control`, { method: 'POST', headers: { ...headers, 'X-Vault-Token': String.fromCharCode(233).repeat(64) }, body })).status, 403);
    assert.equal((await fetch(`${url}/api/control`, { method: 'POST', headers, body: JSON.stringify({ action: 'start', ready: true }) })).status, 409);
    assert.equal((await fetch(`${url}/api/budgets`, { method: 'POST', headers, body: '{}' })).status, 404);
    assert.equal((await fetch(`${url}/.env`)).status, 404);
    assert.equal((await fetch(`${url}/config/locked/classes.json`)).status, 404);
});

test('permission requests require the operator token and never commission a connector', async context => {
    const { url, headers, bootstrap } = await fixture(context);
    const initial = bootstrap.state.connectors.find(connector => connector.id === 'etsy');
    assert.equal(initial.permissionDecision, 'NOT_REVIEWED');
    assert.match(initial.scopeStatus, /not verified/i);

    const path = `${url}/api/permissions/etsy`;
    assert.equal((await fetch(path, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVE' }) })).status, 403);
    assert.equal((await fetch(path, { method: 'POST', headers, body: JSON.stringify({ decision: 'APPROVE', token: 'unexpected' }) })).status, 400);
    assert.equal((await fetch(`${url}/api/permissions/unknown`, { method: 'POST', headers, body: JSON.stringify({ decision: 'APPROVE' }) })).status, 404);

    const approved = await fetch(path, { method: 'POST', headers, body: JSON.stringify({ decision: 'APPROVE' }) });
    assert.equal(approved.status, 200);
    const state = await (await fetch(`${url}/api/state`)).json();
    const etsy = state.connectors.find(connector => connector.id === 'etsy');
    assert.equal(etsy.permissionDecision, 'OWNER_APPROVED_SETUP_ONLY');
    assert.equal(etsy.ready, false);
    assert.equal(etsy.state, 'NOT_CONNECTED');
    assert.equal(state.campaign.state, 'SETUP');

    const declined = await fetch(`${url}/api/permissions/budget`, { method: 'POST', headers, body: JSON.stringify({ decision: 'DECLINE' }) });
    assert.equal(declined.status, 200);
    assert.equal((await declined.json()).permissionDecision, 'OWNER_DECLINED');
});

test('permission decisions persist across a local server restart', async context => {
    const directory = await mkdtemp(join(tmpdir(), 'vult-permissions-'));
    await writeFile(join(directory, 'researcher.md'), '# Original instructions\n');
    const databasePath = join(directory, 'vault.sqlite');
    let app = createApp({ databasePath, instructionsRoot: directory });
    context.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
    const url = await app.listen(0);
    const bootstrap = await (await fetch(`${url}/api/bootstrap`)).json();
    const headers = { Origin: url, 'Content-Type': 'application/json', 'X-Vault-Token': bootstrap.token };
    const decision = await fetch(`${url}/api/permissions/copilot`, { method: 'POST', headers, body: JSON.stringify({ decision: 'APPROVE' }) });
    assert.equal(decision.status, 200);
    await app.close();

    app = createApp({ databasePath, instructionsRoot: directory });
    const copilot = app.snapshot().connectors.find(connector => connector.id === 'copilot');
    assert.equal(copilot.permissionDecision, 'OWNER_APPROVED_SETUP_ONLY');
    assert.equal(copilot.ready, false);
});

test('instruction edits use a whitelist and optimistic revisions; suspension persists', async context => {
    const { url, headers } = await fixture(context);
    const original = await (await fetch(`${url}/api/instructions/researcher`)).json();
    const changed = await fetch(`${url}/api/instructions/researcher`, { method: 'POST', headers, body: JSON.stringify({ text: '# New research criteria\n', revision: original.revision }) });
    assert.equal(changed.status, 200);
    const stale = await fetch(`${url}/api/instructions/researcher`, { method: 'POST', headers, body: JSON.stringify({ text: 'stale edit', revision: original.revision }) });
    assert.equal(stale.status, 409);
    assert.equal((await fetch(`${url}/api/instructions/unknown`)).status, 404);
    const halted = await fetch(`${url}/api/control`, { method: 'POST', headers, body: JSON.stringify({ action: 'stop' }) });
    assert.equal(halted.status, 200);
    const state = await (await fetch(`${url}/api/state`)).json();
    assert.equal(state.campaign.state, 'SUSPENDED');
});

test('campaign profile rejects ordinary trial stop but always permits emergency suspension', async context => {
    const { url, headers, bootstrap } = await fixture(context, { profile: 'LIVE_CAMPAIGN' });
    assert.equal(bootstrap.state.campaign.profile, 'LIVE_CAMPAIGN');
    const ordinary = await fetch(`${url}/api/control`, { method: 'POST', headers, body: JSON.stringify({ action: 'stop' }) });
    assert.equal(ordinary.status, 409);
    const emergency = await fetch(`${url}/api/control`, { method: 'POST', headers, body: JSON.stringify({ action: 'suspend' }) });
    assert.equal(emergency.status, 200);
    assert.equal((await emergency.json()).campaign.state, 'SUSPENDED');
});

test('simulation routes require the session token and never alter the real campaign or ledger', async context => {
    const { url, headers } = await fixture(context);
    const estimate = await (await fetch(`${url}/api/game/estimate?commander=gpt-6.1-sol&worker=gpt-6-luna&plan=max`)).json();
    const setup = { action: 'setup', commanderModelId: 'gpt-6.1-sol', workerModelId: 'gpt-6-luna', planId: 'max', monthlyBudgetCents: estimate.minimumMonthlyCents };
    assert.equal((await fetch(`${url}/api/game`, { method: 'POST', headers: { ...headers, 'X-Vault-Token': '' }, body: JSON.stringify(setup) })).status, 403);
    assert.equal((await fetch(`${url}/api/game`, { method: 'POST', headers, body: JSON.stringify({ ...setup, monthlyBudgetCents: 100 }) })).status, 400);
    assert.equal((await fetch(`${url}/api/game`, { method: 'POST', headers, body: JSON.stringify({ ...setup, cashCents: 1 }) })).status, 400);
    assert.equal((await fetch(`${url}/api/game`, { method: 'POST', headers, body: JSON.stringify(setup) })).status, 200);
    assert.equal((await fetch(`${url}/api/game`, { method: 'POST', headers, body: JSON.stringify({ action: 'play' }) })).status, 200);
    const state = await (await fetch(`${url}/api/state`)).json();
    assert.equal(state.game.status, 'RUNNING');
    assert.ok(state.game.netCents < 0);
    assert.equal(state.ledger.entryCount, 0);
    assert.equal(state.campaign.state, 'SETUP');
});