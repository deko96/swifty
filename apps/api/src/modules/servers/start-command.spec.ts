import { describe, expect, it } from 'bun:test';
import { renderStartCommand } from './start-command';

const context = {
  server: { ip: '185.94.22.7', port: 27015 },
  env: { MAX_PLAYERS: '20', DEFAULT_MAP: 'de_dust2' },
};

describe('renderStartCommand', () => {
  it('interpolates server and env placeholders into argv', () => {
    const argv = renderStartCommand(
      './hlds_run -game cstrike +ip {{server.ip}} +port {{server.port}} +map {{env.DEFAULT_MAP}} +maxplayers {{env.MAX_PLAYERS}}',
      context,
    );
    expect(argv).toEqual([
      './hlds_run',
      '-game',
      'cstrike',
      '+ip',
      '185.94.22.7',
      '+port',
      '27015',
      '+map',
      'de_dust2',
      '+maxplayers',
      '20',
    ]);
  });

  it('tolerates whitespace inside placeholders and collapses runs of spaces', () => {
    expect(renderStartCommand('./run  +port {{ server.port }}', context)).toEqual([
      './run',
      '+port',
      '27015',
    ]);
  });

  it('keeps quoted arguments as one token', () => {
    expect(renderStartCommand('./run --motd "hello world" --flag \'a b\'', context)).toEqual([
      './run',
      '--motd',
      'hello world',
      '--flag',
      'a b',
    ]);
  });

  it('keeps an interpolated value with spaces inside its quotes as one token', () => {
    const argv = renderStartCommand('./run --name "{{env.NAME}}"', {
      ...context,
      env: { NAME: 'Balkan Wars #1' },
    });
    expect(argv).toEqual(['./run', '--name', 'Balkan Wars #1']);
  });

  it('preserves empty quoted arguments', () => {
    expect(renderStartCommand('./run --token ""', context)).toEqual(['./run', '--token', '']);
  });

  it('rejects unknown variables', () => {
    expect(() => renderStartCommand('./run {{env.MISSING}}', context)).toThrow(
      /unknown variable MISSING/,
    );
  });

  it('rejects unclosed quotes', () => {
    expect(() => renderStartCommand('./run "oops', context)).toThrow(/unclosed quote/);
  });
});
