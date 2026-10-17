/** Sort comparator, newest first: "1.20.4" before "1.20" before "1.7.10"; odd ids fall back to text order. */
export function compareMc(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  if (pa.some(isNaN) || pb.some(isNaN)) return b.localeCompare(a);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** True when release `a` is newer than release `b`. */
export const isNewerMc = (a: string, b: string) => compareMc(a, b) < 0;
