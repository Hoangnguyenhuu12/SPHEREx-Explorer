import type { WarningCode } from '../../shared/api/types'

const MJD_UNIX_EPOCH = 40587

export function mjdToDate(mjd: number): Date {
  return new Date((mjd - MJD_UNIX_EPOCH) * 86_400_000)
}

/** UTC calendar date, e.g. 2025-05-14. */
export function formatUtcDate(iso: string | number): string {
  const d = typeof iso === 'number' ? mjdToDate(iso) : new Date(iso)
  return d.toISOString().slice(0, 10)
}

export function formatShortDate(mjd: number): string {
  const d = mjdToDate(mjd)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function formatInterval(tMin?: number, tMax?: number): string | null {
  if (tMin == null || tMax == null) return null
  const a = mjdToDate(tMin).toISOString().replace('T', ' ').slice(0, 16)
  const b = mjdToDate(tMax).toISOString().replace('T', ' ').slice(0, 16)
  return `${a} – ${b} UTC`
}

export const WARNING_COPY: Record<string, string> = {
  SATURATION_POSSIBLE: 'This star is bright enough to saturate the detector. Its centre may look flat or wrong.',
  FEW_FRAMES: 'Fewer than three observations are available, so changes over time are hard to judge.',
  TRUNCATED: 'Only part of the available observations is shown.',
  MIXED_WAVELENGTH: 'The frames were taken at different wavelengths, so brightness differences may not be real changes.',
  TARGET_OUTSIDE_COVERAGE: 'The target lies near or beyond the edge of the observed area.',
}

const WARNING_VI: Record<string, string> = {
  SATURATION_POSSIBLE: 'Ngôi sao đủ sáng để làm bão hòa cảm biến. Vùng tâm có thể trông phẳng hoặc không chính xác.',
  FEW_FRAMES: 'Có ít hơn ba ảnh quan sát nên khó đánh giá sự thay đổi theo thời gian.',
  TRUNCATED: 'Chỉ một phần ảnh quan sát hiện có được hiển thị.',
  MIXED_WAVELENGTH: 'Các ảnh được chụp ở bước sóng khác nhau nên chênh lệch độ sáng có thể không phải thay đổi thực.',
  TARGET_OUTSIDE_COVERAGE: 'Mục tiêu nằm gần hoặc ngoài rìa vùng quan sát.',
}
export function warningText(code: WarningCode, lang: 'en' | 'vi' = 'en'): string {
  return (lang === 'vi' ? WARNING_VI[code] : WARNING_COPY[code]) ?? `${lang === 'vi' ? 'Lưu ý dữ liệu' : 'Data note'}: ${code}`
}
