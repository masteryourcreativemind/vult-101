// AI NOTE: Stable JSON fingerprints bind approvals and remote operations to exact payload versions.
import { createHash } from 'node:crypto';

export function canonicalJSON(value, depth = 0) {
    if (depth > 16) throw new TypeError('Payload nesting is too deep.');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(item => canonicalJSON(item, depth + 1)).join(',')}]`;
    if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key], depth + 1)}`).join(',')}}`;
    }
    throw new TypeError('Payload must contain only finite JSON values.');
}

export function contentHash(value) {
    const content = canonicalJSON(value);
    if (Buffer.byteLength(content) > 200000) throw new TypeError('Payload is too large.');
    return createHash('sha256').update(content).digest('hex');
}