// AI NOTE: Research packets are isolated per assigned researcher and never imply verified external evidence.
import { randomUUID } from 'node:crypto';
import { contentHash } from '../storage/canonical.js';
import { recordEvent } from '../storage/db.js';

const packetKeys = ['source', 'observations', 'sample', 'method', 'inferences', 'limitations'];
const sourceKeys = ['name', 'url', 'accessedAt'];
const sampleKeys = ['description', 'size', 'selection'];
const synthesisKeys = ['summary', 'findings', 'evidenceArtifactIds', 'confidence', 'limitations'];
const findingKeys = ['claim', 'evidenceArtifactIds'];
const reviewers = ['researcher-2', 'researcher-5'];

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
        Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
        throw new TypeError(`${label} has missing or unexpected fields.`);
    }
}

function text(value, label, maximum) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) throw new TypeError(`${label} must be non-empty text no longer than ${maximum} characters.`);
    return value.trim();
}

function textList(value, label) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new TypeError(`${label} must contain between 1 and 20 items.`);
    return value.map((item, index) => text(item, `${label}[${index}]`, 2000));
}

function validatePacket(packet) {
    exactKeys(packet, packetKeys, 'Evidence packet');
    exactKeys(packet.source, sourceKeys, 'Source');
    exactKeys(packet.sample, sampleKeys, 'Sample');
    const sourceName = text(packet.source.name, 'Source name', 200);
    const sourceURL = text(packet.source.url, 'Source URL', 2000);
    const parsedURL = new URL(sourceURL);
    if (parsedURL.protocol !== 'https:' || parsedURL.username || parsedURL.password) throw new TypeError('Source URL must be an HTTPS URL without embedded credentials.');
    parsedURL.hash = '';
    const accessedAt = text(packet.source.accessedAt, 'Source access time', 40);
    if (!Number.isFinite(Date.parse(accessedAt))) throw new TypeError('Source access time must be a valid timestamp.');
    if (packet.sample.size !== null && (!Number.isSafeInteger(packet.sample.size) || packet.sample.size < 1)) throw new TypeError('Sample size must be a positive integer or null when unreported.');
    const normalized = {
        source: { name: sourceName, url: parsedURL.href, accessedAt },
        observations: textList(packet.observations, 'Observations'),
        sample: {
            description: text(packet.sample.description, 'Sample description', 1000),
            size: packet.sample.size,
            selection: text(packet.sample.selection, 'Sample selection', 1000),
        },
        method: text(packet.method, 'Method', 2000),
        inferences: textList(packet.inferences, 'Inferences'),
        limitations: textList(packet.limitations, 'Limitations'),
    };
    contentHash(normalized);
    return normalized;
}

function validateSynthesis(content, evidenceIds) {
    exactKeys(content, synthesisKeys, 'Synthesis');
    const allowedEvidence = new Set(evidenceIds);
    if (!Array.isArray(content.evidenceArtifactIds) || content.evidenceArtifactIds.length !== evidenceIds.length ||
        new Set(content.evidenceArtifactIds).size !== evidenceIds.length || content.evidenceArtifactIds.some(id => !allowedEvidence.has(id))) {
        throw new TypeError('Synthesis must cite every independent evidence packet exactly once.');
    }
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(content.confidence)) throw new TypeError('Confidence must be LOW, MEDIUM, or HIGH.');
    if (!Array.isArray(content.findings) || content.findings.length < 1 || content.findings.length > 20) throw new TypeError('Synthesis must contain between 1 and 20 findings.');
    const findings = content.findings.map((finding, index) => {
        exactKeys(finding, findingKeys, `Finding ${index + 1}`);
        const cited = textList(finding.evidenceArtifactIds, `Finding ${index + 1} evidence`);
        if (cited.some(id => !allowedEvidence.has(id))) throw new TypeError(`Finding ${index + 1} cites evidence outside this order.`);
        return { claim: text(finding.claim, `Finding ${index + 1} claim`, 2000), evidenceArtifactIds: cited };
    });
    return {
        summary: text(content.summary, 'Synthesis summary', 4000),
        findings,
        evidenceArtifactIds: [...content.evidenceArtifactIds],
        confidence: content.confidence,
        limitations: textList(content.limitations, 'Synthesis limitations'),
    };
}

export function createResearchWorkflow({ store, tasks, clock = () => new Date() }) {
    const { database } = store;

    function getOrder(id) {
        const order = database.prepare('SELECT * FROM research_orders WHERE id = ?').get(id);
        if (!order) return null;
        const assignments = database.prepare(`SELECT research_assignments.task_id, research_assignments.worker_id,
                research_assignments.artifact_id, tasks.state AS task_state
            FROM research_assignments JOIN tasks ON tasks.id = research_assignments.task_id
            WHERE research_assignments.order_id = ? ORDER BY research_assignments.worker_id`).all(id);
        const synthesis = database.prepare(`SELECT artifact_id, revision, review_status FROM research_syntheses WHERE order_id = ?`).get(id);
        return {
            id: order.id,
            topic: order.topic,
            question: order.question,
            status: order.status,
            createdAt: order.created_at,
            assignments: assignments.map(assignment => ({
                taskId: assignment.task_id,
                researcherId: assignment.worker_id,
                taskState: assignment.task_state,
                submitted: Boolean(assignment.artifact_id),
            })),
            synthesis: synthesis ? { artifactId: synthesis.artifact_id, revision: synthesis.revision, status: synthesis.review_status } : null,
        };
    }

    function createOrder({ topic, question }) {
        const cleanTopic = text(topic, 'Topic', 120);
        const cleanQuestion = text(question, 'Question', 1000);
        const researchers = database.prepare("SELECT id FROM workers WHERE class = 'researcher' ORDER BY id").all();
        if (researchers.length !== 5) throw new Error('A research order requires exactly five commissioned researcher identities.');
        const orderId = randomUUID();
        const createdAt = clock().toISOString();
        store.transaction(() => {
            database.prepare("INSERT INTO research_orders (id, topic, question, status, created_at) VALUES (?, ?, ?, 'COLLECTING', ?)")
                .run(orderId, cleanTopic, cleanQuestion, createdAt);
            researchers.forEach((researcher, index) => {
                const taskId = randomUUID();
                tasks.create({
                    id: taskId,
                    title: `Research packet ${index + 1}: ${cleanTopic}`,
                    kind: 'research_packet',
                    classId: 'researcher',
                    facility: 'comms_lab',
                });
                database.prepare('INSERT INTO research_assignments (order_id, task_id, worker_id) VALUES (?, ?, ?)')
                    .run(orderId, taskId, researcher.id);
            });
            recordEvent(store, 'research', 'Five-person research order created.', { orderId }, clock());
        });
        return getOrder(orderId);
    }

    function submitEvidence(orderId, context, packet) {
        const normalized = validatePacket(packet);
        const hash = contentHash(normalized);
        const artifactId = randomUUID();
        return store.transaction(() => {
            tasks.assertLease(context);
            const assignment = database.prepare(`SELECT research_assignments.worker_id, research_assignments.artifact_id,
                    research_orders.status
                FROM research_assignments JOIN research_orders ON research_orders.id = research_assignments.order_id
                WHERE research_assignments.order_id = ? AND research_assignments.task_id = ?`).get(orderId, context.taskId);
            if (!assignment || assignment.worker_id !== context.workerId) throw new Error('Research task is not assigned to this worker and order.');
            if (assignment.status !== 'COLLECTING' || assignment.artifact_id) throw new Error('Research packet is already submitted or collection is closed.');
            const existing = database.prepare(`SELECT artifacts.content FROM research_assignments
                JOIN artifacts ON artifacts.id = research_assignments.artifact_id
                WHERE research_assignments.order_id = ?`).all(orderId);
            if (existing.some(row => JSON.parse(row.content).source.url === normalized.source.url)) throw new Error('Research source URL must be independent from prior packets.');
            database.prepare(`INSERT INTO artifacts (id, task_id, author_id, kind, version, hash, content, state, created_at)
                VALUES (?, ?, ?, 'research_evidence', 1, ?, ?, 'SUBMITTED', ?)`)
                .run(artifactId, context.taskId, context.workerId, hash, JSON.stringify(normalized), clock().toISOString());
            database.prepare('UPDATE research_assignments SET artifact_id = ? WHERE order_id = ? AND task_id = ?')
                .run(artifactId, orderId, context.taskId);
            tasks.complete(context, { orderId, artifactId, evidenceHash: hash });
            const submitted = database.prepare('SELECT COUNT(*) AS count FROM research_assignments WHERE order_id = ? AND artifact_id IS NOT NULL').get(orderId).count;
            const status = submitted === 5 ? 'PACKETS_COMPLETE' : 'COLLECTING';
            if (status !== assignment.status) database.prepare('UPDATE research_orders SET status = ? WHERE id = ?').run(status, orderId);
            recordEvent(store, 'research', 'Research evidence packet submitted.', { orderId, artifactId, researcherId: context.workerId }, clock());
            return { orderId, artifactId, evidenceHash: hash, status };
        });
    }

    function getSynthesis(orderId) {
        const row = database.prepare(`SELECT artifacts.id, artifacts.author_id, artifacts.version, artifacts.hash, artifacts.content,
                research_syntheses.review_status
            FROM research_syntheses JOIN artifacts ON artifacts.id = research_syntheses.artifact_id
            WHERE research_syntheses.order_id = ?`).get(orderId);
        return row ? { id: row.id, authorId: row.author_id, version: row.version, hash: row.hash, content: JSON.parse(row.content), status: row.review_status } : null;
    }

    function createSynthesis(orderId, authorId, content) {
        const order = database.prepare('SELECT status FROM research_orders WHERE id = ?').get(orderId);
        if (!order) throw new Error('Research order does not exist.');
        if (order.status !== 'PACKETS_COMPLETE') throw new Error('All five evidence packets are required before synthesis.');
        const assignment = database.prepare('SELECT task_id FROM research_assignments WHERE order_id = ? AND worker_id = ?').get(orderId, authorId);
        if (!assignment || authorId !== 'researcher-1') throw new Error('Only the order author may write synthesis.');
        const evidence = database.prepare('SELECT artifact_id FROM research_assignments WHERE order_id = ? ORDER BY worker_id').all(orderId).map(row => row.artifact_id);
        const normalized = validateSynthesis(content, evidence);
        const existing = database.prepare('SELECT artifact_id, revision, review_status FROM research_syntheses WHERE order_id = ?').get(orderId);
        let revision = 1;
        if (existing) {
            if (existing.review_status !== 'REVISION_REQUIRED' || existing.revision !== 1) throw new Error('Synthesis is not eligible for its single revision.');
            revision = 2;
        }
        const artifactId = randomUUID();
        const hash = contentHash(normalized);
        if (existing && database.prepare('SELECT hash FROM artifacts WHERE id = ?').get(existing.artifact_id)?.hash === hash) {
            throw new Error('A synthesis revision must change the reviewed content.');
        }
        const createdAt = clock().toISOString();
        store.transaction(() => {
            database.prepare(`INSERT INTO artifacts (id, task_id, author_id, kind, version, hash, content, state, created_at)
                VALUES (?, ?, ?, 'research_synthesis', ?, ?, ?, 'IN_REVIEW', ?)`)
                .run(artifactId, assignment.task_id, authorId, revision, hash, JSON.stringify(normalized), createdAt);
            if (existing) {
                database.prepare(`UPDATE research_syntheses SET artifact_id = ?, revision = ?, review_status = 'IN_REVIEW', updated_at = ? WHERE order_id = ?`)
                    .run(artifactId, revision, createdAt, orderId);
            } else {
                database.prepare(`INSERT INTO research_syntheses (order_id, artifact_id, revision, review_status, updated_at)
                    VALUES (?, ?, ?, 'IN_REVIEW', ?)`)
                    .run(orderId, artifactId, revision, createdAt);
            }
            recordEvent(store, 'research', 'Research synthesis submitted for independent review.', { orderId, artifactId, revision }, clock());
        });
        return getSynthesis(orderId);
    }

    function reviewSynthesis(orderId, reviewerId, verdict, notes) {
        if (!reviewers.includes(reviewerId)) throw new Error('Reviewer must be an assigned non-author, including the verifier.');
        if (!['PASS', 'REVISE', 'BLOCK'].includes(verdict)) throw new TypeError('Review verdict must be PASS, REVISE, or BLOCK.');
        const cleanNotes = text(notes, 'Review notes', 2000);
        return store.transaction(() => {
            const synthesis = database.prepare('SELECT artifact_id, revision, review_status FROM research_syntheses WHERE order_id = ?').get(orderId);
            if (!synthesis || synthesis.review_status !== 'IN_REVIEW') throw new Error('No synthesis is awaiting review.');
            const assignment = database.prepare('SELECT 1 FROM research_assignments WHERE order_id = ? AND worker_id = ?').get(orderId, reviewerId);
            if (!assignment) throw new Error('Reviewer is not assigned to this research order.');
            if (database.prepare('SELECT 1 FROM reviews WHERE artifact_id = ? AND reviewer_id = ?').get(synthesis.artifact_id, reviewerId)) {
                throw new Error('Reviewer has already submitted a decision for this synthesis.');
            }
            database.prepare('INSERT INTO reviews (artifact_id, reviewer_id, verdict, notes, created_at) VALUES (?, ?, ?, ?, ?)')
                .run(synthesis.artifact_id, reviewerId, verdict, cleanNotes, clock().toISOString());
            const decisions = database.prepare('SELECT reviewer_id, verdict FROM reviews WHERE artifact_id = ?').all(synthesis.artifact_id);
            let status = 'IN_REVIEW';
            if (verdict === 'BLOCK') status = 'BLOCKED';
            else if (decisions.length === reviewers.length) {
                if (!reviewers.every(id => decisions.some(decision => decision.reviewer_id === id))) throw new Error('Both independent reviewer decisions are required.');
                if (decisions.some(decision => decision.verdict === 'REVISE')) status = synthesis.revision === 1 ? 'REVISION_REQUIRED' : 'BLOCKED';
                else status = 'ACCEPTED';
            }
            database.prepare('UPDATE research_syntheses SET review_status = ?, updated_at = ? WHERE order_id = ?')
                .run(status, clock().toISOString(), orderId);
            recordEvent(store, 'research', 'Research synthesis review recorded.', { orderId, reviewerId, verdict, status }, clock());
            return getSynthesis(orderId);
        });
    }

    return { createOrder, createSynthesis, getOrder, getSynthesis, list() { return database.prepare('SELECT id FROM research_orders ORDER BY created_at, id').all().map(row => getOrder(row.id)); }, reviewSynthesis, submitEvidence };
}