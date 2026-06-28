/**
 * Validasi nomor paspor Indonesia.
 * Format: 2 huruf + 7 digit angka (total 9 karakter).
 *
 * @example isPassport('AB1234567') // true
 * @example isPassport('123456789') // false (harus ada huruf)
 */
export function isPassport(value: string): boolean {
  return /^[A-Za-z]{2}\d{7}$/.test(value.trim())
}
