import type { ValidationDetail } from '@swifty/sdk';
import type { GameTemplate } from '@swifty/templates';

/**
 * Validates one value against a template rule string like `integer|between:2,32`.
 * Numeric rules (between/min/max) compare the number when `integer` is present,
 * the string length otherwise. Returns null when the value passes.
 */
export function validateValue(
  ruleString: string,
  value: string,
): { message: string; rule: string } | null {
  const rules = ruleString
    .split('|')
    .map((rule) => rule.trim())
    .filter(Boolean);
  const numeric = rules.includes('integer');
  const measure = numeric ? Number(value) : value.length;
  const unit = numeric ? '' : ' characters';

  for (const rule of rules) {
    const [name = '', args = ''] = rule.split(':', 2) as [string?, string?];
    switch (name) {
      case 'string':
        break;
      case 'integer':
        if (!/^-?\d+$/.test(value)) {
          return { message: 'Must be a whole number', rule: 'integer' };
        }
        break;
      case 'boolean':
        if (value !== 'true' && value !== 'false') {
          return { message: 'Must be true or false', rule: 'boolean' };
        }
        break;
      case 'url':
        if (!URL.canParse(value)) {
          return { message: 'Must be a valid URL', rule: 'url' };
        }
        break;
      case 'in': {
        const allowed = args.split(',');
        if (!allowed.includes(value)) {
          return { message: `Must be one of: ${allowed.join(', ')}`, rule: 'in' };
        }
        break;
      }
      case 'between': {
        const [min, max] = args.split(',').map(Number);
        if (min === undefined || max === undefined || measure < min || measure > max) {
          return { message: `Must be between ${min} and ${max}${unit}`, rule: 'between' };
        }
        break;
      }
      case 'min':
        if (measure < Number(args)) {
          return { message: `Must be at least ${args}${unit}`, rule: 'min' };
        }
        break;
      case 'max':
        if (measure > Number(args)) {
          return { message: `Must be at most ${args}${unit}`, rule: 'max' };
        }
        break;
      default:
        throw new Error(`Unsupported template rule "${name}" in "${ruleString}"`);
    }
  }
  return null;
}

/**
 * Resolves the full environment of a server from its template: defaults
 * overridden by provided values, every result validated against the
 * variable's rules. Unknown keys and rule violations come back as details
 * ready for a validation.failed error.
 */
export function resolveEnv(
  template: GameTemplate,
  provided: Record<string, string>,
): { env: Record<string, string>; violations: ValidationDetail[] } {
  const known = new Map(template.variables.map((variable) => [variable.name, variable]));
  const violations: ValidationDetail[] = [];

  for (const key of Object.keys(provided)) {
    if (!known.has(key)) {
      violations.push({
        path: `env.${key}`,
        message: `Unknown variable for template ${template.id}`,
        rule: 'unknown_variable',
      });
    }
  }

  const env: Record<string, string> = {};
  for (const variable of template.variables) {
    const value = provided[variable.name] ?? String(variable.default);
    const violation = validateValue(variable.rules, value);
    if (violation) {
      violations.push({ path: `env.${variable.name}`, ...violation });
    } else {
      env[variable.name] = value;
    }
  }

  return { env, violations };
}
