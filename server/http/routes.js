// AI NOTE: Local HTTP commands expose instructions, operator approval, and suspension only.
import { timingSafeEqual } from 'node:crypto';
import { serveStatic } from './static.js';

export function sendJSON(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
}

async function readJSON(request) {
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw Object.assign(new Error('JSON content type is required.'), { status: 415 });
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 100000) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
        chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('Invalid JSON body.'), { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('JSON object is required.'), { status: 400 });
    return body;
}

export function createRoutes({ snapshot, csrfToken, instructions, approvals, permissions, research, control, gate, hub, notify, instructionSaved, game }) {
    return async function route(request, response) {
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        try {
            const port = request.socket.localPort;
            const host = request.headers.host;
            if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) throw Object.assign(new Error('Local Host header required.'), { status: 403 });
            const origin = `http://${host}`;
            if (request.headers.origin && request.headers.origin !== origin) throw Object.assign(new Error('Cross-origin requests are forbidden.'), { status: 403 });
            if (request.headers['sec-fetch-site'] === 'cross-site') throw Object.assign(new Error('Cross-site requests are forbidden.'), { status: 403 });
            const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
            if (!['GET', 'HEAD', 'POST'].includes(request.method)) throw Object.assign(new Error('Method is not allowed.'), { status: 405 });
            if (request.method === 'POST') {
                const token = request.headers['x-vault-token'];
                if (request.headers.origin !== origin || typeof token !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(csrfToken) || !timingSafeEqual(Buffer.from(token), Buffer.from(csrfToken))) throw Object.assign(new Error('Operator session token is required.'), { status: 403 });
                const body = await readJSON(request);
                const instruction = /^\/api\/instructions\/([a-z]+)$/.exec(pathname);
                if (instruction) {
                    if (Object.keys(body).some(key => !['text', 'revision'].includes(key))) throw Object.assign(new Error('Unexpected instruction fields.'), { status: 400 });
                    const saved = await instructions.write(instruction[1], body.text, body.revision);
                    instructionSaved(saved);
                    notify();
                    return sendJSON(response, 200, saved);
                }
                if (pathname === '/api/control') {
                    if (Object.keys(body).some(key => key !== 'action') || !['stop', 'suspend'].includes(body.action)) throw Object.assign(new Error('Only operator suspension is available before commissioning.'), { status: 409 });
                    if (body.action === 'stop' && control.get().profile !== 'LIVE_TRIAL') throw Object.assign(new Error('Use emergency suspension for a live campaign.'), { status: 409 });
                    if (control.get().state !== 'GOAL_REACHED') control.suspend(body.action === 'stop' ? 'Operator stopped the live trial.' : 'Operator emergency suspension.');
                    gate.abortAll();
                    notify();
                    return sendJSON(response, 200, { campaign: control.get() });
                }
                if (pathname === '/api/research/orders') {
                    if (Object.keys(body).some(key => !['topic', 'question'].includes(key))) throw Object.assign(new Error('Unexpected research order fields.'), { status: 400 });
                    const order = research.createOrder(body);
                    notify();
                    return sendJSON(response, 201, order);
                }
                const permission = /^\/api\/permissions\/([a-z]+)$/.exec(pathname);
                if (permission) {
                    if (Object.keys(body).some(key => key !== 'decision')) throw Object.assign(new Error('Unexpected permission fields.'), { status: 400 });
                    const result = permissions.decide(permission[1], body.decision);
                    notify();
                    return sendJSON(response, 200, result);
                }
                const approval = /^\/api\/approvals\/([a-z0-9-]+)$/.exec(pathname);
                if (approval) {
                    if (Object.keys(body).some(key => key !== 'decision')) throw Object.assign(new Error('Unexpected approval fields.'), { status: 400 });
                    const result = approvals.decide(approval[1], body.decision);
                    notify();
                    return sendJSON(response, 200, result);
                }
                if (pathname === '/api/game') {
                    const allowed = body.action === 'setup' ? ['action', 'commanderModelId', 'workerModelId', 'planId', 'monthlyBudgetCents', 'successRate', 'seed'] : ['action', 'speed'];
                    if (Object.keys(body).some(key => !allowed.includes(key))) throw Object.assign(new Error('Unexpected simulation fields.'), { status: 400 });
                    const { action, ...options } = body;
                    const result = action === 'setup' ? game.setup(options) : game.control(body);
                    notify();
                    return sendJSON(response, 200, result);
                }
                throw Object.assign(new Error('Command is not available.'), { status: 404 });
            }
            if (pathname === '/api/bootstrap') return sendJSON(response, 200, { token: csrfToken, state: snapshot() });
            if (pathname === '/api/state') return sendJSON(response, 200, snapshot());
            if (pathname === '/api/research/orders') return sendJSON(response, 200, research.list());
            if (pathname === '/api/health') return sendJSON(response, 200, { ok: true, state: control.get().state });
            if (pathname === '/events') return hub.subscribe(request, response, snapshot());
            if (pathname === '/api/game/estimate') {
                const query = new URL(request.url, origin).searchParams;
                const successRate = query.has('successRate') ? Number(query.get('successRate')) : undefined;
                return sendJSON(response, 200, game.estimate({ commanderModelId: query.get('commander'), workerModelId: query.get('worker'), planId: query.get('plan'), successRate }));
            }
            const instruction = /^\/api\/instructions\/([a-z]+)$/.exec(pathname);
            if (instruction) return sendJSON(response, 200, await instructions.read(instruction[1]));
            if (await serveStatic(pathname, request, response)) return;
            throw Object.assign(new Error('Not found.'), { status: 404 });
        } catch (error) {
            if (response.headersSent) { response.destroy(); return; }
            const status = error.status ?? (error instanceof URIError ? 400 : 500);
            sendJSON(response, status, { error: status < 500 ? error.message : 'The local operation could not be completed.' });
        }
    };
}
