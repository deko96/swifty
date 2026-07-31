import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';

/** RFC 6455 close code for connections we refuse to keep. */
export const WS_CLOSE_POLICY_VIOLATION = 1008;

/**
 * Live agent connections, one per node. A node reconnecting replaces (and
 * closes) its previous socket, so a flapping daemon can never hold two.
 */
@Injectable()
export class AgentRegistry {
  private readonly sockets = new Map<string, WebSocket>();
  private readonly nodeIds = new WeakMap<WebSocket, string>();

  attach(nodeId: string, socket: WebSocket): void {
    const previous = this.sockets.get(nodeId);
    if (previous && previous !== socket) {
      previous.close(WS_CLOSE_POLICY_VIOLATION, 'replaced by a newer connection');
    }
    this.sockets.set(nodeId, socket);
    this.nodeIds.set(socket, nodeId);
  }

  /**
   * Forgets the socket and returns its node id, or null when the socket was
   * never attached or has already been replaced by a newer connection.
   */
  detach(socket: WebSocket): string | null {
    const nodeId = this.nodeIds.get(socket);
    if (nodeId === undefined) {
      return null;
    }
    if (this.sockets.get(nodeId) !== socket) {
      return null;
    }
    this.sockets.delete(nodeId);
    return nodeId;
  }

  nodeIdFor(socket: WebSocket): string | null {
    return this.nodeIds.get(socket) ?? null;
  }

  socketFor(nodeId: string): WebSocket | null {
    return this.sockets.get(nodeId) ?? null;
  }

  isOnline(nodeId: string): boolean {
    return this.sockets.has(nodeId);
  }
}
