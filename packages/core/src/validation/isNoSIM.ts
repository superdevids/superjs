/**
 * Validasi Nomor SIM Indonesia.
 * Format: 12 digit angka (2 digit golongan + 6 digit tanggal lahir + 4 digit nomor seri).
 *
 * @example isNoSIM('123456789012') // true (12 digit)
 * @example isNoSIM('12345') // false
 */
export function isNoSIM(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 12
}
