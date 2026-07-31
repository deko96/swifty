import type { IncomingMessage } from 'node:http';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AGENT_PROTOCOL_VERSION, AgentCommands, AgentEvents } from '@swifty/sdk';
import type { WebSocket } from 'ws';
import type { ZodType } from 'zod';
import { EventBusService } from '../events/event-bus.service';
import { AgentRegistry, WS_CLOSE_POLICY_VIOLATION } from './agent.registry';
import { AgentAuthService } from './agent-auth.service';
import {
  helloDataSchema,
  installProgressDataSchema,
  resultDataSchema,
  stateDataSchema,
} from './agent-gateway.schemas';
import { AgentGatewayService } from './agent-gateway.service';
import { ServerStateService } from './server-state.service';

export const AGENT_CHANNEL_PATH = '/agent';

/**
 * The panel end of the agent channel: node daemons dial this gateway and
 * authenticate with their node token at the upgrade. Inbound events update
 * node presence and answer pending commands; everything downstream (module
 * listeners, other services) observes nodes through the event bus and the
 * registry rather than raw sockets.
 */
@WebSocketGateway({ path: AGENT_CHANNEL_PATH })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('agent-gateway');

  constructor(
    private readonly auth: AgentAuthService,
    private readonly registry: AgentRegistry,
    private readonly commands: AgentGatewayService,
    private readonly events: EventBusService,
    private readonly serverState: ServerStateService,
  ) {}

  async handleConnection(client: WebSocket, request: IncomingMessage): Promise<void> {
    const node = await this.auth.authenticate(request.headers.authorization);
    if (!node) {
      client.close(WS_CLOSE_POLICY_VIOLATION, 'invalid node token');
      return;
    }
    this.registry.attach(node.id, client);
    await this.auth.recordSeen(node.id);
    this.events.emit('node.connected', { nodeId: node.id });
    this.logger.log(`node ${node.name} connected`);
    await this.syncNode(node.id);
  }

  private async syncNode(nodeId: string): Promise<void> {
    const desired = await this.serverState.desiredServersFor(nodeId);
    try {
      await this.commands.sendCommand(nodeId, AgentCommands.Sync, { servers: desired });
    } catch (error) {
      this.logger.warn(`sync to node ${nodeId} failed: ${String(error)}`);
    }
  }

  async handleDisconnect(client: WebSocket): Promise<void> {
    const nodeId = this.registry.detach(client);
    if (!nodeId) {
      return;
    }
    this.commands.rejectPendingFor(nodeId);
    this.events.emit('node.disconnected', { nodeId });
    await this.auth.recordSeen(nodeId);
    this.logger.log(`node ${nodeId} disconnected`);
  }

  @SubscribeMessage(AgentEvents.Hello)
  async onHello(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): Promise<void> {
    const received = this.parse(client, AgentEvents.Hello, helloDataSchema, body);
    if (!received) {
      return;
    }
    const { nodeId, data } = received;
    if (data.protocol !== AGENT_PROTOCOL_VERSION) {
      this.logger.warn(
        `node ${nodeId} speaks protocol ${data.protocol}, panel expects ${AGENT_PROTOCOL_VERSION}`,
      );
    }
    await this.auth.recordHello(nodeId, data);
  }

  @SubscribeMessage(AgentEvents.State)
  async onState(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): Promise<void> {
    const received = this.parse(client, AgentEvents.State, stateDataSchema, body);
    if (!received) {
      return;
    }
    await this.serverState.recordState(received.data);
  }

  @SubscribeMessage(AgentEvents.InstallProgress)
  onInstallProgress(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    const received = this.parse(
      client,
      AgentEvents.InstallProgress,
      installProgressDataSchema,
      body,
    );
    if (!received) {
      return;
    }
    this.logger.debug(`install ${received.data.serverId}: ${received.data.line}`);
  }

  @SubscribeMessage(AgentEvents.Result)
  onResult(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    const received = this.parse(client, AgentEvents.Result, resultDataSchema, body);
    if (!received) {
      return;
    }
    if (!this.commands.resolveResult(received.data)) {
      this.logger.warn(`result for unknown command ${received.data.commandId}`);
    }
  }

  private parse<T>(
    client: WebSocket,
    event: string,
    schema: ZodType<T>,
    body: unknown,
  ): { nodeId: string; data: T } | null {
    const nodeId = this.registry.nodeIdFor(client);
    if (!nodeId) {
      client.close(WS_CLOSE_POLICY_VIOLATION, 'not authenticated');
      return null;
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn(`node ${nodeId} sent an invalid ${event} event`);
      return null;
    }
    return { nodeId, data: parsed.data };
  }
}
