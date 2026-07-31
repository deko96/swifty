import { expect, it } from 'bun:test';
import { describeDb, testDatabaseUrl } from '../../testing/harness';
import { REQUIRED_ENCODING, testConnection } from './database-test.service';

describeDb('DatabaseTestService (integration)', () => {
  it('reports version, encoding, and create privilege for a reachable database', async () => {
    const result = await testConnection(testDatabaseUrl as string);

    expect(result.error).toBeNull();
    expect(result.version).toContain('PostgreSQL');
    expect(result.encoding).toBe(REQUIRED_ENCODING);
    expect(typeof result.canCreate).toBe('boolean');
    expect(result.ok).toBe(result.encoding === REQUIRED_ENCODING && result.canCreate === true);
  });

  it('reports a failed dial in the result instead of throwing', async () => {
    const result = await testConnection('postgres://nobody:wrong@127.0.0.1:9/none');

    expect(result.ok).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.version).toBeNull();
    expect(result.encoding).toBeNull();
    expect(result.canCreate).toBeNull();
  });
});
