/**
 * Validasi nomor BPJS Kesehatan Indonesia.
 * Format: 13 digit angka.
 *
 * @example isNoBPJS('1234567890123') // true
 * @example isNoBPJS('12345') // false
 */
export function isNoBPJS(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 13
}
