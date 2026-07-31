import { describe, expect, it } from 'bun:test';
import { createNodeSchema, updateNodeSchema } from '../nodes.schemas';

describe('createNodeSchema', () => {
  it('applies defaults for daemonPort and public', () => {
    const parsed = createNodeSchema.parse({
      name: 'n1',
      fqdn: 'n1.example.com',
      memoryMb: 1024,
      diskMb: 10240,
    });
    expect(parsed.daemonPort).toBe(8443);
    expect(parsed.public).toBe(true);
  });
});

describe('updateNodeSchema', () => {
  it('leaves omitted fields absent instead of applying defaults', () => {
    expect(updateNodeSchema.parse({})).toEqual({});
    expect(updateNodeSchema.parse({ name: 'renamed' })).toEqual({ name: 'renamed' });
  });

  it('still validates provided fields', () => {
    expect(updateNodeSchema.safeParse({ daemonPort: 0 }).success).toBe(false);
  });
});
