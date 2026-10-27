// AI NOTE: Game tests prove fake money stays isolated from the real ledger and costs follow list prices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/storage/db.js';
import { createGame, estimate, callCents, findModel, pricing } from '../server/game/simulation.js';
import { createLedger } from '../server/economy/ledger.js';

const today = () => '2026-10-24';
const choice = { commanderModelId: 'gpt-6.1-sol', workerModelId: 'gpt-6-luna', planId: 'max' };
function runDays(game, days) {
    game.control({ action: 'play' });
    game.control({ action: 'speed', speed: 20 });
    for (let guard = 0; game.view().day < days && guard < 100000; guard += 1) game.tick();
    game.control({ action: 'pause' });
}

test('token costs use list prices and scheduled price increases', () => {
    assert.equal(callCents(findModel('gpt-6.1-sol'), '2026-10-24', 1_000_000, 0), 0.7 * 200 + 0.3 * 10);
    assert.equal(callCents(findModel('gpt-6.1-sol'), '2026-10-24', 0, 1_000_000), 1000);
    assert.equal(callCents(findModel('gemini-4-argon'), '2026-12-01', 0, 1_000_000), 2000);
});

test('minimum budget covers subscription, uncovered AI usage, and listing fees', () => {
    const result = estimate(choice, '2026-10-24');
    assert.ok(result.minimumMonthlyCents >= result.subscriptionCents + result.aiCashCents + result.listingCents);
    assert.ok(result.warnings.some(warning => warning.includes('GPT-6.1 Sol is not included')));
    const game = createGame(openStore(), { today });
    assert.throws(() => game.setup({ ...choice, monthlyBudgetCents: result.minimumMonthlyCents - 100 }), /at least/);
});

test('spending lowers the score immediately and fake money never reaches the real ledger', () => {
    const store = openStore();
    const game = createGame(store, { today });
    const view = game.setup({ ...choice, monthlyBudgetCents: 20000, seed: 1 });
    assert.equal(view.netCents, -(10000 + pricing.etsy.shopSetupFeeCents));
    runDays(game, 89);
    const after = game.view();
    assert.equal(after.totals.subscriptionCents, 30000);
    assert.ok(after.totals.aiCashCents > 0 && after.totals.listingCents > 0);
    assert.equal(createLedger(store).totals().entryCount, 0);
});

test('monthly AI and listing spend stays within the chosen budget', () => {
    const minimum = estimate({ ...choice, workerModelId: 'gpt-6-astra', planId: 'none' }, '2026-10-24').minimumMonthlyCents;
    const game = createGame(openStore(), { today });
    game.setup({ ...choice, workerModelId: 'gpt-6-astra', planId: 'none', monthlyBudgetCents: minimum, seed: 3 });
    for (let day = 1; day <= 60; day += 1) {
        runDays(game, day);
        assert.ok(game.view().month.spendCents <= minimum + 1);
    }
});

test('same seed and settings replay identically; runs survive a restart', () => {
    const results = [1, 2].map(() => { const game = createGame(openStore(), { today }); game.setup({ ...choice, monthlyBudgetCents: 20000, seed: 42 }); runDays(game, 120); return game.view(); });
    assert.deepEqual(results[0].totals, results[1].totals);
    const store = openStore();
    const game = createGame(store, { today });
    game.setup({ ...choice, monthlyBudgetCents: 20000, seed: 42 });
    runDays(game, 30);
    game.control({ action: 'play' });
    assert.equal(createGame(store, { today }).view().status, 'PAUSED');
    assert.equal(createGame(store, { today }).view().day, 30);
});
