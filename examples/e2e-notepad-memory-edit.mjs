import { spawn } from 'node:child_process';
import process from 'node:process';
import readline from 'node:readline';
import { once } from 'node:events';

function utf16leHex(text) {
  return Buffer.from(text, 'utf16le').toString('hex');
}

function paddedUtf16leHex(text, targetLength) {
  const padded = text.padEnd(targetLength, ' ');
  return utf16leHex(padded);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const bridge = spawn(process.execPath, ['src/index.mjs'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe']
});

bridge.stderr.on('data', (chunk) => {
  process.stderr.write(`[bridge] ${chunk}`);
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

    bridge.stdin.write(`${JSON.stringify({ id, action, params })}\n`);
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

async function main() {
  const original = 'ORIGINAL MEMORY DEMO';
  const replacement = 'CODEX CHANGED IT NOW';
  const filePath = 'D:\\projects\\REXD\\examples\\notepad-demo.txt';
  const notepadPath = 'C:\\Windows\\System32\\notepad.exe';

  if (original.length !== replacement.length) {
    throw new Error('replacement must match original length for in-place overwrite');
  }

  await runPowerShell(`Set-Content -LiteralPath '${filePath}' -Value '${original}'`);

  const notepad = spawn(notepadPath, [filePath], {
    stdio: 'ignore',
    detached: false
  });

  await delay(1500);

  const attached = await call('attach', { target: notepad.pid });
  const sessionId = attached.sessionId;
  console.log('attached', JSON.stringify(attached, null, 2));

  const scan = await call('scanMemory', {
    sessionId,
    pattern: paddedUtf16leHex(original, original.length),
    protection: 'rw-',
    limit: 20,
    options: {
      onlyAnonymous: true,
      maxRangeSize: 16 * 1024 * 1024
    }
  }, 30000);

  console.log('scan', JSON.stringify(scan, null, 2));

  if (!scan.results || scan.results.length === 0) {
    throw new Error('did not find the original sentence in notepad memory');
  }

  const targetAddress = scan.results[0].address;
  await call('writeMemory', {
    sessionId,
    address: targetAddress,
    hex: paddedUtf16leHex(replacement, original.length)
  });

  const verify = await call('readMemory', {
    sessionId,
    address: targetAddress,
    size: original.length * 2
  });

  console.log('verify', JSON.stringify({
    address: targetAddress,
    expectedHex: paddedUtf16leHex(replacement, original.length),
    actualHex: verify.hex
  }, null, 2));

  console.log(`If Notepad is displaying the same backing buffer, the visible sentence should now read: ${replacement}`);

  await call('detach', { sessionId });
  bridge.kill();
}

main().catch((error) => {
  console.error(error);
  bridge.kill();
  process.exitCode = 1;
});
