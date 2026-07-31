import { describe, expect, it } from 'bun:test';
import { generateSftpPassword, sftpUsername } from './sftp';

describe('sftpUsername', () => {
  it('is derived from the server id, prefixed and length-bounded', () => {
    const name = sftpUsername('0e6b7a1c-9f6e-4c56-8f4a-2d1b3c4d5e6f');
    expect(name).toBe('srv_0e6b7a1c9f6e4c56');
    expect(name.length).toBeLessThanOrEqual(40);
  });

  it('is stable for the same id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(sftpUsername(id)).toBe(sftpUsername(id));
  });
});

describe('generateSftpPassword', () => {
  it('produces distinct, URL-safe passwords', () => {
    const a = generateSftpPassword();
    const b = generateSftpPassword();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });
});
