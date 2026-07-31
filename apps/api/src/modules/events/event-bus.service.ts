import { Injectable, Logger } from '@nestjs/common';
import type { EventPayload, SwiftyEventName } from '@swifty/sdk';

type Handler<E extends SwiftyEventName> = (payload: EventPayload<E>) => void | Promise<void>;

/**
 * In-process typed event bus carrying the SwiftyEventMap contract. Core
 * services emit; modules (and core listeners) subscribe. Handlers can never
 * break an emitter: failures are logged and swallowed, and async handlers are
 * not awaited.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger('events');
  private readonly handlers = new Map<SwiftyEventName, Set<Handler<SwiftyEventName>>>();

  on<E extends SwiftyEventName>(event: E, handler: Handler<E>): () => void {
    const registered = this.handlers.get(event) ?? new Set();
    registered.add(handler as Handler<SwiftyEventName>);
    this.handlers.set(event, registered);
    return () => {
      registered.delete(handler as Handler<SwiftyEventName>);
    };
  }

  emit<E extends SwiftyEventName>(event: E, payload: EventPayload<E>): void {
    for (const handler of this.handlers.get(event) ?? []) {
      try {
        const result = handler(payload);
        if (result instanceof Promise) {
          result.catch((error) => this.logFailure(event, error));
        }
      } catch (error) {
        this.logFailure(event, error);
      }
    }
  }

  private logFailure(event: SwiftyEventName, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`handler for '${event}' failed: ${message}`);
  }
}
