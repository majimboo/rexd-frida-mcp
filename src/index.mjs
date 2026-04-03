import readline from 'node:readline';
import process from 'node:process';
import { SessionRegistry, createDispatcher } from './bridge-core.mjs';

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeError(id, error) {
  writeMessage({
    id: id ?? null,
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  });
}

const registry = new SessionRegistry({ onEvent: writeMessage });
const dispatch = createDispatcher(registry);

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return;
  }

  let command;
  try {
    command = JSON.parse(trimmed);
  } catch (error) {
    writeError(null, `invalid json: ${error.message}`);
    return;
  }

  try {
    const result = await dispatch(command);
    writeMessage({
      id: command.id ?? null,
      ok: true,
      result
    });
  } catch (error) {
    writeError(command.id, error);
  }
});

rl.on('close', async () => {
  const sessions = registry.list();
  for (const sessionInfo of sessions) {
    try {
      await registry.detach(sessionInfo.sessionId);
    } catch {}
  }
});
