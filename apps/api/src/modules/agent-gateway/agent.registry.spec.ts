import { describe, expect, it } from 'bun:test';
import type { WebSocket } from 'ws';
import { AgentRegistry } from './agent.registry';

const NODE_ID = 'e0d5a6f1-2b3c-4d5e-8f90-1a2b3c4d5e6f';

function fakeSocket(closed: number[]): WebSocket {
  return {
    close: (code: number) => {
      closed.push(code);
    },
  } as unknown as WebSocket;
}

describe('AgentRegistry', () => {
  it('tracks presence through attach and detach', () => {
    const registry = new AgentRegistry();
    const socket = fakeSocket([]);

    expect(registry.isOnline(NODE_ID)).toBe(false);
    registry.attach(NODE_ID, socket);
    expect(registry.isOnline(NODE_ID)).toBe(true);
    expect(registry.nodeIdFor(socket)).toBe(NODE_ID);
    expect(registry.socketFor(NODE_ID)).toBe(socket);

    expect(registry.detach(socket)).toBe(NODE_ID);
    expect(registry.isOnline(NODE_ID)).toBe(false);
  });

  it('closes the previous socket when a node reconnects', () => {
    const registry = new AgentRegistry();
    const closed: number[] = [];
    const first = fakeSocket(closed);
    const second = fakeSocket([]);

    registry.attach(NODE_ID, first);
    registry.attach(NODE_ID, second);

    expect(closed).toHaveLength(1);
    expect(registry.socketFor(NODE_ID)).toBe(second);
    // the stale socket's close event must not mark the node offline
    expect(registry.detach(first)).toBeNull();
    expect(registry.isOnline(NODE_ID)).toBe(true);
  });

  it('detaching an unknown socket is a no-op', () => {
    const registry = new AgentRegistry();
    expect(registry.detach(fakeSocket([]))).toBeNull();
  });
});
