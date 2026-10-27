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
    const app = createApp({ ...options, databasePath: ':memory:', instructionsRoot: directory });
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