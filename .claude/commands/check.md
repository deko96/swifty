---
description: Run the full quality gate and fix any failures until green
---

Run the repository quality gate with `bun run check`.

If everything passes, report that and stop.

If anything fails:

1. Read the failure output and fix the root cause — do not suppress rules,
   skip tests, or loosen configs to get to green.
2. Follow the conventions in CLAUDE.md (self-descriptive code, no narration
   comments, value imports for NestJS injection tokens).
3. Re-run `bun run check` and repeat until every gate passes.
4. Summarize what was broken and what you changed.

Only commit the fixes if this command was invoked with the argument `commit`
(invocation: `$ARGUMENTS`); use a Conventional Commit message scoped to the
affected workspace.
