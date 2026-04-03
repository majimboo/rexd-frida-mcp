# REXD Frida Bridge

Minimal Frida bridge for an external agent-driven reverse-engineering workflow:

`agent -> bridge -> Frida -> target process`

This repository is intended to be a small, inspectable foundation for building an agent-controlled RE backend. The current version is an MVP scaffold, not a full debugger platform.

## Current shape

- Node.js host process
- line-delimited JSON protocol over stdin/stdout
- injected Frida agent with a small RPC surface
- MCP stdio server that exposes the same operations as tools
- higher-value RE helpers for hooks, buffered call events, symbol lookup, and backtraces

## Goals

- keep the external protocol stable and machine-friendly
- expose small typed operations instead of arbitrary script execution
- make it easy to evolve into MCP or another tool-host format

## Non-goals for the current version

- full debugger parity with CE/x64dbg/WinDbg
- arbitrary Frida script execution as the default API
- target-specific logic in the core bridge

## Install

```powershell
npm install
```

Build the native Windows demo target:

```powershell
cd targets\number_target
cargo build --release
cd ..\..
```

Register the MCP server with Codex:

```powershell
codex mcp add rexd -- node D:\projects\REXD\src\mcp-server.mjs
```

Register the MCP server with Claude Code:

```powershell
claude mcp add rexd -- node D:\projects\REXD\src\mcp-server.mjs
```

If `node` is not on `PATH`, use the full executable path instead:

```powershell
codex mcp add rexd -- "C:\Program Files\nodejs\node.exe" D:\projects\REXD\src\mcp-server.mjs
```

## Uninstall

Remove the MCP server from Codex:

```powershell
codex mcp remove rexd
```

Remove the MCP server from Claude Code:

```powershell
claude mcp remove rexd
```

Remove local dependencies if you want to clean the checkout:

```powershell
Remove-Item -Recurse -Force node_modules
```

Remove Rust build output for the native demo target:

```powershell
Remove-Item -Recurse -Force targets\number_target\target
```

## Run

```powershell
npm start
```

Run as an MCP server:

```powershell
npm run start:mcp
```

MCP client setup examples are in [MCP_SETUP.md](/D:/projects/REXD/docs/MCP_SETUP.md).

The bridge reads one JSON command per line from `stdin` and writes one JSON response per line to `stdout`.

## Example response

```json
{"id":"1","ok":true,"result":{"version":"0.1.0","sessions":[]}}
```

## Example commands

Ping:

```json
{"id":"1","action":"ping"}
```

Attach to a running process by PID or name:

```json
{"id":"2","action":"attach","params":{"target":"notepad.exe"}}
```

List modules:

```json
{"id":"3","action":"listModules","params":{"sessionId":"1"}}
```

Read memory:

```json
{"id":"4","action":"readMemory","params":{"sessionId":"1","address":"0x7ff600001000","size":32}}
```

Write memory:

```json
{"id":"5","action":"writeMemory","params":{"sessionId":"1","address":"0x7ff600001000","hex":"9090"}}
```

Spawn a process suspended, then resume it:

```json
{"id":"6","action":"spawn","params":{"program":"C:\\Windows\\System32\\notepad.exe","args":[]}}
{"id":"7","action":"resume","params":{"sessionId":"2"}}
```

## Supported actions

- `ping`
- `attach`
- `spawn`
- `resume`
- `detach`
- `listSessions`
- `listModules`
- `enumerateRanges`
- `enumerateExports`
- `enumerateSymbols`
- `readMemory`
- `writeMemory`
- `readUtf8`
- `scanMemory`
- `getSymbolDetails`
- `resolveTarget`
- `getBacktrace`
- `startHook`
- `listHooks`
- `removeHook`
- `drainHookEvents`

## MCP tools

- `ping`
- `listSessions`
- `attach`
- `spawn`
- `resume`
- `detach`
- `listModules`
- `enumerateRanges`
- `enumerateExports`
- `enumerateSymbols`
- `readMemory`
- `writeMemory`
- `readUtf8`
- `scanMemory`
- `getSymbolDetails`
- `resolveTarget`
- `getBacktrace`
- `startHook`
- `listHooks`
- `removeHook`
- `drainHookEvents`

## Hook workflow example

Resolve and hook `CreateFileW` in `kernel32.dll`:

```json
{"id":"10","action":"startHook","params":{"sessionId":"1","target":{"moduleName":"kernel32.dll","exportName":"CreateFileW"},"options":{"captureArgs":4,"captureBacktrace":true,"maxEvents":100}}}
```

Drain captured events:

```json
{"id":"11","action":"drainHookEvents","params":{"sessionId":"1","hookId":"1","limit":10}}
```

Resolve symbol details for an address:

```json
{"id":"12","action":"getSymbolDetails","params":{"sessionId":"1","address":"0x7ff600001000"}}
```

## Development checks

```powershell
npm run check
```

## End-to-end example

Run the included Windows demo:

```powershell
npm run example:e2e
```

What it does:

- launches a small local Node target process
- attaches to that target by PID
- installs a hook on `KERNELBASE!CreateFileW`
- tells the target to read a local sample file
- drains buffered hook events from the bridge

The example client is [e2e-hook-createfilew.mjs](/D:/projects/REXD/examples/e2e-hook-createfilew.mjs).

## Native demo target

The repo also includes a native Windows UI test target in [targets/number_target](/D:/projects/REXD/targets/number_target).

What it does:

- opens a Win32 window
- shows a live integer value in the UI
- includes the PID and the integer address in the window title
- updates immediately when the value changes in memory

This is intended as a simple visible target for testing `attach`, `readMemory`, `writeMemory`, and memory scanning workflows.

Example prompt for Codex or Claude:

```text
Use the `rexd` MCP server.

Attach to the running `number_target.exe` process.
Find the displayed number in memory and change it to `100`.
Prefer using the PID or memory address shown in the window title if available.
Report the exact MCP tool calls you used and the final value you confirmed.
```

## Public release notes

- The project currently targets local Windows-oriented workflows, but the Frida layer is not Windows-exclusive.
- The protocol is intentionally simple so it can later be wrapped by MCP or another agent-facing transport.
- Public examples should avoid attaching to software you are not authorized to inspect.
- MCP setup examples for Codex and Claude Code are included in [MCP_SETUP.md](/D:/projects/REXD/docs/MCP_SETUP.md).

## Notes

- `spawn` keeps the process suspended until `resume` is called.
- `writeMemory` expects an even-length hex string without spaces.
- The raw JSON bridge remains available for debugging and direct automation.
- The MCP server is the intended public integration surface for agent tooling.
