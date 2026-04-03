# MCP Setup

This project exposes an MCP stdio server from:

`node src/mcp-server.mjs`

## Codex CLI

Verified locally from `codex mcp add --help`, Codex supports adding a stdio MCP server with:

```powershell
codex mcp add rexd -- node D:\projects\REXD\src\mcp-server.mjs
```

Example command file:

- [codex-add.txt](/D:/projects/REXD/examples/codex-add.txt)

You can verify the server after adding it:

```powershell
codex mcp list
codex mcp get rexd
```

## Claude Code

Verified locally from `claude mcp --help` and `claude mcp add-json --help`, Claude Code supports both direct command registration and JSON config.

Direct add:

```powershell
claude mcp add rexd -- node D:\projects\REXD\src\mcp-server.mjs
```

JSON add:

```powershell
claude mcp add-json rexd "{\"type\":\"stdio\",\"command\":\"node\",\"args\":[\"D:\\\\projects\\\\REXD\\\\src\\\\mcp-server.mjs\"],\"env\":{}}"
```

Example files:

- [claude-code-add-json.txt](/D:/projects/REXD/examples/claude-code-add-json.txt)
- [claude-code-mcp.json](/D:/projects/REXD/examples/claude-code-mcp.json)

## Notes

- Replace `D:\projects\REXD` if you move the repository.
- For publishable docs, prefer absolute paths in one-shot examples and explain that users should change them for their own install location.
- If `node` is not in `PATH`, replace it with the full path to your Node executable.

## Example prompt

After registering the server and launching the native demo target, a good test prompt is:

```text
Use the `rexd` MCP server.

Attach to the running `number_target.exe` process.
Find the displayed number in memory and change it to `100`.
Prefer using the PID or memory address shown in the window title if available.
Report the exact MCP tool calls you used and the final value you confirmed.
```
