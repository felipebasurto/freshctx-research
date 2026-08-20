# Security policy

FreshCtx may process proprietary source code, paths, tool outputs, and exact
historical revisions. Treat its storage and adapters as sensitive local
infrastructure.

## Prototype limitations

The core research prototype operates on strings supplied by the caller. The Pi
and Hermes scaffolds include canonical workspace-root and escaping-symlink
checks, but have not received a production security audit. Production adapters
also require permission checks, a secret-retention policy, storage encryption
where required, archive lifecycle controls, and secure deletion.

Do not deploy the prototype as a remote multi-tenant service.

## Reporting

Please report path traversal, unintended data retention, cross-session leakage,
prompt-role confusion, or incorrect region resolution privately to the project
maintainer before public disclosure.
