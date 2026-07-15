# Viewpress CLI standing builder

Work only in `/Users/mike/Code/viewpress-cli`. Inspect `/Users/mike/Code/viewpress` read-only as the product and API source of truth.

Build the complete production CLI requested by the user:

- TypeScript source compiled to standalone cross-platform binaries with Bun.
- Ergonomic explicit commands for the full supported Viewpress public surface.
- Real browser-login client flow using one-time sessions without putting tokens in URLs.
- Secure local config and environment overrides.
- Stable JSON and human output.
- Strict stdout, stderr, and exit-code behavior.
- Noninteractive agent mode.
- Async status, wait, and download patterns where the product supports them.
- Complete API documentation, README, and distribution/release setup.

Use npm and `package-lock.json` for dependency management while using Bun as compiler and test runner unless the repo documents another settled choice.

Before interpreting any Convex surface, read:

- `/Users/mike/Code/viewpress/AGENTS.md`
- `/Users/mike/Code/viewpress/CLAUDE.md`
- `/Users/mike/Code/viewpress/convex/_generated/ai/guidelines.md`

Do not edit the Viewpress app. Do not make live API calls or access a database. Tests use mocked local fetch or server behavior and isolated temporary config.

Keep strict TypeScript, one exported function per file where practical, plain names, short functions, no narration comments, and no speculative abstractions.

Run local typecheck, lint, unit, integration, docs, and binary smoke gates.

Make atomic conventional lowercase commits using the configured git identity, with commit bodies stating the design reason. Do not add AI attribution. Never push. Commit coherent territories separately:

1. Bootstrap and build.
2. Config and auth.
3. Each resource command family.
4. Output and error contract.
5. Unit and integration tests.
6. API docs and distribution.
7. One isolated commit per review finding type.

Before inventing any command or endpoint, derive it from current Viewpress evidence and document unsupported server requirements clearly.

Work autonomously until a complete first implementation is committed and all local gates pass. Then print exactly `DONE ROUND 0` followed by commit hashes, gate results, and any server contract that the CLI needs but the current app does not expose.
