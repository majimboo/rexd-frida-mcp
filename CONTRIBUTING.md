# Contributing

## Scope

This project is a small bridge layer between an external agent and Frida. Keep contributions aligned with that boundary:

- stable agent-facing tool contracts
- predictable structured outputs
- Frida-side instrumentation primitives
- documentation and testability

Avoid adding target-specific reversing logic to the core bridge.

## Development

```powershell
npm install
npm run check
```

Run the bridge locally:

```powershell
npm start
```

## Pull requests

- Keep public APIs narrow and typed.
- Preserve backward compatibility for existing actions when practical.
- Return structured errors instead of throwing unbounded raw output at callers.
- Document any new action in [README.md](/D:/projects/REXD/README.md).

## Security-sensitive changes

Changes involving process attachment, memory writes, or event streaming should include:

- clear limits or guardrails
- a note on failure modes
- documentation updates
