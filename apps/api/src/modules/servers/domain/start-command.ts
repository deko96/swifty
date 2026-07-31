import { AppException } from '../../../common/app.exception';

export interface StartContext {
  server: { ip: string; port: number };
  env: Record<string, string>;
}

const PLACEHOLDER = /\{\{\s*(server\.ip|server\.port|env\.([A-Z][A-Z0-9_]*))\s*\}\}/g;

/**
 * Renders a template's start command into the argv the daemon executes:
 * `{{server.*}}`/`{{env.*}}` placeholders are interpolated, then the string
 * is tokenized shell-style (single and double quotes group words, nothing
 * else is special — the daemon runs argv directly, there is no shell).
 */
export function renderStartCommand(command: string, context: StartContext): string[] {
  const rendered = command.replace(PLACEHOLDER, (_, key: string, envName?: string) => {
    if (key === 'server.ip') {
      return context.server.ip;
    }
    if (key === 'server.port') {
      return String(context.server.port);
    }
    const value = context.env[envName ?? ''];
    if (value === undefined) {
      throw new AppException(
        500,
        'common.internal',
        `Template start command references unknown variable ${envName}`,
      );
    }
    return value;
  });
  return tokenize(rendered);
}

function tokenize(command: string): string[] {
  const argv: string[] = [];
  let current = '';
  let started = false;
  let quote: '"' | "'" | null = null;
  for (const char of command) {
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        argv.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }
  if (quote) {
    throw new AppException(500, 'common.internal', 'Template start command has an unclosed quote');
  }
  if (started) {
    argv.push(current);
  }
  return argv;
}
