// AI NOTE: Copilot account setup is opt-in, isolated, and never starts inference or grants task tools.
import { spawn as spawnProcess } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function ensurePrivateDirectory(path) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    const stats = lstatSync(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Copilot data directory must be a real private directory.');
    chmodSync(path, 0o700);
}

export function createCopilotRuntime({
    baseDirectory,
    canSetup = () => false,
    onChange = () => {},
    spawn = spawnProcess,
    clientFactory = async options => {
        const { CopilotClient } = await import('@github/copilot-sdk');
        return new CopilotClient(options);
    },
    pathValue = process.env.PATH ?? '',
    hostEnvironment = process.env,
}) {
    const home = resolve(baseDirectory);
    const ghConfig = join(home, '.config', 'gh');
    const tempDirectory = join(home, 'tmp');
    let child;
    let status = 'NOT_CONNECTED';
    let detail = 'Copilot account setup has not been started.';
    let models = [];

    function runtimeEnvironment() {
        ensurePrivateDirectory(home);
        ensurePrivateDirectory(ghConfig);
        ensurePrivateDirectory(tempDirectory);
        const environment = {
            PATH: pathValue,
            HOME: home,
            COPILOT_HOME: home,
            GH_CONFIG_DIR: ghConfig,
            TMPDIR: tempDirectory,
            COPILOT_GITHUB_TELEMETRY_DISABLED: 'true',
        };
        for (const name of ['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'BROWSER']) {
            if (typeof hostEnvironment[name] === 'string') environment[name] = hostEnvironment[name];
        }
        return environment;
    }

    function currentStatus() {
        return { status, detail, models: models.map(model => ({ ...model })), inferenceReady: false };
    }

    function update(nextStatus, nextDetail) {
        status = nextStatus;
        detail = nextDetail;
        onChange(currentStatus());
    }

    async function assertSetupAllowed() {
        if (!await canSetup()) throw Object.assign(new Error('Approve the Copilot setup request in Commissioning first.'), { status: 403 });
    }

    async function requestLogin() {
        await assertSetupAllowed();
        if (child) throw Object.assign(new Error('Copilot browser sign-in is already in progress.'), { status: 409 });
        const processHandle = spawn('copilot', ['login', '--web-flow'], {
            cwd: home,
            env: runtimeEnvironment(),
            stdio: 'ignore',
            windowsHide: true,
        });
        child = processHandle;
        update('LOGIN_PENDING', 'GitHub Copilot sign-in is open in the browser. Account credentials stay in the isolated Copilot home.');
        processHandle.once('error', () => {
            if (child !== processHandle) return;
            child = undefined;
            update('LOGIN_FAILED', 'Could not start Copilot sign-in. Verify the local Copilot CLI installation.');
        });
        processHandle.once('exit', code => {
            if (child !== processHandle) return;
            child = undefined;
            if (code === 0) update('AUTHENTICATED', 'Copilot CLI sign-in completed in the isolated account directory. Model access is not yet verified.');
            else update('LOGIN_FAILED', 'Copilot sign-in did not complete. Live inference remains disabled.');
        });
        return currentStatus();
    }

    async function listModels() {
        await assertSetupAllowed();
        if (child) throw Object.assign(new Error('Finish browser sign-in before checking model access.'), { status: 409 });
        const client = await clientFactory({
            mode: 'empty',
            baseDirectory: home,
            workingDirectory: home,
            useLoggedInUser: true,
            logLevel: 'error',
            env: runtimeEnvironment(),
        });
        try {
            await client.start();
            const available = await client.listModels();
            models = available.map(model => ({ id: model.id, name: model.name ?? model.id }))
                .filter(model => typeof model.id === 'string' && model.id.length > 0);
            update('MODELS_DISCOVERED', models.length
                ? `${models.length} account-visible models found. No inference was run.`
                : 'No models are available to this account. No inference was run.');
            return currentStatus();
        } catch {
            update('LOGIN_FAILED', 'Could not verify Copilot model access. Check the isolated sign-in and account entitlement.');
            throw Object.assign(new Error('Copilot model discovery failed. No inference was run.'), { status: 503 });
        } finally {
            await client.stop();
        }
    }

    async function close() {
        if (child) {
            child.kill('SIGTERM');
            child = undefined;
        }
    }

    return { close, getStatus: currentStatus, listModels, requestLogin };
}