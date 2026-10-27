// AI NOTE: Owner permission records are local setup intent, never provider authentication or execution authority.
import { recordEvent } from '../storage/db.js';

export const CONNECTOR_DEFINITIONS = Object.freeze([
    {
        id: 'copilot', name: 'Copilot runtime', state: 'NOT_CONNECTED', ready: false,
        detail: 'Restricted SDK adapter and account allowance verification pending.',
        purpose: 'Use an authenticated Copilot runtime for bounded, task-scoped model work.',
        requestedAccess: ['Authenticate the local Copilot runtime.', 'Read available model IDs and usage events.'],
        scopeStatus: 'The SDK, account entitlements, and exact access requirements are not verified.',
    },
    {
        id: 'models', name: 'Model assignment', state: 'NOT_VERIFIED', ready: false,
        detail: 'Commander and worker model IDs are not verified.',
        purpose: 'Verify the exact commander and worker model IDs and account availability.',
        requestedAccess: ['Read model availability and plan entitlement only.'],
        scopeStatus: 'No inference, model substitution, or paid fallback is authorized.',
    },
    {
        id: 'etsy', name: 'Etsy shop', state: 'NOT_CONNECTED', ready: false,
        detail: 'OAuth, shop eligibility, and publishing policy verification pending.',
        purpose: 'Connect an explicitly selected seller account for narrowly scoped shop operations.',
        requestedAccess: ['Read the authorized shop profile, listings, and transaction records.'],
        scopeStatus: 'OAuth scopes, callback requirements, and policy are not verified. Drafting and publishing require separate approvals.',
    },
    {
        id: 'budget', name: 'Spending authority', state: 'LOCKED', ready: false,
        detail: 'No cash or AI allowance has been commissioned. All limits are zero.',
        purpose: 'Request separate owner authorization for explicit cash and AI usage limits.',
        requestedAccess: ['Set a monthly cash cap and AI allowance only after costs and account terms are verified.'],
        scopeStatus: 'No amount is proposed. This approval does not change budgets; effective limits remain zero.',
    },
]);

const connectorIds = new Set(CONNECTOR_DEFINITIONS.map(connector => connector.id));

export function createPermissionRequests(store, { clock = () => new Date() } = {}) {
    function list() {
        const decisions = new Map(store.database.prepare('SELECT connector_id, decision FROM connector_permissions').all()
            .map(row => [row.connector_id, row.decision]));
        return CONNECTOR_DEFINITIONS.map(connector => ({
            ...connector,
            requestedAccess: [...connector.requestedAccess],
            permissionDecision: decisions.get(connector.id) ?? 'NOT_REVIEWED',
        }));
    }

    function decide(connectorId, decision) {
        if (!connectorIds.has(connectorId)) throw Object.assign(new Error('Unknown connector permission request.'), { status: 404 });
        if (!['APPROVE', 'DECLINE'].includes(decision)) throw Object.assign(new Error('Decision must be APPROVE or DECLINE.'), { status: 400 });
        const savedDecision = decision === 'APPROVE' ? 'OWNER_APPROVED_SETUP_ONLY' : 'OWNER_DECLINED';
        const decidedAt = clock().toISOString();
        store.transaction(() => {
            store.database.prepare(`INSERT INTO connector_permissions (connector_id, decision, decided_at)
                VALUES (?, ?, ?)
                ON CONFLICT(connector_id) DO UPDATE SET decision = excluded.decision, decided_at = excluded.decided_at`)
                .run(connectorId, savedDecision, decidedAt);
            recordEvent(store, 'permission', `Operator ${decision.toLowerCase()}d ${connectorId} setup access request.`, { connectorId, decision: savedDecision }, clock());
        });
        return list().find(connector => connector.id === connectorId);
    }

    return { list, decide };
}