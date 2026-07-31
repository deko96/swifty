import { describe, expect, it } from 'bun:test';
import commandInstall from '../fixtures/agent/command.install.json';
import commandPower from '../fixtures/agent/command.power.json';
import commandSync from '../fixtures/agent/command.sync.json';
import eventHello from '../fixtures/agent/event.hello.json';
import eventInstallProgress from '../fixtures/agent/event.install.progress.json';
import eventResult from '../fixtures/agent/event.result.json';
import eventState from '../fixtures/agent/event.state.json';
import { AGENT_PROTOCOL_VERSION, type AgentCommand, type AgentEvent, PortProtocol } from './agent';
import { PowerAction, ServerPowerState } from './enums';

// Each fixture is rebuilt here as a typed literal and compared for deep
// equality: the compiler proves the literal matches the protocol types, the
// equality proves the fixture matches the literal. The Go daemon round-trips
// the same fixtures, so a drift on either side fails a test.
describe('agent protocol fixtures', () => {
  it('power command', () => {
    const message: AgentCommand<'power'> = {
      event: 'power',
      data: {
        v: AGENT_PROTOCOL_VERSION,
        id: '018f2c3a-9d41-7c22-b7e4-52a09a1de3fd',
        serverId: 'b6f7f0d2-4c1a-4a2e-9b83-2f6e4b8a91c5',
        action: PowerAction.Start,
        command: ['./cs2', '-dedicated', '-port', '27015'],
        env: { MAX_PLAYERS: '20', TICKRATE: '128' },
        limits: { cpuPercent: 200, memoryMiB: 4096, diskMiB: 40960, pids: 256 },
      },
    };
    expect(commandPower as unknown).toEqual(message);
  });

  it('install command', () => {
    const message: AgentCommand<'install'> = {
      event: 'install',
      data: {
        v: AGENT_PROTOCOL_VERSION,
        id: '018f2c3a-a552-7d10-8a91-73b2c4d5e6f7',
        serverId: 'b6f7f0d2-4c1a-4a2e-9b83-2f6e4b8a91c5',
        script:
          'steamcmd +force_install_dir /server +login anonymous +app_update 730 validate +quit',
        env: { STEAM_APP_ID: '730' },
      },
    };
    expect(commandInstall as unknown).toEqual(message);
  });

  it('sync command', () => {
    const message: AgentCommand<'sync'> = {
      event: 'sync',
      data: {
        v: AGENT_PROTOCOL_VERSION,
        id: '018f2c3a-b663-7e01-9b02-84c3d5e6f708',
        servers: [
          {
            serverId: 'b6f7f0d2-4c1a-4a2e-9b83-2f6e4b8a91c5',
            autostart: true,
            suspended: false,
          },
          {
            serverId: 'c7a801e3-5d2b-4b3f-8c94-3a7f5c9b02d6',
            autostart: false,
            suspended: true,
          },
        ],
      },
    };
    expect(commandSync as unknown).toEqual(message);
  });

  it('hello event', () => {
    const message: AgentEvent<'hello'> = {
      event: 'hello',
      data: {
        v: AGENT_PROTOCOL_VERSION,
        id: '018f2c3a-c774-7f12-ac13-95d4e6f70819',
        protocol: AGENT_PROTOCOL_VERSION,
        daemonVersion: '0.9.4',
        inventory: {
          hostname: 'rs-beg-02',
          os: 'linux',
          arch: 'amd64',
          cpuModel: 'AMD Ryzen 7 5800X 8-Core Processor',
          cpuCores: 16,
          memoryMiB: 65536,
          diskMiB: 1907200,
        },
        ports: [
          { protocol: PortProtocol.Udp, port: 27015, open: true },
          { protocol: PortProtocol.Udp, port: 7777, open: true },
          { protocol: PortProtocol.Tcp, port: 2022, open: false },
        ],
      },
    };
    expect(eventHello as unknown).toEqual(message);
  });

  it('state event', () => {
    const message: AgentEvent<'state'> = {
      event: 'state',
      data: {
        v: AGENT_PROTOCOL_VERSION,
        id: '018f2c3a-d885-7023-bd24-a6e5f7081920',
        serverId: 'b6f7f0d2-4c1a-4a2e-9b83-2f6e4b8a91c5',
        state: ServerPowerState.Crashed,
        exitCode: 139,
      },
    };
    expect(eventState as unknown).toEqual(message);
  });

  it('install.progress event', () => {
    const message: AgentEvent<'install.progress'> = {
      event: 'install.progress',
      data: {
        v: AGENT_PROTOCOL_VERSION,
        id: '018f2c3a-e996-7134-ce35-b7f608192a31',
        serverId: 'b6f7f0d2-4c1a-4a2e-9b83-2f6e4b8a91c5',
        line: 'Update state (0x61) downloading, progress: 68.02 (9157 MiB / 13462 MiB)',
      },
    };
    expect(eventInstallProgress as unknown).toEqual(message);
  });

  it('result event', () => {
    const message: AgentEvent<'result'> = {
      event: 'result',
      data: {
        v: AGENT_PROTOCOL_VERSION,
        id: '018f2c3a-faa7-7245-df46-c80719203b42',
        commandId: '018f2c3a-a552-7d10-8a91-73b2c4d5e6f7',
        ok: false,
        error: 'install script exited with status 8',
        output: 'steamcmd: Update state (0x602) error 0x602 after 12s',
      },
    };
    expect(eventResult as unknown).toEqual(message);
  });
});
