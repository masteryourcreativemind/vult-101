// AI NOTE: Browser commands require a fresh local-session token; uncertain writes are never auto-retried.
let token;

export async function request(path, body) {
    const response = await fetch(path, body === undefined ? { cache: 'no-store' } : {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vault-Token': token ?? '' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
    return result;
}

export async function connect(onSnapshot, onConnection) {
    async function bootstrap() {
        const response = await request('/api/bootstrap');
        token = response.token;
        onSnapshot(response.state);
    }
    await bootstrap();
    const events = new EventSource('/events');
    events.addEventListener('snapshot', event => {
        try { onSnapshot(JSON.parse(event.data)); } catch { onConnection(false); }
    });
    events.addEventListener('open', () => {
        bootstrap().then(() => onConnection(true)).catch(() => onConnection(false));
    });
    events.addEventListener('error', () => { token = undefined; onConnection(false); });
    return () => events.close();
}
