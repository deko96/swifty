# @swifty/templates

Official game templates for Swifty, plus the schema they must satisfy.

A template is a single YAML file in [`games/`](games) describing how to
install, start, stop, configure, and query one game — no code. The panel
renders template `variables` as forms; the daemon executes `install.script`
and `start.command` as the server's unprivileged Unix user.

## Adding a game

1. Create `games/<kebab-case-id>.yaml` (see
   [`counter-strike-16.yaml`](games/counter-strike-16.yaml) for a complete example).
2. Validate it: `bun run test`
3. Open a pull request.

The schema lives in [`src/schema.ts`](src/schema.ts) and is exported as
`GameTemplateSchema` for use by the panel and tooling.
