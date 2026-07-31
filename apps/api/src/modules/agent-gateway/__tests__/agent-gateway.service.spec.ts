import { describe, expect, it } from 'bun:test';
import { AGENT_PROTOCOL_VERSION, AgentCommands, PowerAction } from '@swifty/sdk';
import type { WebSocket } from 'ws';
import { expectAppError } from '../../../testing/harness';
import { AgentRegistry } from '../agent.registry';
import type { ResultData } from '../agent-gateway.schemas';
import { AgentGatewayService } from '../agent-gateway.service';

const NODE_ID = 'e0d5a6f1-2b3c-4d5e-8f90-1a2b3c4d5e6f';
const SERVER_ID = 'b6f7f0d2-4c1a-4a2e-9b83-2f6e4b8a91c5';

interface SentMessage {
  event: string;
  data: { v: number; id: string; serverId?: string; action?: string };
}

function fakeSocket(sent: SentMessage[]): WebSocket {
  return {
    send: (raw: string) => {
      sent.push(JSON.parse(raw) as SentMessage);
    },
    close: () => {},
  } as unknown as WebSocket;
}

function result(commandId: string, overrides: Partial<ResultData> = {}): ResultData {
  return { v: AGENT_PROTOCOL_VERSION, id: 'reply-id', commandId, ok: true, ...overrides };
}

describe('AgentGatewayService', () => {
  it('rejects with nodes.offline when the node has no connection', async () => {
    const service = new AgentGatewayService(new AgentRegistry());
    await expectAppError(
      service.sendCommand(NODE_ID, AgentCommands.Power, {
        serverId: SERVER_ID,
        action: PowerAction.Stop,
      }),
      'nodes.offline',
    );
  });

  it('sends a versioned envelope and resolves with the correlated result', async () => {
    const registry = new AgentRegistry();
    const sent: SentMessage[] = [];
    registry.attach(NODE_ID, fakeSocket(sent));
    const service = new AgentGatewayService(registry);

    const promise = service.sendCommand(NODE_ID, AgentCommands.Power, {
      serverId: SERVER_ID,
      action: PowerAction.Stop,
    });

    expect(sent).toHaveLength(1);
    const message = sent[0];
    expect(message?.event).toBe(AgentCommands.Power);
    expect(message?.data.v).toBe(AGENT_PROTOCOL_VERSION);
    expect(message?.data.serverId).toBe(SERVER_ID);

    const commandId = message?.data.id ?? '';
    expect(service.resolveResult(result(commandId, { ok: false, error: 'boom' }))).toBe(true);
    const resolved = await promise;
    expect(resolved.ok).toBe(false);
    expect(resolved.error).toBe('boom');
  });

  it('ignores results for unknown commands', () => {
    const service = new AgentGatewayService(new AgentRegistry());
    expect(service.resolveResult(result('never-sent'))).toBe(false);
  });

  it('rejects with nodes.command_timeout when no result arrives', async () => {
    const registry = new AgentRegistry();
    registry.attach(NODE_ID, fakeSocket([]));
    const service = new AgentGatewayService(registry);

    const promise = service.sendCommand(
      NODE_ID,
      AgentCommands.Power,
      { serverId: SERVER_ID, action: PowerAction.Stop },
      10,
    );
    await expectAppError(promise, 'nodes.command_timeout');
  });

  it('rejects pending commands when the node disconnects', async () => {
    const registry = new AgentRegistry();
    registry.attach(NODE_ID, fakeSocket([]));
    const service = new AgentGatewayService(registry);

    const promise = service.sendCommand(NODE_ID, AgentCommands.Power, {
      serverId: SERVER_ID,
      action: PowerAction.Stop,
    });
    service.rejectPendingFor(NODE_ID);
    await expectAppError(promise, 'nodes.offline');
  });
});
