import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AGENT_PROTOCOL_VERSION, type AgentCommandMap, type AgentCommandName } from '@swifty/sdk';
import { AppException } from '../../common/app.exception';
import type { ResultData } from './agent-gateway.schemas';
import { AgentRegistry } from './agent-registry';

const COMMAND_TIMEOUT_MS = 10_000;

interface PendingCommand {
  nodeId: string;
  resolve: (result: ResultData) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Sends commands to node agents and correlates the result events they answer
 * with. The returned promise resolves with the daemon's result — including
 * failed ones (`ok: false`); callers decide what a failure means. It rejects
 * only when the node is offline, disconnects mid-command, or times out.
 */
@Injectable()
export class AgentGatewayService {
  private readonly pending = new Map<string, PendingCommand>();

  constructor(private readonly registry: AgentRegistry) {}

  async sendCommand<E extends AgentCommandName>(
    nodeId: string,
    event: E,
    payload: AgentCommandMap[E],
    timeoutMs = COMMAND_TIMEOUT_MS,
  ): Promise<ResultData> {
    const socket = this.registry.socketFor(nodeId);
    if (!socket) {
      throw new AppException(503, 'nodes.offline', 'The node agent is not connected');
    }
    const id = randomUUID();
    socket.send(JSON.stringify({ event, data: { v: AGENT_PROTOCOL_VERSION, id, ...payload } }));

    return new Promise<ResultData>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new AppException(504, 'nodes.command_timeout', 'The node agent did not answer in time'),
        );
      }, timeoutMs);
      this.pending.set(id, { nodeId, resolve, reject, timer });
    });
  }

  /** Returns false for results answering nothing we sent (or sent too long ago). */
  resolveResult(result: ResultData): boolean {
    const pending = this.pending.get(result.commandId);
    if (!pending) {
      return false;
    }
    this.pending.delete(result.commandId);
    clearTimeout(pending.timer);
    pending.resolve(result);
    return true;
  }

  /** Rejects every command still waiting on a node that just disconnected. */
  rejectPendingFor(nodeId: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.nodeId !== nodeId) {
        continue;
      }
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(
        new AppException(503, 'nodes.offline', 'The node agent disconnected mid-command'),
      );
    }
  }
}
