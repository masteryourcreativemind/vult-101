// AI NOTE: Only whitelisted instruction files are user-editable, with atomic writes and conflict checks.
import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { classes } from '../sim/world.js';

export function createInstructions(root) {
    let pending = Promise.resolve();
    const allowed = new Set(classes.map(definition => definition.id));
    const filename = classId => {
        if (!allowed.has(classId)) throw Object.assign(new Error('Unknown instruction class.'), { status: 404 });
        return resolve(root, `${classId}.md`);
    };
    async function read(classId) {
        const text = await readFile(filename(classId), 'utf8');
        return { classId, text, revision: createHash('sha256').update(text).digest('hex') };
    }
    return {
        read,
        write(classId, text, revision) {
            const operation = pending.then(async () => {
                if (typeof text !== 'string' || text.length > 24000 || text.includes('\0')) throw Object.assign(new Error('Instructions must be at most 24,000 characters and contain no null bytes.'), { status: 400 });
                const current = await read(classId);
                if (revision !== current.revision) throw Object.assign(new Error('Instructions changed on disk. Reload before saving.'), { status: 409 });
                const target = filename(classId);
                const temporary = `${target}.${randomUUID()}.tmp`;
                await mkdir(root, { recursive: true });
                try {
                    await writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
                    await rename(temporary, target);
                } finally {
                    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
                }
                return read(classId);
            });
            pending = operation.catch(() => { });
            return operation;
        },
    };
}
