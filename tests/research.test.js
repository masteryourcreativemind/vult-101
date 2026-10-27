// AI NOTE: Research workflow fixtures use isolated SQLite and synthetic evidence, never external APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/storage/db.js';
import { createWorld } from '../server/sim/world.js';
import { createTasks } from '../server/coordination/tasks.js';
import { createResearchWorkflow } from '../server/coordination/research.js';

function fixture(context) {
    const store = openStore();
    context.after(() => store.close());
    createWorld(store);
    store.database.prepare("UPDATE campaign SET state = 'RUNNING' WHERE id = 1").run();
    const tasks = createTasks(store);
    const research = createResearchWorkflow({ store, tasks });
    return { store, tasks, research };
}

function packet(index, source = `https://research.example.org/report/${index}`) {
    return {
        source: { name: `Source ${index}`, url: source, accessedAt: '2026-10-27T12:00:00.000Z' },
        observations: [`Observed fact ${index}`],
        sample: { description: 'Public listing sample', size: null, selection: 'Top results, sorted by recency' },
        method: 'Manual review of public pages.',
        inferences: [`Inference ${index}`],
        limitations: ['Sample is not representative of sales or total demand.'],
    };
}

function synthesis(evidenceArtifactIds, summary = 'Synthetic summary for workflow validation.') {
    return {
        summary,
        findings: [{ claim: 'This is a test inference, not a market fact.', evidenceArtifactIds: [evidenceArtifactIds[0]] }],
        evidenceArtifactIds,
        confidence: 'LOW',
        limitations: ['Test fixtures are not real research.'],
    };
}

function completeEvidence(tasks, research, order) {
    for (const [index, assignment] of order.assignments.entries()) {
        const lease = tasks.claim(assignment.taskId, assignment.researcherId);
        research.submitEvidence(order.id, lease, packet(index));
    }
    return research.list()[0];
}

test('research orders assign five distinct workers and isolate packet contents', context => {
    const { store, tasks, research } = fixture(context);
    const order = research.createOrder({ topic: 'Planner demand', question: 'What features appear in current planners?' });
    assert.equal(order.status, 'COLLECTING');
    assert.equal(order.assignments.length, 5);
    assert.equal(new Set(order.assignments.map(item => item.researcherId)).size, 5);
    assert.equal(new Set(order.assignments.map(item => item.taskId)).size, 5);
    assert.equal(order.assignments.every(item => tasks.get(item.taskId).facility === 'comms_lab'), true);
    assert.equal(JSON.stringify(order).includes('Observed fact'), false);

    const first = order.assignments[0];
    const next = order.assignments[1];
    const firstLease = tasks.claim(first.taskId, first.researcherId);
    assert.throws(() => tasks.claim(next.taskId, first.researcherId), /belongs to another researcher/);
    const result = research.submitEvidence(order.id, firstLease, packet(0));
    assert.equal(result.status, 'COLLECTING');
    assert.equal(research.getOrder(order.id).assignments.find(item => item.taskId === first.taskId).submitted, true);
    assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM artifacts WHERE kind = ?').get('research_evidence').count, 1);
});

test('research packets require provenance and distinct HTTPS source URLs', context => {
    const { tasks, research } = fixture(context);
    const order = research.createOrder({ topic: 'Planner demand', question: 'What features appear in current planners?' });
    const first = order.assignments[0];
    const firstLease = tasks.claim(first.taskId, first.researcherId);
    assert.throws(() => research.submitEvidence(order.id, firstLease, { ...packet(0), limitations: [] }), /Limitations/);
    assert.throws(() => research.submitEvidence(order.id, firstLease, packet(0, 'http://research.example.org/report/0')), /HTTPS/);
    research.submitEvidence(order.id, firstLease, packet(0));

    const second = order.assignments[1];
    const secondLease = tasks.claim(second.taskId, second.researcherId);
    assert.throws(() => research.submitEvidence(order.id, secondLease, packet(1, 'https://research.example.org/report/0#section')), /independent/);
    assert.equal(research.getOrder(order.id).status, 'COLLECTING');
    research.submitEvidence(order.id, secondLease, packet(1));
});

test('five completed evidence packets close collection without synthesizing or claiming verified findings', context => {
    const { tasks, research } = fixture(context);
    const order = research.createOrder({ topic: 'Planner demand', question: 'What features appear in current planners?' });
    for (const [index, assignment] of order.assignments.entries()) {
        const lease = tasks.claim(assignment.taskId, assignment.researcherId);
        research.submitEvidence(order.id, lease, packet(index));
    }
    const completed = research.getOrder(order.id);
    assert.equal(completed.status, 'PACKETS_COMPLETE');
    assert.equal(completed.assignments.filter(item => item.submitted).length, 5);
    assert.equal(completed.synthesis, null);
});

test('synthesis cites all five packets and requires two distinct non-author reviews', context => {
    const { tasks, research } = fixture(context);
    let order = research.createOrder({ topic: 'Planner demand', question: 'What features appear in current planners?' });
    order = completeEvidence(tasks, research, order);
    const evidenceIds = order.assignments.map(assignment => tasks.get(assignment.taskId).result)
        .map(result => JSON.parse(result).artifactId);
    assert.throws(() => research.createSynthesis(order.id, 'researcher-2', synthesis(evidenceIds)), /Only the order author/);
    assert.throws(() => research.createSynthesis(order.id, 'researcher-1', synthesis(evidenceIds.slice(1))), /cite every independent/);
    const draft = research.createSynthesis(order.id, 'researcher-1', synthesis(evidenceIds));
    assert.equal(draft.status, 'IN_REVIEW');
    assert.throws(() => research.reviewSynthesis(order.id, 'researcher-1', 'PASS', 'Self review is forbidden.'), /non-author/);
    assert.equal(research.reviewSynthesis(order.id, 'researcher-2', 'PASS', 'Evidence and limits checked.').status, 'IN_REVIEW');
    assert.throws(() => research.reviewSynthesis(order.id, 'researcher-2', 'PASS', 'Duplicate review.'), /already submitted/);
    assert.equal(research.reviewSynthesis(order.id, 'researcher-5', 'PASS', 'Skeptical check passed.').status, 'ACCEPTED');
});

test('one revision is permitted; a second revise verdict blocks the synthesis', context => {
    const { tasks, research } = fixture(context);
    let order = research.createOrder({ topic: 'Planner demand', question: 'What features appear in current planners?' });
    order = completeEvidence(tasks, research, order);
    const evidenceIds = order.assignments.map(assignment => JSON.parse(tasks.get(assignment.taskId).result).artifactId);
    research.createSynthesis(order.id, 'researcher-1', synthesis(evidenceIds));
    research.reviewSynthesis(order.id, 'researcher-2', 'REVISE', 'Clarify the sample boundary.');
    assert.equal(research.reviewSynthesis(order.id, 'researcher-5', 'PASS', 'Check the requested revision.').status, 'REVISION_REQUIRED');
    assert.throws(() => research.createSynthesis(order.id, 'researcher-1', synthesis(evidenceIds)), /must change the reviewed content/);
    assert.equal(research.createSynthesis(order.id, 'researcher-1', synthesis(evidenceIds, 'Revised synthetic summary for workflow validation.')).version, 2);
    research.reviewSynthesis(order.id, 'researcher-2', 'REVISE', 'The limitation remains unclear.');
    assert.equal(research.reviewSynthesis(order.id, 'researcher-5', 'REVISE', 'Still not supported.').status, 'BLOCKED');
});