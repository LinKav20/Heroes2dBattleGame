/**
 * Compares two strings by their UTF-16 code units, the order of RFC 8785 and of the kernel; it never depends on the
 * locale.
 */
export function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;

  return left < right ? -1 : 1;
}
