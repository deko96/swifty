/**
 * Core panel events observable by modules.
 *
 * Payloads carry stable identifiers rather than full records: modules fetch
 * details through the REST API, which keeps event payloads cheap to emit and
 * safe to evolve.
 */
export interface SwiftyEventMap {
  'server.created': { serverId: string; ownerId: string; nodeId: string; templateId: string };
  'server.installed': { serverId: string };
  'server.started': { serverId: string };
  'server.stopped': { serverId: string; exitCode: number | null; crashed: boolean };
  'server.deleted': { serverId: string };
  'user.created': { userId: string };
  'node.connected': { nodeId: string };
  'node.disconnected': { nodeId: string };
}

export type SwiftyEventName = keyof SwiftyEventMap;

export type EventPayload<E extends SwiftyEventName> = SwiftyEventMap[E];
