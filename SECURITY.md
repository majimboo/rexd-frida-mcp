# Security Policy

## Supported versions

This project is currently pre-1.0. Report issues against the latest `main` branch state.

## Reporting

If you discover a security issue in the bridge itself, report it privately before public disclosure.

At minimum include:

- affected version or commit
- host OS
- reproduction steps
- impact description

## Operational guidance

This bridge can attach to processes and modify process memory. Use it only on software you are authorized to inspect or modify.

Recommended defaults for deployments:

- prefer read-only workflows first
- gate memory writes behind explicit caller intent
- keep logs free of secrets and raw dumps unless needed
