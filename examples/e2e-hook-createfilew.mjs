import { spawn } from 'node:child_process';
import readline from 'node:readline';
import process from 'node:process';
import { once } from 'node:events';

const bridge = spawn(process.execPath, ['src/index.mjs'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe']
});

bridge.stderr.on('data', (chunk) => {
  process.stderr.write(`[bridge] ${chunk}`);
});

bridge.on('exit', (code, signal) => {
  process.stderr.write(`[bridge-exit] code=${code} signal=${signal}\n`);
});

const bridgeRl = readline.createInterface({
  input: bridge.stdout,
  crlfDelay: Infinity
});

const pending = new Map();

bridgeRl.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok) {
      resolve(message.result);
    } else {
      reject(new Error(message.error));
    }
    return;
  }

  process.stdout.write(`[event] ${line}\n`);
});

function call(action, params = {}, timeoutMs = 15000) {
  const id = String(Date.now()) + Math.random().toString(16).slice(2);
  const payload = JSON.stringify({ id, action, params });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for action ${action}`));
    }, timeoutMs);

    pending.set(id, {
      resolve(value) {
        clearTimeout(timeout);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timeout);
        reject(error);
      }
    });

    bridge.stdin.write(payload + '\n');
  });
}

async function runPowerShell(command) {
  const child = spawn('powershell', ['-NoProfile', '-Command', command], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const [code] = await once(child, 'close');
  if (code !== 0) {
    throw new Error(`powershell failed: ${stderr || stdout}`);
  }

  return stdout.trim();
}

async function waitForJsonLine(rl) {
  const [line] = await once(rl, 'line');
  return JSON.parse(line);
}

async function main() {
  const samplePath = 'D:\\projects\\REXD\\examples\\sample.txt';
  await runPowerShell(`Set-Content -LiteralPath '${samplePath}' -Value 'rexd demo file'`);

  const target = spawn(process.execPath, ['examples/target-read-file.mjs', samplePath], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  target.stderr.on('data', (chunk) => {
    process.stderr.write(`[target] ${chunk}`);
  });

  const targetRl = readline.createInterface({
    input: target.stdout,
    crlfDelay: Infinity
  });

  const ready = await waitForJsonLine(targetRl);
  console.log('target', JSON.stringify(ready, null, 2));

  const attached = await call('attach', {
    target: ready.pid
  });
  const sessionId = attached.sessionId;
  console.log('attached', JSON.stringify(attached, null, 2));

  const hook = await call('startHook', {
    sessionId,
    target: {
      moduleName: 'KERNELBASE.dll',
      exportName: 'CreateFileW'
    },
    options: {
      captureArgs: 4,
      captureBacktrace: true,
      maxEvents: 50
    }
  });
  console.log('hooked', JSON.stringify(hook, null, 2));

  target.stdin.write('read\n');
  const readResult = await waitForJsonLine(targetRl);
  console.log('target-read', JSON.stringify(readResult, null, 2));

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const events = await call('drainHookEvents', {
    sessionId,
    hookId: hook.hookId,
    limit: 10
  });
  console.log('events', JSON.stringify(events, null, 2));

  await call('removeHook', {
    sessionId,
    hookId: hook.hookId
  });
  await call('detach', { sessionId });

  target.stdin.write('exit\n');
  await once(target, 'exit');

  bridge.kill();
}

main().catch((error) => {
  console.error(error);
  bridge.kill();
  process.exitCode = 1;
});
