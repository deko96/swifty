import { Inject, Injectable } from '@nestjs/common';
import { type DesiredServer, ServerPowerState, ServerStatus } from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../db/database.module';
import { servers } from '../../db/schema';
import { EventBusService } from '../events/event-bus.service';
import type { StateData } from './agent-gateway.schemas';

/**
 * Persists run-state events from node daemons and translates them into the
 * module event bus vocabulary. Lives in the gateway module so the servers
 * module (which sends commands through the gateway) has no import cycle.
 */
@Injectable()
export class ServerStateService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventBusService,
  ) {}

  async recordState(state: StateData): Promise<void> {
    const [previous] = await this.db
      .select({ powerState: servers.powerState })
      .from(servers)
      .where(eq(servers.id, state.serverId))
      .limit(1);
    if (!previous || previous.powerState === state.state) {
      return;
    }

    await this.db
      .update(servers)
      .set({
        powerState: state.state,
        powerStateChangedAt: new Date(),
        lastExitCode: state.exitCode ?? null,
        updatedAt: new Date(),
      })
      .where(eq(servers.id, state.serverId));

    if (state.state === ServerPowerState.Running) {
      this.events.emit('server.started', { serverId: state.serverId });
    }
    if (state.state === ServerPowerState.Offline || state.state === ServerPowerState.Crashed) {
      this.events.emit('server.stopped', {
        serverId: state.serverId,
        exitCode: state.exitCode ?? null,
        crashed: state.state === ServerPowerState.Crashed,
      });
    }
  }

  /**
   * The desired-state snapshot sent to a node whenever its channel
   * (re)connects, so the daemon reconciles servers it supervised through
   * the outage.
   */
  async desiredServersFor(nodeId: string): Promise<DesiredServer[]> {
    const rows = await this.db
      .select({ id: servers.id, status: servers.status })
      .from(servers)
      .where(eq(servers.nodeId, nodeId));
    return rows.map((row) => ({
      serverId: row.id,
      autostart: false,
      suspended: row.status === ServerStatus.Suspended,
    }));
  }
}
