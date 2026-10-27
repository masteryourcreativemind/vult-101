// AI NOTE: Event streams contain only redacted snapshots and are bounded per local server.
export function createEventHub() {
    const clients = new Set();
    const heartbeat = setInterval(() => {
        for (const client of clients) if (!client.write(': heartbeat\n\n')) client.destroy();
    }, 15000);
    heartbeat.unref();
    return {
        subscribe(request, response, snapshot) {
            if (clients.size >= 16) { response.writeHead(429); response.end(); return; }
            response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
            response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
            clients.add(response);
            response.on('close', () => clients.delete(response));
        },
        broadcast(snapshot) {
            const event = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
            for (const client of clients) if (!client.write(event)) { clients.delete(client); client.destroy(); }
        },
        close() { clearInterval(heartbeat); for (const client of clients) client.end(); clients.clear(); },
    };
}
