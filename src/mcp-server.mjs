import process from 'node:process';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SessionRegistry, createDispatcher } from './bridge-core.mjs';

const registry = new SessionRegistry({
  onEvent() {}
});

const dispatch = createDispatcher(registry);

function formatResult(result) {
  const response = {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result)
      }
    ]
  };

  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    response.structuredContent = result;
  }

  return response;
}

function formatError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: 'text',
        text: message
      }
    ],
    structuredContent: {
      error: message
    },
    isError: true
  };
}

function registerActionTool(server, name, description, inputSchema) {
  server.registerTool(
    name,
    {
      description,
      inputSchema
    },
    async (args) => {
      try {
        const result = await dispatch({
          action: name,
          params: args
        });
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );
}

const server = new McpServer({
  name: 'rexd',
  version: '0.1.0'
});

registerActionTool(server, 'ping', 'Return bridge version and active sessions.', {});
registerActionTool(server, 'listSessions', 'List active Frida bridge sessions.', {});
registerActionTool(server, 'attach', 'Attach to a running process by PID or process name.', {
  target: z.union([z.string(), z.number()]).describe('Target PID or process name')
});
registerActionTool(server, 'spawn', 'Spawn a program in suspended state and attach to it.', {
  program: z.string().describe('Absolute path or executable name'),
  args: z.array(z.string()).default([]).describe('Command-line arguments'),
  cwd: z.string().optional().describe('Optional working directory; defaults to the executable folder when program includes a path')
});
registerActionTool(server, 'resume', 'Resume a process previously spawned in suspended state.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID')
});
registerActionTool(server, 'detach', 'Detach from an active session.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID')
});
registerActionTool(server, 'listModules', 'Enumerate loaded modules for a session.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID')
});
registerActionTool(server, 'enumerateRanges', 'Enumerate memory ranges for a session.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  protection: z.string().optional().describe('Protection filter such as rw- or r--'),
  coalesce: z.boolean().optional().describe('Whether to merge adjacent ranges')
});
registerActionTool(server, 'enumerateExports', 'Enumerate exports for a specific module.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  moduleName: z.string().describe('Loaded module name')
});
registerActionTool(server, 'enumerateSymbols', 'Enumerate symbols for a specific module when available.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  moduleName: z.string().describe('Loaded module name')
});
registerActionTool(server, 'readMemory', 'Read raw memory and return it as a hex string.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  address: z.union([z.string(), z.number()]).describe('Target address'),
  size: z.number().int().positive().describe('Number of bytes to read')
});
registerActionTool(server, 'writeMemory', 'Write raw memory using an even-length hex string payload.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  address: z.union([z.string(), z.number()]).describe('Target address'),
  hex: z.string().describe('Even-length hex string without spaces')
});
registerActionTool(server, 'protectMemory', 'Change memory page protection for a region.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  address: z.union([z.string(), z.number()]).describe('Target address'),
  size: z.number().int().positive().describe('Number of bytes to change protection for'),
  protection: z.string().describe('Frida protection string such as rwx, rw-, or r-x')
});
registerActionTool(server, 'readUtf8', 'Read a UTF-8 string from process memory.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  address: z.union([z.string(), z.number()]).describe('Target address'),
  length: z.number().int().positive().optional().describe('Optional maximum string length')
});
registerActionTool(server, 'scanMemory', 'Scan process memory for a Frida hex pattern.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  pattern: z.string().describe('Frida hex pattern'),
  protection: z.string().optional().describe('Protection filter such as rw- or r--'),
  limit: z.number().int().positive().optional().describe('Maximum results to return'),
  options: z.object({
    maxRangeSize: z.number().int().positive().optional(),
    onlyAnonymous: z.boolean().optional()
  }).optional().describe('Optional scan range filters')
});
registerActionTool(server, 'getSymbolDetails', 'Resolve symbol and module details for an address.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  address: z.union([z.string(), z.number()]).describe('Target address')
});
registerActionTool(server, 'resolveTarget', 'Resolve an address from an explicit target spec.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  target: z.object({
    address: z.union([z.string(), z.number()]).optional(),
    moduleName: z.string().optional(),
    exportName: z.string().optional(),
    symbolName: z.string().optional(),
    functionName: z.string().optional()
  }).describe('One of address, moduleName+exportName, moduleName+symbolName, or functionName')
});
registerActionTool(server, 'getBacktrace', 'Capture a backtrace for the current thread inside the target.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  accuracy: z.enum(['accurate', 'fuzzy']).default('accurate').optional().describe('Backtrace mode')
});
registerActionTool(server, 'startHook', 'Install a function hook and buffer call events. Defaults: maxEvents=50, captureArgs=4, captureBacktrace=false.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  target: z.object({
    address: z.union([z.string(), z.number()]).optional(),
    moduleName: z.string().optional(),
    exportName: z.string().optional(),
    symbolName: z.string().optional(),
    functionName: z.string().optional()
  }).describe('Hook target specification'),
  options: z.object({
    maxEvents: z.number().int().positive().optional().describe('Max buffered events (default 50)'),
    captureArgs: z.number().int().min(0).max(16).optional().describe('Number of args to capture (default 4)'),
    captureBacktrace: z.boolean().optional().describe('Capture backtrace per call (default false, expensive)')
  }).optional()
});
registerActionTool(server, 'listHooks', 'List installed hooks for a session.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID')
});
registerActionTool(server, 'removeHook', 'Remove a previously installed hook.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  hookId: z.union([z.string(), z.number()]).describe('Hook ID')
});
registerActionTool(server, 'drainHookEvents', 'Drain buffered hook events from a hook. Defaults to 25 events max. Use summary=true for compact call counts instead of full event objects.', {
  sessionId: z.union([z.string(), z.number()]).describe('Bridge session ID'),
  hookId: z.union([z.string(), z.number()]).describe('Hook ID'),
  limit: z.number().int().positive().optional().describe('Maximum events to drain (default 25)'),
  summary: z.boolean().optional().describe('Return call counts instead of full events')
});

const transport = new StdioServerTransport();

await server.connect(transport);
