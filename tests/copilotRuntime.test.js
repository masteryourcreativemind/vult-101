// AI NOTE: Copilot adapter tests stub process/client boundaries; they never authenticate or run inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCopilotRuntime } from '../server/integrations/copilot/runtime.js';

test('Copilot login requires setup approval and uses a sanitized isolated browser flow', async context => {
    const directory = await mkdtemp(join(tmpdir(), 'vult-copilot-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    let setupAllowed = false;
    let spawned;
    const runtime = createCopilotRuntime({
        baseDirectory: join(directory, 'private', 'copilot'),
        canSetup: () => setupAllowed,
        pathValue: '/usr/bin',
        hostEnvironment: { DISPLAY: ':1', XDG_RUNTIME_DIR: '/tmp/runtime', GH_TOKEN: 'never-copy-this' },
        spawn(command, args, options) {
            spawned = { command, args, options, child: new EventEmitter() };
            spawned.child.kill = () => true;
            return spawned.child;
        },
    });

    await assert.rejects(runtime.requestLogin(), /Approve the Copilot setup request/);
    assert.equal(spawned, undefined);
    setupAllowed = true;
    assert.equal((await runtime.requestLogin()).status, 'LOGIN_PENDING');
    assert.equal(spawned.command, 'copilot');
    assert.deepEqual(spawned.args, ['login', '--web-flow']);
    assert.equal(spawned.options.env.HOME, join(directory, 'private', 'copilot'));
    assert.equal(spawned.options.env.COPILOT_HOME, join(directory, 'private', 'copilot'));
    assert.equal(spawned.options.env.GH_CONFIG_DIR, join(directory, 'private', 'copilot', '.config', 'gh'));
    assert.equal(spawned.options.env.GH_TOKEN, undefined);
    assert.equal(spawned.options.env.GITHUB_TOKEN, undefined);
    assert.equal(spawned.options.env.COPILOT_GITHUB_TOKEN, undefined);
    assert.equal(spawned.options.env.DISPLAY, ':1');
    assert.equal(spawned.options.env.XDG_RUNTIME_DIR, '/tmp/runtime');
    assert.equal(spawned.options.env.GH_TOKEN, undefined);
    assert.equal((await stat(join(directory, 'private', 'copilot'))).mode & 0o777, 0o700);
    spawned.child.emit('exit', 0);
    assert.equal(runtime.getStatus().status, 'AUTHENTICATED');
});

test('model discovery uses the isolated empty-mode client and never creates an inference session', async context => {
    const directory = await mkdtemp(join(tmpdir(), 'vult-copilot-models-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const calls = [];
    const runtime = createCopilotRuntime({
        baseDirectory: join(directory, 'private', 'copilot'),
        canSetup: () => true,
        pathValue: '/usr/bin',
        async clientFactory(options) {
            calls.push(['create', options]);
            return {
                async start() { calls.push(['start']); },
                async listModels() { calls.push(['listModels']); return [{ id: 'gpt-test', name: 'Test Model' }]; },
                async stop() { calls.push(['stop']); },
                async createSession() { throw new Error('Inference sessions must not be created during discovery.'); },
            };
        },
    });

    const result = await runtime.listModels();
    assert.equal(result.status, 'MODELS_DISCOVERED');
    assert.deepEqual(result.models, [{ id: 'gpt-test', name: 'Test Model' }]);
    assert.equal(result.inferenceReady, false);
    assert.equal(calls[0][1].mode, 'empty');
    assert.equal(calls[0][1].useLoggedInUser, true);
    assert.equal(calls[0][1].env.GITHUB_TOKEN, undefined);
    assert.deepEqual(calls.map(call => call[0]), ['create', 'start', 'listModels', 'stop']);
});