export const agentSource = String.raw`
'use strict';

const hooks = new Map();
let nextHookId = 1;

function normalizeAddress(value) {
  if (typeof value === 'number') {
    return ptr(value);
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('address must be a non-empty string or number');
  }

  return ptr(value);
}

function toHex(bytes) {
  return Array.prototype.map.call(bytes, function (byte) {
    return ('0' + byte.toString(16)).slice(-2);
  }).join('');
}

function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('hex payload must be an even-length string');
  }

  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

function serializeDebugSymbol(address) {
  const symbol = DebugSymbol.fromAddress(address);
  return {
    address: address.toString(),
    name: symbol.name ?? null,
    moduleName: symbol.moduleName ?? null,
    fileName: symbol.fileName ?? null,
    lineNumber: symbol.lineNumber ?? null,
    display: symbol.toString()
  };
}

function serializeBacktrace(frames) {
  return frames.map(function (address) {
    return serializeDebugSymbol(address);
  });
}

function resolveTarget(spec) {
  if (spec == null || typeof spec !== 'object') {
    throw new Error('target spec must be an object');
  }

  if (spec.address != null) {
    const address = normalizeAddress(spec.address);
    return {
      address,
      source: 'address',
      description: address.toString()
    };
  }

  if (typeof spec.moduleName === 'string' && typeof spec.exportName === 'string') {
    const module = Process.getModuleByName(spec.moduleName);
    const address = module.getExportByName(spec.exportName);
    return {
      address,
      source: 'export',
      description: spec.moduleName + '!' + spec.exportName
    };
  }

  if (typeof spec.moduleName === 'string' && typeof spec.symbolName === 'string') {
    const module = Process.getModuleByName(spec.moduleName);
    const address = module.getSymbolByName(spec.symbolName);
    return {
      address,
      source: 'symbol',
      description: spec.moduleName + '!' + spec.symbolName
    };
  }

  if (typeof spec.functionName === 'string') {
    const address = DebugSymbol.getFunctionByName(spec.functionName);
    return {
      address,
      source: 'function',
      description: spec.functionName
    };
  }

  throw new Error('target spec must include address, moduleName+exportName, moduleName+symbolName, or functionName');
}

function pushHookEvent(hook, event) {
  hook.events.push(event);
  if (hook.events.length > hook.maxEvents) {
    hook.events.splice(0, hook.events.length - hook.maxEvents);
  }
}

rpc.exports = {
  ping() {
    return {
      ok: true,
      platform: Process.platform,
      arch: Process.arch,
      pid: Process.id
    };
  },

  listmodules() {
    return Process.enumerateModules().map(function (module) {
      return {
        name: module.name,
        base: module.base.toString(),
        size: module.size,
        path: module.path
      };
    });
  },

  enumerateranges(protection, coalesce) {
    const ranges = Process.enumerateRanges({
      protection: typeof protection === 'string' && protection.length > 0 ? protection : 'rw-',
      coalesce: coalesce !== false
    });

    return ranges.map(function (range) {
      const file = range.file ? {
        path: range.file.path,
        offset: range.file.offset
      } : null;

      return {
        base: range.base.toString(),
        size: range.size,
        protection: range.protection,
        file
      };
    });
  },

  enumerateexports(modulename) {
    if (typeof modulename !== 'string' || modulename.length === 0) {
      throw new Error('moduleName is required');
    }

    return Module.enumerateExports(modulename).map(function (entry) {
      return {
        type: entry.type,
        name: entry.name,
        address: entry.address ? entry.address.toString() : null
      };
    });
  },

  enumeratesymbols(modulename) {
    if (typeof modulename !== 'string' || modulename.length === 0) {
      throw new Error('moduleName is required');
    }

    const module = Process.getModuleByName(modulename);
    if (typeof module.enumerateSymbols !== 'function') {
      throw new Error('symbol enumeration is not supported on this platform/runtime');
    }

    return module.enumerateSymbols().map(function (entry) {
      return {
        isGlobal: entry.isGlobal ?? null,
        name: entry.name,
        section: entry.section?.id ?? null,
        size: entry.size ?? null,
        type: entry.type ?? null,
        address: entry.address ? entry.address.toString() : null
      };
    });
  },

  getsymboldetails(address) {
    const target = normalizeAddress(address);
    const module = Process.findModuleByAddress(target);

    return {
      symbol: serializeDebugSymbol(target),
      module: module === null ? null : {
        name: module.name,
        base: module.base.toString(),
        size: module.size,
        path: module.path
      }
    };
  },

  resolvetarget(spec) {
    const resolved = resolveTarget(spec);
    return {
      address: resolved.address.toString(),
      source: resolved.source,
      description: resolved.description,
      symbol: serializeDebugSymbol(resolved.address)
    };
  },

  readmemory(address, size) {
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error('size must be a positive integer');
    }

    const target = normalizeAddress(address);
    const bytes = Memory.readByteArray(target, size);
    if (bytes === null) {
      throw new Error('Memory.readByteArray returned null');
    }

    return {
      address: target.toString(),
      size: size,
      hex: toHex(new Uint8Array(bytes))
    };
  },

  writememory(address, hex) {
    const target = normalizeAddress(address);
    const bytes = fromHex(hex);

    Memory.writeByteArray(target, bytes);

    return {
      address: target.toString(),
      size: bytes.length
    };
  },

  readutf8(address, length) {
    const target = normalizeAddress(address);
    return {
      address: target.toString(),
      value: length == null ? Memory.readUtf8String(target) : Memory.readUtf8String(target, length)
    };
  },

  scanmemory(pattern, protection, limit, options) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      throw new Error('pattern is required');
    }

    const config = options || {};
    const maxRangeSize = Number.isInteger(config.maxRangeSize) && config.maxRangeSize > 0 ? config.maxRangeSize : null;
    const onlyAnonymous = config.onlyAnonymous === true;

    const ranges = Process.enumerateRanges({
      protection: typeof protection === 'string' && protection.length > 0 ? protection : 'rw-',
      coalesce: true
    }).filter(function (range) {
      if (onlyAnonymous && range.file) {
        return false;
      }

      if (maxRangeSize !== null && range.size > maxRangeSize) {
        return false;
      }

      return true;
    });

    const maxResults = Number.isInteger(limit) && limit > 0 ? limit : 100;
    const results = [];

    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i];
      const matches = Memory.scanSync(range.base, range.size, pattern);

      for (let j = 0; j < matches.length; j += 1) {
        results.push({
          address: matches[j].address.toString(),
          size: matches[j].size,
          protection: range.protection
        });

        if (results.length >= maxResults) {
          return {
            pattern,
            scannedRanges: ranges.length,
            truncated: true,
            results
          };
        }
      }
    }

    return {
      pattern,
      scannedRanges: ranges.length,
      truncated: false,
      results
    };
  },

  getbacktrace(accuracy) {
    const mode = accuracy === 'fuzzy' ? Backtracer.FUZZY : Backtracer.ACCURATE;
    return {
      threadId: Process.getCurrentThreadId(),
      frames: serializeBacktrace(Thread.backtrace(undefined, mode))
    };
  },

  starthook(spec, options) {
    const resolved = resolveTarget(spec);
    const hookId = String(nextHookId++);
    const config = options || {};
    const maxEvents = Number.isInteger(config.maxEvents) && config.maxEvents > 0 ? config.maxEvents : 200;
    const captureArgs = Number.isInteger(config.captureArgs) && config.captureArgs >= 0 ? config.captureArgs : 6;
    const captureBacktrace = config.captureBacktrace !== false;
    const hook = {
      hookId,
      address: resolved.address,
      source: resolved.source,
      description: resolved.description,
      maxEvents,
      events: [],
      listener: null
    };

    hook.listener = Interceptor.attach(resolved.address, {
      onEnter(args) {
        const event = {
          type: 'call',
          hookId: hookId,
          target: resolved.description,
          address: resolved.address.toString(),
          threadId: this.threadId,
          depth: this.depth,
          returnAddress: this.returnAddress.toString(),
          args: []
        };

        for (let i = 0; i < captureArgs; i += 1) {
          event.args.push(args[i].toString());
        }

        if (captureBacktrace) {
          event.backtrace = serializeBacktrace(Thread.backtrace(this.context, Backtracer.ACCURATE));
        }

        this.__rexdEvent = event;
      },

      onLeave(retval) {
        const event = this.__rexdEvent || {
          type: 'call',
          hookId: hookId,
          target: resolved.description,
          address: resolved.address.toString(),
          threadId: this.threadId,
          depth: this.depth,
          returnAddress: this.returnAddress.toString(),
          args: []
        };

        event.retval = retval.toString();
        pushHookEvent(hook, event);
      }
    });

    hooks.set(hookId, hook);

    return {
      hookId: hookId,
      address: resolved.address.toString(),
      source: resolved.source,
      description: resolved.description
    };
  },

  listhooks() {
    return Array.from(hooks.values()).map(function (hook) {
      return {
        hookId: hook.hookId,
        address: hook.address.toString(),
        source: hook.source,
        description: hook.description,
        bufferedEvents: hook.events.length,
        maxEvents: hook.maxEvents
      };
    });
  },

  removehook(hookid) {
    const hook = hooks.get(String(hookid));
    if (hook == null) {
      throw new Error('unknown hook: ' + hookid);
    }

    hook.listener.detach();
    hooks.delete(String(hookid));

    return {
      hookId: String(hookid),
      removed: true
    };
  },

  drainhookevents(hookid, limit) {
    const hook = hooks.get(String(hookid));
    if (hook == null) {
      throw new Error('unknown hook: ' + hookid);
    }

    const count = Number.isInteger(limit) && limit > 0 ? limit : hook.events.length;
    const events = hook.events.splice(0, count);

    return {
      hookId: String(hookid),
      drained: events.length,
      remaining: hook.events.length,
      events: events
    };
  }
};
`;
