// AI NOTE: Fake-money game engine; it never touches the real ledger, budgets, action gate, or any external service.
import { readFileSync } from 'node:fs';
import { classes, stations } from '../sim/world.js';
import { findPath } from '../sim/pathfinding.js';

const load = name => JSON.parse(readFileSync(new URL(`../../config/locked/${name}.json`, import.meta.url), 'utf8'));
export const pricing = load('pricing');
export const rules = load('simulation');
export const speeds = [1, 5, 20, 100];

const stageOrder = rules.stages.map(stage => stage.id);
const stageTeam = { research: 'research', review: 'research', marketing: 'marketing', design: 'design', listing: 'listing' };
const seat = (facility, kind, index) => stations.find(station => station.facility === facility && station.kind === kind && station.id.endsWith(`:${index}`));
const stageSeats = {
    research: [1, 2, 3, 4, 5].map((number, index) => [`researcher-${number}`, seat('comms_lab', 'desk', index)]),
    review: [['researcher-1', seat('comms_lab', 'review', 0)], ['researcher-2', seat('comms_lab', 'review', 1)], ['researcher-5', seat('comms_lab', 'review', 2)]],
    marketing: [['trendsetter-1', seat('diner', 'desk', 0)], ['wallstreet-1', seat('diner', 'desk', 1)], ['copywriter-1', seat('diner', 'desk', 2)]],
    design: [['creative-1', seat('art_studio', 'desk', 0)], ['creative-2', seat('art_studio', 'desk', 1)], ['fabricator-1', seat('workshop', 'desk', 0)]],
    listing: [['inspector-1', seat('security', 'desk', 0)], ['shopkeeper-1', seat('trading_post', 'desk', 0)]],
};
const homes = Object.fromEntries(classes.flatMap(definition => definition.names.map((_, index) => [`${definition.id}-${index + 1}`, seat(definition.home, 'desk', index)])));
const kitchen = [0, 1, 2].map(index => seat('kitchen_break_room', 'desk', index));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const dollars = cents => `$${(cents / 100).toFixed(2)}`;

export function findModel(id) { return pricing.models.find(model => model.id === id); }
export function findPlan(id) { return pricing.plans.find(plan => plan.id === id); }
function addDays(date, days) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
function priceOn(model, date) {
    let price = { inputPerMTok: model.inputPerMTok, cachedPerMTok: model.cachedPerMTok, outputPerMTok: model.outputPerMTok };
    for (const change of model.priceChanges ?? []) if (date >= change.from) price = { ...price, ...change };
    return price;
}
// List-price cost in cents for one call; part of the input is billed at the cached rate.
export function callCents(model, date, input, output) {
    const price = priceOn(model, date);
    const cached = input * rules.cacheRatio;
    return ((input - cached) * price.inputPerMTok + cached * price.cachedPerMTok + output * price.outputPerMTok) / 1e4;
}
const included = (model, plan) => model.copilotPlans.includes(plan.id) && plan.creditsCents > 0;
const stageCents = (model, date, stage) => stage.calls * callCents(model, date, stage.input, stage.output);
const blendQuality = (commander, worker) => worker.quality * 0.8 + commander.quality * 0.2;
const hitChance = (quality, successRate) => Math.min(0.6, successRate * quality / 0.7);
const salesFactor = quality => 0.5 + quality;
function netPerSaleCents(price) {
    const { transactionRate, processingRate, processingFixedCents } = pricing.etsy;
    return price * (1 - transactionRate - processingRate - rules.market.refundRate) - processingFixedCents;
}
function successRateOf(value) {
    if (value === undefined) return rules.market.medianSuccessRate;
    if (typeof value !== 'number' || !(value >= 0.01 && value <= 0.5)) throw fail('Success rate must be between 1% and 50%.');
    return value;
}

export function estimate({ commanderModelId, workerModelId, planId, successRate }, date = new Date().toISOString().slice(0, 10)) {
    const commander = findModel(commanderModelId);
    const worker = findModel(workerModelId);
    const plan = findPlan(planId);
    if (!commander || !worker || !plan) throw fail('Unknown model or plan.');
    const rate = successRateOf(successRate);
    const products = rules.baselineProductsPerMonth;
    const quality = blendQuality(commander, worker);
    const design = stageCents(worker, date, rules.stages.find(stage => stage.id === 'design'));
    const perProduct = rules.stages.reduce((sum, stage) => sum + stageCents(worker, date, stage), 0) + rules.market.inspectionFailScale * (1 - quality) * design;
    const commanderMonthly = rules.daysPerMonth * callCents(commander, date, rules.commanderDaily.input, rules.commanderDaily.output);
    const includedUsage = (included(commander, plan) ? commanderMonthly : 0) + (included(worker, plan) ? perProduct * products : 0);
    const creditsUsed = Math.min(plan.creditsCents, includedUsage);
    const aiCash = commanderMonthly + perProduct * products - creditsUsed;
    const listingCents = products * pricing.etsy.listingFeeCents;
    const minimumMonthlyCents = Math.ceil((plan.monthlyCents + aiCash + listingCents) / 100) * 100;
    const dailySales = rules.market.baseViewsPerDay * rules.market.conversionRate * salesFactor(quality) * (1 + hitChance(quality, rate) * (rules.market.hitMultiplier - 1));
    const lifeMonths = pricing.etsy.listingLifeDays / rules.daysPerMonth;
    const projection = Array.from({ length: 12 }, (_, index) => {
        const sales = products * Math.min(index + 0.5, lifeMonths) * dailySales * rules.daysPerMonth;
        return { month: index + 1, sales: Math.round(sales), netCents: Math.round(sales * netPerSaleCents(rules.market.medianPriceCents) - plan.monthlyCents - aiCash - listingCents) };
    });
    const steady = projection.at(-1).netCents;
    return {
        perProductCents: perProduct, commanderMonthlyCents: commanderMonthly, aiUsageCents: commanderMonthly + perProduct * products,
        creditsUsedCents: creditsUsed, aiCashCents: aiCash, subscriptionCents: plan.monthlyCents, listingCents, products, successRate: rate,
        minimumMonthlyCents, oneTimeCents: pricing.etsy.shopSetupFeeCents, projection,
        monthsToGoal: steady > 0 ? Math.ceil(rules.goalCents / steady) : null,
        warnings: [
            ...[...new Set([commander, worker])].filter(model => !included(model, plan)).map(model => `${model.name} is not included in ${plan.name}; billed at direct API rates.`),
            ...(pricing.etsy.shopSetupVerified ? [] : ['Etsy shop setup fee is an unverified assumption.']),
            ...(pricing.etsy.processingVerified ? [] : ['Etsy payment processing rate is an unverified US assumption.']),
        ],
    };
}

function random(state) {
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let value = state.rng;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
function poisson(state, mean) {
    const limit = Math.exp(-mean);
    let count = 0;
    for (let product = random(state); product > limit && count < 500; product *= random(state)) count += 1;
    return count;
}

export function createGame(store, { today = () => new Date().toISOString().slice(0, 10) } = {}) {
    const { database } = store;
    let state = JSON.parse(database.prepare('SELECT state FROM game WHERE id = 1').get()?.state ?? 'null');
    let plan;
    let models;
    function attach() {
        plan = findPlan(state.config.planId);
        models = { commander: findModel(state.config.commanderModelId), worker: findModel(state.config.workerModelId) };
    }
    if (state) { attach(); if (state.status === 'RUNNING') state.status = 'PAUSED'; }
    const save = () => database.prepare('INSERT INTO game (id, state, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at')
        .run(JSON.stringify(state), new Date().toISOString());
    const date = () => addDays(state.config.startDate, state.day);
    const quality = () => blendQuality(models.commander, models.worker);
    const log = message => { state.log.unshift({ day: state.day, date: date(), message }); state.log.length = Math.min(state.log.length, 80); };
    const net = () => {
        const t = state.totals;
        return t.revenueCents - t.refundCents - t.transactionCents - t.processingCents - t.listingCents - t.subscriptionCents - t.aiCashCents - t.setupCents;
    };
    const worker = id => state.workers.find(item => item.id === id);
    function send(item, target, status) {
        item.status = status;
        item.path = item.x === target.x && item.y === target.y ? [] : findPath(item, target);
    }
    function spend(cents, kind) { state.totals[kind] += cents; state.month.spendCents += cents; }
    const canSpend = cents => state.month.spendCents + cents <= state.config.monthlyBudgetCents + 1e-9;
    // Included models draw down plan credits first; anything else is cash.
    function aiCost(model, input, output) {
        const cents = callCents(model, date(), input, output);
        const fromCredits = included(model, plan) ? Math.min(cents, state.month.creditsLeftCents) : 0;
        return { fromCredits, cash: cents - fromCredits, input, output };
    }
    function chargeAi(cost) {
        state.month.creditsLeftCents -= cost.fromCredits;
        state.totals.creditsUsedCents += cost.fromCredits;
        spend(cost.cash, 'aiCashCents');
        state.totals.inputTokens += cost.input;
        state.totals.outputTokens += cost.output;
    }
    function stageCost(stage) {
        const definition = rules.stages.find(item => item.id === stage);
        return aiCost(models.worker, definition.calls * definition.input, definition.calls * definition.output);
    }
    function startMonth() {
        state.month = { index: Math.floor(state.day / rules.daysPerMonth), spendCents: 0, creditsLeftCents: plan.creditsCents };
        spend(plan.monthlyCents, 'subscriptionCents');
        if (plan.monthlyCents) log(`${plan.name} renewed: -${dollars(plan.monthlyCents)}.`);
    }

    function view() {
        const base = { catalog: { models: pricing.models, plans: pricing.plans, etsy: pricing.etsy, verifiedOn: pricing.verifiedOn, speeds }, goalCents: rules.goalCents, defaultSuccessRate: rules.market.medianSuccessRate };
        if (!state) return { ...base, status: 'NONE' };
        const round = value => Math.round(value);
        return {
            ...base, status: state.status, speed: state.speed, day: state.day, date: date(), config: state.config, hold: state.hold, estimate: state.estimate,
            netCents: round(net()), totals: Object.fromEntries(Object.entries(state.totals).map(([key, value]) => [key, round(value)])),
            month: { index: state.month.index, spendCents: round(state.month.spendCents), creditsLeftCents: round(state.month.creditsLeftCents) },
            workers: state.workers.map(({ id, x, y, status }) => ({ id, x, y, status })),
            products: state.products.slice(-60).reverse().map(({ id, name, stage, progress, priceCents, sales, revenueCents, hit }) => ({ id, name, stage, progress, priceCents, sales, revenueCents: round(revenueCents), hit })),
            liveCount: state.products.filter(product => product.stage === 'live').length,
            log: state.log, history: state.history,
        };
    }

    function setup({ commanderModelId, workerModelId, planId, monthlyBudgetCents, successRate, seed }) {
        if (state?.status === 'RUNNING') throw fail('Pause the simulation before starting a new one.', 409);
        const startDate = today();
        const projected = estimate({ commanderModelId, workerModelId, planId, successRate }, startDate);
        if (!Number.isSafeInteger(monthlyBudgetCents) || monthlyBudgetCents < projected.minimumMonthlyCents || monthlyBudgetCents > 100000000) {
            throw fail(`Monthly budget must be at least ${dollars(projected.minimumMonthlyCents)}.`);
        }
        if (seed !== undefined && !Number.isSafeInteger(seed)) throw fail('Seed must be an integer.');
        state = {
            status: 'PAUSED', speed: 1, day: 0, tick: 0, hold: null, estimate: projected,
            config: { commanderModelId, workerModelId, planId, monthlyBudgetCents, successRate: projected.successRate, startDate, seed: (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0 },
            totals: { revenueCents: 0, refundCents: 0, transactionCents: 0, processingCents: 0, listingCents: 0, subscriptionCents: 0, aiCashCents: 0, setupCents: 0, creditsUsedCents: 0, inputTokens: 0, outputTokens: 0, sales: 0 },
            teams: { research: null, marketing: null, design: null, listing: null }, products: [], nextProduct: 1, log: [], history: [],
            workers: Object.entries(homes).map(([id, home]) => ({ id, x: home.x, y: home.y, path: [], status: 'IDLE', recovery: 0 })),
        };
        state.rng = state.config.seed;
        attach();
        startMonth();
        state.totals.setupCents += pricing.etsy.shopSetupFeeCents;
        log(`Etsy shop opened: -${dollars(pricing.etsy.shopSetupFeeCents)} one-time setup.`);
        log(`${models.commander.name} commands; ${models.worker.name} staffs the vault.`);
        save();
        return view();
    }

    function assign(product) {
        const team = stageTeam[product.stage];
        if (state.teams[team] !== null) return false;
        const cost = stageCost(product.stage);
        const extra = product.stage === 'listing' ? pricing.etsy.listingFeeCents : 0;
        if (!canSpend(cost.cash + extra)) { state.hold = `Monthly budget reached; ${product.name} waits for next month.`; return false; }
        chargeAi(cost);
        state.teams[team] = product.id;
        product.active = true;
        product.progress = 0;
        for (const [id, target] of stageSeats[product.stage]) send(worker(id), target, 'WORKING');
        return true;
    }
    function release(product) {
        state.teams[stageTeam[product.stage]] = null;
        product.active = false;
        for (const [id] of stageSeats[product.stage]) { const item = worker(id); if (item.status === 'WORKING') send(item, homes[id], 'IDLE'); }
    }
    function completeStage(product) {
        release(product);
        if (product.stage !== 'listing') { product.stage = stageOrder[stageOrder.indexOf(product.stage) + 1]; return; }
        if (random(state) < rules.market.inspectionFailScale * (1 - quality())) {
            product.reworks += 1;
            product.stage = product.reworks > 1 ? 'discarded' : 'design';
            log(product.reworks > 1 ? `Vale rejected ${product.name} twice; discarded.` : `Vale sent ${product.name} back to design.`);
            return;
        }
        spend(pricing.etsy.listingFeeCents, 'listingCents');
        const spread = Math.exp((random(state) - 0.5) * 0.9);
        product.priceCents = Math.round(Math.min(rules.market.maxPriceCents, Math.max(rules.market.minPriceCents, rules.market.medianPriceCents * spread)) / 5) * 5;
        product.hit = random(state) < hitChance(quality(), state.config.successRate);
        product.stage = 'live';
        product.listedDay = state.day;
        log(`Sol listed ${product.name} at ${dollars(product.priceCents)} (-$0.20 listing fee).`);
    }

    function advanceDay() {
        state.day += 1;
        state.hold = null;
        if (state.day % rules.daysPerMonth === 0) startMonth();
        const commanderCost = aiCost(models.commander, rules.commanderDaily.input, rules.commanderDaily.output);
        const commanderActive = canSpend(commanderCost.cash);
        if (commanderActive) chargeAi(commanderCost);
        else state.hold = 'Monthly budget reached; the Overseer waits for next month.';
        for (const item of state.workers.filter(candidate => candidate.status === 'RESETTING')) {
            item.recovery -= 1;
            if (item.recovery > 0) continue;
            chargeAi(aiCost(models.worker, 20000, 1000));
            log(`${item.id} finished a context reset in the kitchen.`);
            const product = state.products.find(candidate => candidate.active && stageSeats[candidate.stage].some(([id]) => id === item.id));
            send(item, product ? stageSeats[product.stage].find(([id]) => id === item.id)[1] : homes[item.id], product ? 'WORKING' : 'IDLE');
        }
        for (const product of state.products.filter(candidate => candidate.active)) {
            const crew = stageSeats[product.stage].map(([id, target]) => ({ item: worker(id), target }));
            if (!crew.every(({ item, target }) => item.status === 'WORKING' && item.x === target.x && item.y === target.y)) continue;
            const stuck = crew.find(() => random(state) < rules.market.stuckChancePerDay * (1.2 - quality()));
            if (stuck) {
                send(stuck.item, kitchen[state.workers.filter(item => ['STUCK', 'RESETTING'].includes(item.status)).length % kitchen.length], 'STUCK');
                log(`${stuck.item.id} looped on ${product.name}; walking to the kitchen.`);
                continue;
            }
            product.progress += 1;
            if (product.progress >= rules.stages.find(stage => stage.id === product.stage).days) completeStage(product);
        }
        if (commanderActive) {
            for (const product of state.products.filter(candidate => !candidate.active && stageOrder.includes(candidate.stage))) assign(product);
            const inFlight = state.products.filter(candidate => stageOrder.includes(candidate.stage)).length;
            if (state.teams.research === null && inFlight < rules.maxParallelProducts && canSpend(stageCost('research').cash)) {
                const name = rules.productNames[Math.floor(random(state) * rules.productNames.length)];
                const product = { id: `P${state.nextProduct}`, name: `${name} #${state.nextProduct}`, stage: 'research', progress: 0, active: false, reworks: 0, sales: 0, revenueCents: 0 };
                state.nextProduct += 1;
                state.products.push(product);
                assign(product);
                log(`The Overseer commissioned research for ${product.name}.`);
            }
        }
        const season = rules.market.seasonality[Number(date().slice(5, 7)) - 1];
        for (const product of state.products.filter(candidate => candidate.stage === 'live')) {
            const age = state.day - product.listedDay;
            if (age >= pricing.etsy.listingLifeDays) {
                if (product.sales > 0 && canSpend(pricing.etsy.listingFeeCents)) { spend(pricing.etsy.listingFeeCents, 'listingCents'); product.listedDay = state.day; }
                else { product.stage = 'expired'; continue; }
            }
            const views = rules.market.baseViewsPerDay * Math.min(1, (age + 1) / rules.market.rampDays) * season * (product.hit ? rules.market.hitMultiplier : 1);
            const sold = poisson(state, views * rules.market.conversionRate * salesFactor(quality()));
            for (let sale = 0; sale < sold; sale += 1) {
                const price = product.priceCents;
                state.totals.revenueCents += price;
                state.totals.transactionCents += price * pricing.etsy.transactionRate;
                state.totals.processingCents += price * pricing.etsy.processingRate + pricing.etsy.processingFixedCents;
                state.totals.sales += 1;
                product.sales += 1;
                product.revenueCents += price;
                if (random(state) < rules.market.refundRate) { state.totals.refundCents += price; log(`Refund issued on ${product.name}.`); }
            }
            if (sold) log(`${product.name} sold ${sold} at ${dollars(product.priceCents)}${product.hit ? ' (trending)' : ''}.`);
        }
        state.history.push(Math.round(net()));
        if (state.history.length > 730) state.history = state.history.filter((_, index) => index % 2 === 0);
        if (net() >= rules.goalCents) { state.status = 'WON'; log('Goal reached in the simulation.'); }
    }
    function move() {
        for (const item of state.workers) {
            const step = item.path.shift();
            if (step) { item.x = step.x; item.y = step.y; }
            if (!item.path.length && item.status === 'STUCK' && kitchen.some(spot => spot.x === item.x && spot.y === item.y)) { item.status = 'RESETTING'; item.recovery = 1; }
        }
    }
    return {
        view, setup, estimate,
        control({ action, speed }) {
            if (!state) throw fail('Set up a simulation first.', 409);
            if (action === 'play') { if (state.status === 'WON') throw fail('This simulation already reached the goal.', 409); state.status = 'RUNNING'; }
            else if (action === 'pause') { if (state.status === 'RUNNING') state.status = 'PAUSED'; }
            else if (action === 'speed') { if (!speeds.includes(speed)) throw fail(`Speed must be one of ${speeds.join(', ')}.`); state.speed = speed; }
            else throw fail('Unknown simulation command.');
            save();
            return view();
        },
        tick() {
            if (state?.status !== 'RUNNING') return false;
            let days = 0;
            for (let step = 0; step < state.speed && state.status === 'RUNNING'; step += 1) {
                move();
                state.tick += 1;
                if (state.tick >= rules.ticksPerDayAtSpeed1) { state.tick = 0; advanceDay(); days += 1; }
            }
            if (days) save();
            return true;
        },
        pause() { if (state?.status === 'RUNNING') { state.status = 'PAUSED'; save(); } },
    };
}
