/**
 * Validasi Nomor Kartu Keluarga (KK) Indonesia.
 * Format: 16 digit angka.
 *
 * @example isNoKK('1234567890123456') // true
 * @example isNoKK('12345') // false
 */
export function isNoKK(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 16
}
