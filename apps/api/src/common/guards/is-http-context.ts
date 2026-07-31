import type { ExecutionContext } from '@nestjs/common';

/**
 * Global guards protect HTTP routes; other transports (the agent WebSocket
 * gateway) authenticate at connection time, so guards wave them through.
 */
export function isHttpContext(context: ExecutionContext): boolean {
  return context.getType() === 'http';
}
