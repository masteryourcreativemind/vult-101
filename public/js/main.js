// AI NOTE: UI uses text nodes for all model, operator, and external content; no untrusted HTML is rendered.
import { connect, request } from './net.js';
import { createRenderer } from './renderer.js';
import { spriteFor } from './assets.js';

const byId = id => document.getElementById(id);
const currency = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
const label = value => value.replaceAll('_', ' ').toUpperCase();
let raw;
let state;
let mode = localStorage.getItem('vault-mode') === 'sim' ? 'sim' : 'live';
let activeTab = 'roster';
let selection;
let editorRevision;
let editorOriginal = '';
let editorClass;
let editorLoading = false;
let permissionConnectorId;
const panel = byId('operations-panel');
const terminal = byId('terminal');
const renderer = createRenderer(byId('vault'), byId('map-viewport'), select);

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function icon(name) {
    const image = document.createElement('img');
    image.src = `/vendor/icons/${name}.svg`;
    image.alt = '';
    return image;
}
function notice(message) { byId('notice').textContent = message; byId('notice').hidden = !message; }
function empty(title, detail, iconName) {
    const container = element('div', 'empty-state');
    container.append(icon(iconName), element('strong', '', title), element('span', '', detail));
    panel.append(container);
}
function roomName(id) { return state.world.facilities.find(room => room.id === id)?.name ?? 'CORRIDOR'; }
const simActive = () => mode === 'sim' && raw?.game && raw.game.status !== 'NONE';
// Sim mode reuses the live views, swapping in fake-money game positions and statuses.
function adapt(next) {
    if (mode !== 'sim' || !next.game || next.game.status === 'NONE') return next;
    const positions = new Map(next.game.workers.map(worker => [worker.id, worker]));
    return { ...next, world: { ...next.world, workers: next.world.workers.map(worker => ({ ...worker, ...positions.get(worker.id) })) } };
}
function workerRoom(worker) { return state.world.facilities.find(room => worker.x > room.x && worker.x < room.x + room.w - 1 && worker.y > room.y && worker.y < room.y + room.h - 1); }
function select(value) {
    selection = value;
    renderer.select(value);
    renderSelection();
    if (activeTab === 'roster') renderPanel();
}
function renderSelection() {
    const container = byId('selection');
    container.replaceChildren();
    const detail = element('div');
    if (selection?.type === 'worker') {
        const worker = state.world.workers.find(item => item.id === selection.id);
        if (!worker) return;
        detail.append(element('strong', '', worker.name), element('span', '', `${label(worker.class)} / ${workerRoom(worker)?.name ?? 'CORRIDOR'} / ${worker.status}`));
        container.append(icon('user-round'), detail);
        byId('map-location').textContent = workerRoom(worker)?.name ?? 'CORRIDOR';
        byId('map-coordinates').textContent = `${worker.x}, ${worker.y}`;
    } else if (selection?.type === 'room') {
        const room = state.world.facilities.find(item => item.id === selection.id);
        const workers = state.world.workers.filter(worker => workerRoom(worker)?.id === room.id);
        detail.append(element('strong', '', room.name), element('span', '', `${workers.length} PERSONNEL / ${room.seats} WORKSTATIONS`));
        container.append(icon('door-open'), detail);
        byId('map-location').textContent = room.name;
        byId('map-coordinates').textContent = `${room.x}, ${room.y}`;
    } else {
        detail.append(element('strong', '', 'Standing by'), element('span', '', 'No worker selected'));
        container.append(icon('radio'), detail);
    }
}
function renderPanel() {
    if (!state) return;
    const scroll = panel.scrollTop;
    panel.replaceChildren();
    panel.setAttribute('aria-labelledby', `tab-${activeTab}`);
    if (activeTab === 'roster') {
        const teams = ['command', 'research', 'marketing', 'design', 'quality', 'operations', 'finance', 'knowledge'];
        for (const team of teams) {
            const workers = state.world.workers.filter(worker => worker.team === team);
            panel.append(element('div', 'team-heading', `${label(team)} / ${String(workers.length).padStart(2, '0')}`));
            for (const worker of workers) {
                const row = element('button', `worker-row${selection?.id === worker.id ? ' selected' : ''}`);
                const portrait = document.createElement('img');
                portrait.src = spriteFor(worker, state.world.workers.findIndex(item => item.id === worker.id)).toDataURL();
                portrait.alt = '';
                const info = element('span', 'worker-info');
                info.append(element('strong', '', worker.name), element('small', '', workerRoom(worker)?.name ?? 'CORRIDOR'));
                row.append(portrait, info, element('span', 'worker-status', worker.status));
                row.addEventListener('click', () => select({ type: 'worker', id: worker.id }));
                row.setAttribute('aria-pressed', String(selection?.id === worker.id));
                panel.append(row);
            }
        }
    } else if (activeTab === 'jobs' && mode === 'sim') {
        const products = raw.game.products ?? [];
        if (!products.length) empty('No products yet', 'THE OVERSEER COMMISSIONS RESEARCH ON DAY 1', 'clipboard-list');
        for (const product of products) {
            const row = element('div', 'entry-row');
            const detail = product.stage === 'live' ? `LIVE / ${currency(product.priceCents)} / ${product.sales} SOLD / ${currency(product.revenueCents)}${product.hit ? ' / TRENDING' : ''}` : `${label(product.stage)}${['live', 'expired', 'discarded'].includes(product.stage) ? '' : ` / DAY ${product.progress}`}`;
            row.append(element('strong', '', product.name), element('span', 'stage-tag', detail));
            panel.append(row);
        }
    } else if (activeTab === 'ledger' && mode === 'sim') {
        const totals = raw.game.totals ?? {};
        const rows = [['Gross sales', totals.revenueCents], ['Refunds', -totals.refundCents], ['Etsy transaction fees', -totals.transactionCents], ['Payment processing', -totals.processingCents], ['Listing fees', -totals.listingCents], ['Subscription', -totals.subscriptionCents], ['AI cash (API + overage)', -totals.aiCashCents], ['Shop setup', -totals.setupCents], ['Net profit', raw.game.netCents]];
        for (const [name, cents] of rows) {
            const row = element('div', 'entry-row');
            row.append(element('strong', '', name), element('span', `amount${cents < 0 ? ' negative' : ''}`, currency(cents ?? 0)));
            panel.append(row);
        }
        const usage = element('div', 'entry-row');
        usage.append(element('strong', '', 'AI usage'), element('span', '', `${(totals.inputTokens ?? 0).toLocaleString()} input / ${(totals.outputTokens ?? 0).toLocaleString()} output tokens`), element('span', '', `${currency(totals.creditsUsedCents ?? 0)} drawn from plan credits (not extra cash)`));
        panel.append(usage);
    } else if (activeTab === 'log' && mode === 'sim') {
        for (const entry of raw.game.log ?? []) {
            const row = element('div', 'log-row');
            const meta = element('div', 'log-meta');
            meta.append(element('span', '', `DAY ${entry.day}`), element('time', '', entry.date));
            row.append(meta, element('div', 'log-message', entry.message));
            panel.append(row);
        }
    } else if (activeTab === 'jobs') {
        if (mode !== 'sim') {
            const heading = element('div', 'research-orders-heading');
            heading.append(element('strong', '', 'RESEARCH ORDERS'));
            const createButton = element('button', 'button quiet', 'New order');
            createButton.type = 'button';
            createButton.addEventListener('click', openResearchOrder);
            heading.append(createButton);
            panel.append(heading);
            if (!state.researchOrders.length) empty('No research orders', 'Create an order to queue five independent researcher tasks.', 'clipboard-list');
            for (const order of state.researchOrders) {
                const submitted = order.assignments.filter(assignment => assignment.submitted).length;
                const synthesisStatus = order.synthesis ? ` / SYNTHESIS ${label(order.synthesis.status)} / REVISION ${order.synthesis.revision}` : '';
                const row = element('div', 'entry-row research-order-row');
                row.append(element('strong', '', order.topic), element('span', '', `${label(order.status)} / ${submitted} OF 5 PACKETS${synthesisStatus}`), element('span', '', order.question));
                panel.append(row);
            }
        }
        for (const task of state.tasks) {
            const row = element('div', 'entry-row');
            row.append(element('strong', '', task.title), element('span', '', `${task.state} / ${roomName(task.facility)}`), element('span', '', `${task.workerId ?? 'UNASSIGNED'} / ATTEMPT ${task.attempts}`));
            panel.append(row);
        }
    } else if (activeTab === 'ledger') {
        if (!state.ledger.entries.length) empty('No reconciled cash entries', 'SETTLED USD / $0.00', 'receipt-text');
        for (const entry of [...state.ledger.entries].reverse()) {
            const row = element('div', 'entry-row');
            row.append(element('strong', '', label(entry.kind)), element('span', `amount${entry.amount_cents < 0 ? ' negative' : ''}`, currency(entry.amount_cents)), element('span', '', entry.reference), element('span', '', entry.evidence));
            panel.append(row);
        }
    } else if (activeTab === 'approvals') {
        if (!state.approvals.length) empty('No pending approvals', 'PUBLICATION REMAINS LOCKED', 'shield-check');
        for (const approval of state.approvals) {
            const row = element('div', 'entry-row');
            row.append(element('strong', '', label(approval.kind)), element('span', '', approval.state), element('pre', 'approval-payload', JSON.stringify(approval.payload, null, 2)), element('span', '', `SHA256 ${approval.payload_hash}`));
            if (approval.state === 'PENDING') {
                const actions = element('div', 'approval-controls');
                for (const decision of ['APPROVED', 'REJECTED']) {
                    const button = element('button', 'button quiet', decision === 'APPROVED' ? 'Approve version' : 'Reject');
                    button.prepend(icon(decision === 'APPROVED' ? 'check' : 'x'));
                    button.addEventListener('click', async () => {
                        button.disabled = true;
                        try { await request(`/api/approvals/${approval.id}`, { decision }); notice(''); }
                        catch (error) { notice(error.message); button.disabled = false; }
                    });
                    actions.append(button);
                }
                row.append(actions);
            }
            panel.append(row);
        }
    } else if (activeTab === 'log') {
        if (!state.events.length) empty('No events recorded', 'LOCAL EVENT JOURNAL', 'scroll-text');
        for (const event of state.events) {
            const row = element('div', 'log-row');
            const meta = element('div', 'log-meta');
            meta.append(element('span', '', label(event.kind)), element('time', '', new Date(event.created_at).toLocaleTimeString('en-GB')));
            row.append(meta, element('div', 'log-message', event.message));
            panel.append(row);
        }
    }
    panel.scrollTop = scroll;
}
function render(next) {
    raw = next;
    state = adapt(next);
    const campaign = state.campaign;
    document.body.classList.toggle('sim-mode', mode === 'sim');
    byId('mode-label').textContent = mode === 'sim' ? 'Live console' : 'Simulation';
    byId('tab-approvals').hidden = mode === 'sim';
    if (mode === 'sim' && activeTab === 'approvals') activeTab = 'roster';
    renderSimBar();
    byId('net-profit').textContent = currency(state.ledger.netCents);
    byId('net-profit').parentElement.classList.toggle('negative', state.ledger.netCents < 0);
    byId('ai-cost').textContent = currency(state.ledger.aiCashCents);
    byId('etsy-fees').textContent = currency(state.ledger.marketplaceFeeCents);
    byId('settled-count').textContent = `${state.ledger.entryCount} settled entries`;
    byId('ai-allowance').textContent = state.budgets.aiMonth.limit ? `${state.budgets.aiMonth.remaining} units available` : 'Allowance locked';
    byId('goal-progress').value = state.ledger.progress;
    byId('goal-percent').textContent = `${(state.ledger.progress * 100).toFixed(4)}%`;
    if (mode === 'sim') {
        const game = state.game;
        const totals = game.totals ?? {};
        const progress = Math.max(0, Math.min(1, (game.netCents ?? 0) / game.goalCents));
        byId('net-profit').textContent = currency(game.netCents ?? 0);
        byId('net-profit').parentElement.classList.toggle('negative', (game.netCents ?? 0) < 0);
        byId('ai-cost').textContent = currency(totals.aiCashCents ?? 0);
        byId('ai-allowance').textContent = `${currency(totals.creditsUsedCents ?? 0)} plan credits used`;
        byId('etsy-fees').textContent = currency((totals.listingCents ?? 0) + (totals.transactionCents ?? 0) + (totals.processingCents ?? 0) + (totals.setupCents ?? 0));
        byId('settled-count').textContent = `${totals.sales ?? 0} simulated sales`;
        byId('goal-progress').value = progress;
        byId('goal-percent').textContent = `${(progress * 100).toFixed(4)}%`;
    }
    byId('campaign-state').textContent = campaign.state.replaceAll('_', ' ');
    byId('campaign-state').className = `state-badge ${campaign.state.toLowerCase()}`;
    if (simActive()) {
        byId('campaign-state').textContent = `SIM ${state.game.status}`;
        byId('campaign-state').className = `state-badge ${state.game.status === 'RUNNING' ? 'running' : ''}`;
    }
    byId('profile').textContent = label(campaign.profile);
    byId('campaign-reason').textContent = campaign.reason ?? 'Execution authorized.';
    byId('ready-count').textContent = `${state.connectors.filter(connector => connector.ready).length} / ${state.connectors.length} launch checks ready`;
    byId('body-count').textContent = state.world.workers.length;
    byId('roster-count').textContent = state.world.workers.length;
    byId('task-count').textContent = mode === 'sim' ? (state.game.products ?? []).length : state.tasks.length;
    byId('work-count').textContent = mode === 'sim' ? `${state.game.liveCount ?? 0} LIVE LISTINGS` : `${state.tasks.filter(task => task.state === 'LEASED').length} ACTIVE TASKS`;
    byId('approval-count').textContent = state.approvals.filter(approval => approval.state === 'PENDING').length;
    byId('suspend-label').textContent = campaign.profile === 'LIVE_TRIAL' ? 'Stop trial' : 'Emergency suspend';
    byId('suspend').disabled = ['SUSPENDED', 'GOAL_REACHED'].includes(campaign.state);
    byId('server-time').textContent = new Date(state.timestamp).toLocaleTimeString('en-GB');
    const connectors = byId('connectors');
    connectors.replaceChildren();
    for (const connector of state.connectors) {
        const row = element('div', 'connector');
        const content = element('div');
        content.append(element('strong', 'connector-name', connector.name), element('span', 'connector-status', label(connector.state)), element('span', 'connector-detail', connector.detail), element('span', 'connector-detail', `OWNER PERMISSION: ${label(connector.permissionDecision)}`));
        const permissionButton = element('button', 'button quiet connector-permission', connector.permissionDecision === 'NOT_REVIEWED' ? 'Review request' : 'Update decision');
        permissionButton.type = 'button';
        permissionButton.addEventListener('click', () => openPermissionRequest(connector));
        row.append(element('i', 'status-square'), content, permissionButton);
        connectors.append(row);
    }
    if (!byId('instruction-class').options.length) {
        for (const definition of state.classes) {
            const option = element('option', '', label(definition.id));
            option.value = definition.id;
            byId('instruction-class').append(option);
        }
    }
    renderer.update(state);
    renderPanel();
    renderSelection();
}

function openPermissionRequest(connector) {
    permissionConnectorId = connector.id;
    byId('permission-title').textContent = connector.name;
    byId('permission-purpose').textContent = connector.purpose;
    byId('permission-access').replaceChildren(...connector.requestedAccess.map(access => element('li', '', access)));
    byId('permission-scope-status').textContent = connector.scopeStatus;
    byId('permission-decision-status').textContent = `Current local decision: ${label(connector.permissionDecision)}`;
    byId('permission-dialog').showModal();
}

async function savePermissionDecision(decision) {
    if (!permissionConnectorId) return;
    try {
        await request(`/api/permissions/${permissionConnectorId}`, { decision });
        byId('permission-dialog').close();
        permissionConnectorId = undefined;
        notice(decision === 'APPROVE'
            ? 'Setup permission recorded only. Provider access and live execution remain disabled.'
            : 'Setup request declined. No provider access or live execution was changed.');
    } catch (error) { notice(error.message); }
}

byId('close-permission').addEventListener('click', () => byId('permission-dialog').close());
byId('permission-approve').addEventListener('click', () => savePermissionDecision('APPROVE'));
byId('permission-decline').addEventListener('click', () => savePermissionDecision('DECLINE'));

function openResearchOrder() {
    byId('research-topic').value = '';
    byId('research-question').value = '';
    byId('research-order-dialog').showModal();
    byId('research-topic').focus();
}

byId('close-research-order').addEventListener('click', () => byId('research-order-dialog').close());
byId('create-research-order').addEventListener('click', async () => {
    const button = byId('create-research-order');
    button.disabled = true;
    try {
        await request('/api/research/orders', { topic: byId('research-topic').value, question: byId('research-question').value });
        byId('research-order-dialog').close();
        notice('Research order queued. Five distinct tasks were created; no worker inference or API access occurred.');
    } catch (error) { notice(error.message); }
    finally { button.disabled = false; }
});

for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        for (const item of document.querySelectorAll('[data-tab]')) item.setAttribute('aria-selected', String(item === tab));
        panel.scrollTop = 0;
        renderPanel();
    });
}
function editorDirty() { return byId('instruction-text').value !== editorOriginal; }
function updateEditor() {
    byId('character-count').textContent = `${byId('instruction-text').value.length} / 24000`;
    byId('instruction-class').disabled = editorLoading;
    byId('reload-instructions').disabled = editorLoading;
    byId('save-instructions').disabled = editorLoading || !editorRevision || !editorDirty();
    byId('editor-state').textContent = editorLoading ? 'Loading' : editorDirty() ? 'Unsaved' : 'Saved';
}
async function loadInstructions(classId) {
    editorLoading = true;
    byId('instruction-text').disabled = true;
    updateEditor();
    try {
        const result = await request(`/api/instructions/${classId}`);
        editorClass = result.classId;
        editorRevision = result.revision;
        editorOriginal = result.text;
        byId('instruction-text').value = result.text;
        notice('');
    } catch (error) { editorRevision = undefined; notice(error.message); }
    finally { editorLoading = false; byId('instruction-text').disabled = false; updateEditor(); }
}
byId('open-terminal').addEventListener('click', () => {
    if (!state) return;
    terminal.showModal();
    if (!editorClass) loadInstructions(byId('instruction-class').value);
});
byId('close-terminal').addEventListener('click', () => terminal.close());
byId('instruction-class').addEventListener('change', event => {
    if (editorDirty() && !confirm('Discard unsaved instruction changes?')) { event.target.value = editorClass; return; }
    loadInstructions(event.target.value);
});
byId('instruction-text').addEventListener('input', updateEditor);
byId('reload-instructions').addEventListener('click', () => {
    if (!editorDirty() || confirm('Discard unsaved instruction changes?')) loadInstructions(byId('instruction-class').value);
});
byId('save-instructions').addEventListener('click', async () => {
    if (!editorClass || editorLoading) return;
    editorLoading = true;
    byId('instruction-text').disabled = true;
    updateEditor();
    try {
        const result = await request(`/api/instructions/${editorClass}`, { text: byId('instruction-text').value, revision: editorRevision });
        editorRevision = result.revision;
        editorOriginal = result.text;
        notice('');
    } catch (error) { notice(error.message); }
    finally { editorLoading = false; byId('instruction-text').disabled = false; updateEditor(); }
});
window.addEventListener('beforeunload', event => { if (editorDirty()) { event.preventDefault(); event.returnValue = ''; } });

function renderSimBar() {
    byId('sim-bar').hidden = mode !== 'sim';
    if (mode !== 'sim') return;
    const game = raw.game;
    const speed = byId('sim-speed');
    if (!speed.options.length) for (const value of game.catalog.speeds) { const option = element('option', '', `${value}x`); option.value = value; speed.append(option); }
    if (game.status === 'NONE') {
        byId('sim-date').textContent = 'No simulation';
        byId('sim-status').textContent = 'Choose models and a budget to begin';
        byId('sim-spend').textContent = '$0 / $0';
        byId('sim-spend-bar').value = 0;
        byId('sim-hold').textContent = '';
        byId('sim-play').disabled = true;
        speed.disabled = true;
        return;
    }
    const budget = game.config.monthlyBudgetCents;
    byId('sim-date').textContent = `${game.date} / DAY ${game.day}`;
    byId('sim-status').textContent = `${game.status} / MONTH ${game.month.index + 1} / ${game.catalog.models.find(model => model.id === game.config.commanderModelId)?.name} + ${game.catalog.models.find(model => model.id === game.config.workerModelId)?.name}`;
    byId('sim-spend').textContent = `${currency(game.month.spendCents)} / ${currency(budget)}`;
    byId('sim-spend-bar').value = Math.min(1, game.month.spendCents / budget);
    byId('sim-hold').textContent = game.hold ?? `${currency(game.month.creditsLeftCents)} plan credits left this month`;
    const running = game.status === 'RUNNING';
    byId('sim-play').disabled = game.status === 'WON';
    byId('sim-play').title = running ? 'Pause' : 'Run';
    byId('sim-play').setAttribute('aria-label', running ? 'Pause simulation' : 'Run simulation');
    byId('sim-play').querySelector('img').src = `/vendor/icons/${running ? 'pause' : 'play'}.svg`;
    speed.disabled = false;
    if (document.activeElement !== speed) speed.value = String(game.speed);
}
async function simCommand(body) {
    try { await request('/api/game', body); notice(''); }
    catch (error) { notice(error.message); }
}
byId('mode-toggle').addEventListener('click', () => {
    mode = mode === 'sim' ? 'live' : 'sim';
    localStorage.setItem('vault-mode', mode);
    selection = null;
    if (raw) render(raw);
    if (mode === 'sim' && raw?.game.status === 'NONE') openSetup();
});
byId('sim-play').addEventListener('click', () => simCommand({ action: raw.game.status === 'RUNNING' ? 'pause' : 'play' }));
byId('sim-speed').addEventListener('change', event => simCommand({ action: 'speed', speed: Number(event.target.value) }));
byId('sim-new').addEventListener('click', () => openSetup());
byId('close-sim-setup').addEventListener('click', () => byId('sim-setup').close());

let estimateRequest = 0;
function setupChoice() {
    return { commander: byId('sim-commander').value, worker: byId('sim-worker').value, plan: byId('sim-plan').value, successRate: Number(byId('sim-success').value) / 100 };
}
function openSetup() {
    const { catalog, config, defaultSuccessRate } = raw.game;
    for (const [id, items] of [['sim-commander', catalog.models], ['sim-worker', catalog.models], ['sim-plan', catalog.plans]]) {
        const select = byId(id);
        if (select.options.length) continue;
        for (const item of items) {
            const price = item.inputPerMTok === undefined ? (item.monthlyCents ? ` / ${currency(item.monthlyCents)} mo` : '') : ` / $${item.inputPerMTok} in / $${item.outputPerMTok} out`;
            const option = element('option', '', `${item.name}${price}`);
            option.value = item.id;
            select.append(option);
        }
    }
    byId('sim-commander').value = config?.commanderModelId ?? 'gpt-6.1-sol';
    byId('sim-worker').value = config?.workerModelId ?? 'gpt-6-luna';
    byId('sim-plan').value = config?.planId ?? 'max';
    byId('sim-success').value = ((config?.successRate ?? defaultSuccessRate) * 100).toFixed(1);
    byId('sim-budget').value = config ? config.monthlyBudgetCents / 100 : '';
    byId('sim-prices').textContent = `List prices verified ${catalog.verifiedOn}. Per 1M tokens.`;
    byId('sim-setup').showModal();
    refreshEstimate();
}
async function refreshEstimate() {
    const ticket = ++estimateRequest;
    const choice = setupChoice();
    const container = byId('sim-estimate');
    byId('sim-start').disabled = true;
    try {
        const query = new URLSearchParams({ commander: choice.commander, worker: choice.worker, plan: choice.plan, successRate: String(choice.successRate) });
        const result = await request(`/api/game/estimate?${query}`);
        if (ticket !== estimateRequest) return;
        const minimum = result.minimumMonthlyCents / 100;
        const budget = byId('sim-budget');
        budget.min = String(minimum);
        if (!(Number(budget.value) >= minimum)) budget.value = String(minimum);
        container.replaceChildren();
        const row = (name, value, wide) => { const item = element('div', `row${wide ? ' full' : ''}`); item.append(element('span', '', name), element('strong', '', value)); container.append(item); };
        row('Minimum monthly budget', currency(result.minimumMonthlyCents));
        row('One-time Etsy shop setup', currency(result.oneTimeCents));
        row('Subscription / month', currency(result.subscriptionCents));
        row('AI list-price usage / month', currency(result.aiUsageCents));
        row('Covered by plan credits', currency(result.creditsUsedCents));
        row('AI cash / month', currency(result.aiCashCents));
        row('AI cost per product', currency(result.perProductCents));
        row(`Listing fees (${result.products} products)`, currency(result.listingCents));
        row('Expected net, month 1', currency(result.projection[0].netCents));
        row('Expected net, month 12', currency(result.projection[11].netCents));
        row('Rough time to $1M at month-12 pace', result.monthsToGoal ? `${(result.monthsToGoal / 12).toFixed(1)} years` : 'Never at this pace', true);
        for (const warning of result.warnings) container.append(element('div', 'warning full', warning));
        container.append(element('div', 'subdued full', 'Expected values use the median outcome. Each run rolls real randomness, and nothing here predicts real income.'));
        byId('sim-start').disabled = false;
    } catch (error) {
        if (ticket !== estimateRequest) return;
        container.replaceChildren(element('div', 'warning full', error.message));
    }
}
for (const id of ['sim-commander', 'sim-worker', 'sim-plan', 'sim-success']) byId(id).addEventListener('change', refreshEstimate);
byId('sim-start').addEventListener('click', async () => {
    const choice = setupChoice();
    const seed = byId('sim-seed').value.trim();
    byId('sim-start').disabled = true;
    try {
        if (raw.game.status === 'RUNNING') await request('/api/game', { action: 'pause' });
        await request('/api/game', {
            action: 'setup', commanderModelId: choice.commander, workerModelId: choice.worker, planId: choice.plan, successRate: choice.successRate,
            monthlyBudgetCents: Math.round(Number(byId('sim-budget').value) * 100), ...(seed ? { seed: Number(seed) } : {}),
        });
        await request('/api/game', { action: 'play' });
        byId('sim-setup').close();
        notice('');
    } catch (error) { byId('sim-estimate').prepend(element('div', 'warning full', error.message)); }
    finally { byId('sim-start').disabled = false; }
});
byId('suspend').addEventListener('click', () => {
    byId('suspension-title').textContent = state.campaign.profile === 'LIVE_TRIAL' ? 'Stop the live trial?' : 'Emergency suspension?';
    byId('confirm-suspension').showModal();
});
byId('cancel-suspension').addEventListener('click', () => byId('confirm-suspension').close());
byId('confirm-stop').addEventListener('click', async () => {
    byId('confirm-stop').disabled = true;
    try {
        await request('/api/control', { action: state.campaign.profile === 'LIVE_TRIAL' ? 'stop' : 'suspend' });
        byId('confirm-suspension').close();
        notice('');
    } catch (error) { notice(error.message); }
    finally { byId('confirm-stop').disabled = false; }
});

connect(render, connected => {
    byId('connection').textContent = connected ? 'LOCAL / ONLINE' : 'CONNECTION LOST';
    byId('connection-dot').className = `connection-dot ${connected ? 'online' : 'offline'}`;
    if (!connected) byId('suspend').disabled = true;
}).catch(error => { notice(`Local console unavailable: ${error.message}`); byId('connection').textContent = 'OFFLINE'; });
