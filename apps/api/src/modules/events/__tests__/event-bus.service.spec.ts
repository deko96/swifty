import { describe, expect, it } from 'bun:test';
import { EventBusService } from '../event-bus.service';

describe('EventBusService', () => {
  it('delivers payloads to subscribers of the emitted event only', () => {
    const bus = new EventBusService();
    const received: string[] = [];
    bus.on('server.created', (payload) => {
      received.push(payload.serverId);
    });
    bus.on('server.deleted', () => {
      received.push('wrong-event');
    });

    bus.emit('server.created', {
      serverId: 's1',
      ownerId: 'u1',
      nodeId: 'n1',
      templateId: 'minecraft-vanilla',
    });

    expect(received).toEqual(['s1']);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBusService();
    let calls = 0;
    const unsubscribe = bus.on('user.created', () => {
      calls++;
    });

    bus.emit('user.created', { userId: 'u1' });
    unsubscribe();
    bus.emit('user.created', { userId: 'u2' });

    expect(calls).toBe(1);
  });

  it('isolates emitters from throwing handlers', () => {
    const bus = new EventBusService();
    const received: string[] = [];
    bus.on('server.started', () => {
      throw new Error('module bug');
    });
    bus.on('server.started', (payload) => {
      received.push(payload.serverId);
    });

    expect(() => bus.emit('server.started', { serverId: 's1' })).not.toThrow();
    expect(received).toEqual(['s1']);
  });

  it('isolates emitters from rejecting async handlers', async () => {
    const bus = new EventBusService();
    bus.on('server.started', () => Promise.reject(new Error('async module bug')));

    expect(() => bus.emit('server.started', { serverId: 's1' })).not.toThrow();
    await Bun.sleep(0);
  });
});
