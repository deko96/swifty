export const MAX_PORTS_PER_REQUEST = 1000;

export const PORT_ENTRY = /^\d{1,5}(-\d{1,5})?$/;

/**
 * Expands entries like "27015" and "27015-27020" into a sorted, de-duplicated
 * port list. Returns null when the expansion would exceed MAX_PORTS_PER_REQUEST
 * or an entry is out of the valid port range.
 */
export function expandPortEntries(entries: string[]): number[] | null {
  const ports = new Set<number>();
  for (const entry of entries) {
    const [startRaw, endRaw] = entry.split('-');
    const start = Number(startRaw);
    const end = endRaw === undefined ? start : Number(endRaw);
    if (start < 1 || end > 65535 || end < start) {
      return null;
    }
    for (let port = start; port <= end; port++) {
      ports.add(port);
      if (ports.size > MAX_PORTS_PER_REQUEST) {
        return null;
      }
    }
  }
  return [...ports].sort((a, b) => a - b);
}
