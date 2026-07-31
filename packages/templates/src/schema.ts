import { z } from 'zod';

/**
 * Schema for a Swifty game template.
 *
 * Templates are pure data: the daemon executes `install`/`start` generically
 * and the panel renders `variables` as user-facing forms. Adding a game to
 * Swifty means adding a YAML file that satisfies this schema — no code.
 */
export const GameTemplateSchema = z.object({
  /** Stable kebab-case identifier, e.g. `counter-strike-16`. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  supports: z.array(z.enum(['linux'])).nonempty(),
  install: z.object({
    /** Shell script executed as the server's unprivileged user. */
    script: z.string().min(1),
  }),
  start: z.object({
    /** Start command; `{{server.*}}` and `{{env.*}}` placeholders are interpolated. */
    command: z.string().min(1),
    /** Console command for graceful stop; SIGTERM then SIGKILL as fallback. */
    stop: z.string().optional(),
    /** Regex matched against console output to detect a fully started server. */
    ready_regex: z.string().optional(),
  }),
  variables: z
    .array(
      z.object({
        /** UPPER_SNAKE_CASE name exposed as `{{env.NAME}}`. */
        name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
        description: z.string().optional(),
        default: z.union([z.string(), z.number(), z.boolean()]),
        /** Laravel-style validation rules, e.g. `integer|between:2,32`. */
        rules: z.string(),
        user_editable: z.boolean().default(false),
      }),
    )
    .default([]),
  config_files: z
    .array(
      z.object({
        /** Path relative to the server root. */
        path: z.string().min(1),
        parser: z.enum(['keyvalue', 'ini', 'yaml', 'json', 'properties']),
      }),
    )
    .default([]),
  query: z
    .object({
      protocol: z.enum(['a2s', 'minecraft', 'samp', 'fivem', 'none']),
    })
    .default({ protocol: 'none' }),
});

export type GameTemplate = z.infer<typeof GameTemplateSchema>;
