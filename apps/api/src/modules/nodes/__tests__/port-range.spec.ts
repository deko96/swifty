import { describe, expect, it } from 'bun:test';
import { expandPortEntries } from '../domain/port-range';

describe('expandPortEntries', () => {
  it('expands singles and ranges, de-duplicated and sorted', () => {
    expect(expandPortEntries(['27020-27022', '27015', '27020'])).toEqual([
      27015, 27020, 27021, 27022,
    ]);
  });

  it('rejects out-of-range ports and inverted ranges', () => {
    expect(expandPortEntries(['0'])).toBeNull();
    expect(expandPortEntries(['70000'])).toBeNull();
    expect(expandPortEntries(['27020-27010'])).toBeNull();
  });

  it('rejects expansions above the per-request cap', () => {
    expect(expandPortEntries(['1-2000'])).toBeNull();
    expect(expandPortEntries(['1-1000'])).toHaveLength(1000);
  });
});
