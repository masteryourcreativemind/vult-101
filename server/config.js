// AI NOTE: Configuration stays server-side; no environment object may enter a browser snapshot.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function loadConfig(environment = process.env) {
    const port = Number(environment.PORT ?? 4310);
    if (!Number.isInteger(port) || port < 1024 || port > 65525) throw new Error('PORT must be an integer between 1024 and 65525.');
    const profile = environment.CAMPAIGN_PROFILE ?? 'LIVE_TRIAL';
    if (!['LIVE_TRIAL', 'LIVE_CAMPAIGN'].includes(profile)) throw new Error('Invalid campaign profile.');
    return Object.freeze({
        host: '127.0.0.1', port, profile,
        databasePath: resolve(projectRoot, environment.DATABASE_PATH ?? 'data/vault.sqlite'),
        instructionsRoot: resolve(projectRoot, 'config/instructions'),
    });
}
