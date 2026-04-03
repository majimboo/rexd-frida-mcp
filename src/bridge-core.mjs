import frida from 'frida';
import path from 'node:path';
import { agentSource } from './agent-source.mjs';

function normalizeAttachTarget(target) {
  if (typeof target === 'number') {
    return target;
  }

  if (typeof target !== 'string') {
    return target;
  }

  const trimmed = target.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  const pidSuffix = trimmed.match(/\(pid:\s*(\d+)\)\s*$/i);
  if (pidSuffix) {
    return Number.parseInt(pidSuffix[1], 10);
  }

  return trimmed;
}

export class SessionRegistry {
  constructor({ onEvent } = {}) {
    this.nextSessionId = 1;
    this.sessions = new Map();
    this.onEvent = onEvent ?? (() => {});
  }

  list() {
    return Array.from(this.sessions.entries()).map(([sessionId, entry]) => ({
      sessionId,
      pid: entry.pid,
      target: entry.target,
      mode: entry.mode
    }));
  }

  get(sessionId) {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new Error(`unknown session: ${sessionId}`);
    }
    return entry;
  }

  async attach(target) {
    if (target == null || target === '') {
      throw new Error('attach target is required');
    }

    const resolvedTarget = normalizeAttachTarget(target);
    const session = await frida.attach(resolvedTarget);
    const script = await session.createScript(agentSource);
    const sessionId = String(this.nextSessionId++);
    const entry = {
      session,
      script,
      pid: typeof resolvedTarget === 'number' ? resolvedTarget : null,
      target: resolvedTarget,
      mode: 'attach'
    };

    script.message.connect((message, data) => {
      const payload = { event: 'frida-message', sessionId, message };
      if (data) {
        payload.dataLength = data.byteLength ?? data.length ?? null;
      }
      this.onEvent(payload);
    });

    session.detached.connect((reason, crash) => {
      this.sessions.delete(sessionId);
      this.onEvent({
        event: 'session-detached',
        sessionId,
        reason,
        crash: crash ?? null
      });
    });

    await script.load();

    const ping = await script.exports.ping();
    entry.pid = ping.pid;
    this.sessions.set(sessionId, entry);

    return {
      sessionId,
      target: resolvedTarget,
      process: ping
    };
  }

  async spawn(program, args = [], cwd) {
    if (typeof program !== 'string' || program.length === 0) {
      throw new Error('program is required');
    }
    if (!Array.isArray(args)) {
      throw new Error('args must be an array');
    }
    if (cwd !== undefined && (typeof cwd !== 'string' || cwd.length === 0)) {
      throw new Error('cwd must be a non-empty string when provided');
    }

    let resolvedCwd = cwd;
    if (resolvedCwd === undefined) {
      const hasPathSeparator = /[\\/]/.test(program);
      if (hasPathSeparator) {
        const programDir = path.dirname(program);
        if (programDir !== '.' && programDir !== '') {
          resolvedCwd = programDir;
        }
      }
    }

    const spawnOptions = resolvedCwd !== undefined ? { cwd: resolvedCwd } : undefined;
    const pid = await frida.spawn([program, ...args], spawnOptions);
    const result = await this.attach(pid);
    const entry = this.get(result.sessionId);
    entry.mode = 'spawn';
    entry.target = program;

    return {
      ...result,
      pid
    };
  }

  async resume(sessionId) {
    const entry = this.get(sessionId);
    if (!entry.pid) {
      throw new Error('resume requires a numeric pid');
    }

    await frida.resume(entry.pid);
    return {
      sessionId,
      pid: entry.pid,
      resumed: true
    };
  }

  async detach(sessionId) {
    const entry = this.get(sessionId);
    this.sessions.delete(sessionId);
    await entry.script.unload();
    await entry.session.detach();
    return { sessionId, detached: true };
  }
}

export function createDispatcher(registry) {
  return async function dispatch(command) {
    const { action, params = {} } = command;

    switch (action) {
      case 'ping':
        return {
          version: '0.1.0',
          sessions: registry.list()
        };

      case 'attach':
        return registry.attach(params.target);

      case 'spawn':
        return registry.spawn(params.program, params.args, params.cwd);

      case 'resume':
        return registry.resume(String(params.sessionId));

      case 'detach':
        return registry.detach(String(params.sessionId));

      case 'listSessions':
        return registry.list();

      case 'listModules': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.listmodules();
      }

      case 'enumerateExports': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.enumerateexports(params.moduleName);
      }

      case 'enumerateSymbols': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.enumeratesymbols(params.moduleName);
      }

      case 'enumerateRanges': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.enumerateranges(params.protection, params.coalesce);
      }

      case 'readMemory': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.readmemory(params.address, params.size);
      }

      case 'writeMemory': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.writememory(params.address, params.hex);
      }

      case 'protectMemory': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.protectmemory(params.address, params.size, params.protection);
      }

      case 'readUtf8': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.readutf8(params.address, params.length);
      }

      case 'scanMemory': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.scanmemory(params.pattern, params.protection, params.limit, params.options);
      }

      case 'getSymbolDetails': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.getsymboldetails(params.address);
      }

      case 'resolveTarget': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.resolvetarget(params.target);
      }

      case 'getBacktrace': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.getbacktrace(params.accuracy);
      }

      case 'startHook': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.starthook(params.target, params.options);
      }

      case 'listHooks': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.listhooks();
      }

      case 'removeHook': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.removehook(params.hookId);
      }

      case 'drainHookEvents': {
        const entry = registry.get(String(params.sessionId));
        return entry.script.exports.drainhookevents(params.hookId, params.limit);
      }

      default:
        throw new Error(`unsupported action: ${action}`);
    }
  };
}
