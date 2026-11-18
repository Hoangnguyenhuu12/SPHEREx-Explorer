import type { ErrorCode } from './types'

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number | null
  readonly details: unknown

  constructor(code: ErrorCode, message: string, status: number | null = null, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export interface ErrorCopy {
  title: string
  body: string
  retry: boolean
}

/** UI decisions read only `code`; the backend message is never shown raw. */
export function describeError(error: unknown): ErrorCopy {
  const code: ErrorCode = error instanceof ApiError ? error.code : 'INTERNAL'
  switch (code) {
    case 'BAD_COORDS':
      return { title: 'Coordinates not accepted', body: 'Check the RA and Dec values and try again.', retry: false }
    case 'BAD_PARAM':
      return { title: 'Request not accepted', body: 'One of the settings is outside the allowed range.', retry: false }
    case 'UNKNOWN_TARGET':
      return { title: 'Name not found', body: 'Try another name, or enter RA and Dec instead.', retry: false }
    case 'NO_FRAMES':
      return {
        title: 'No SPHEREx observations here',
        body: 'SPHEREx has no released images for this position and detector yet. Try another detector or target.',
        retry: false,
      }
    case 'NO_SPECTRUM':
      return {
        title: 'No measured spectrum here',
        body: 'No SPHEREx FITS spectrum covers this position, so nothing is plotted. Pick another point or target.',
        retry: false,
      }
    case 'SPECTRUM_ASSET_UNAVAILABLE':
      return {
        title: 'Spectrum file unavailable',
        body: 'The catalog record exists, but its FITS asset is not readable from the configured archive.',
        retry: false,
      }
    case 'FRAME_NOT_FOUND':
      return { title: 'Images expired', body: 'The image service restarted. Reload the observations.', retry: true }
    case 'TIMELINE_UNAVAILABLE':
      return { title: 'WISE 0855 images unavailable', body: 'The preprocessed images could not be loaded. Try again or choose SPHEREx only.', retry: true }
    case 'UPSTREAM_ERROR':
      return { title: 'Archive unavailable', body: 'The NASA archive did not answer correctly. Try again in a moment.', retry: true }
    case 'UPSTREAM_TIMEOUT':
    case 'CLIENT_TIMEOUT':
      return { title: 'The image service is slow', body: 'It may take a minute to wake up. Try again.', retry: true }
    case 'NETWORK':
      return { title: 'Connection problem', body: 'The image service could not be reached.', retry: true }
    case 'NOT_AVAILABLE':
      return { title: 'Not available yet', body: 'This tool needs data the service does not provide yet.', retry: false }
    case 'ABORTED':
      return { title: 'Cancelled', body: 'The request was cancelled.', retry: true }
    default:
      return { title: 'Something went wrong', body: 'An unexpected error occurred.', retry: true }
  }
}

export function isAbort(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === 'ABORTED') ||
    (error instanceof DOMException && error.name === 'AbortError')
  )
}

/** Keep service codes intact while translating their user-facing explanations. */
export function describeErrorLocalized(error: unknown, lang: 'en' | 'vi'): ErrorCopy {
  const copy = describeError(error)
  if (lang === 'en') return copy
  const translations: Record<string, [string, string]> = {
    'Coordinates not accepted': ['Tọa độ không hợp lệ', 'Hãy kiểm tra RA và Dec rồi thử lại.'],
    'Request not accepted': ['Yêu cầu không hợp lệ', 'Một cài đặt nằm ngoài phạm vi cho phép.'],
    'Name not found': ['Không tìm thấy tên', 'Hãy thử tên khác hoặc nhập RA và Dec.'],
    'No SPHEREx observations here': ['Không có quan sát SPHEREx tại đây', 'Chưa có ảnh phát hành cho vị trí và cảm biến này. Hãy thử cảm biến hoặc mục tiêu khác.'],
    'No measured spectrum here': ['Không có phổ đo tại đây', 'Không có phổ FITS SPHEREx bao phủ vị trí này. Hãy chọn điểm hoặc mục tiêu khác.'],
    'Spectrum file unavailable': ['Tệp phổ không khả dụng', 'Có hồ sơ danh mục nhưng không đọc được tệp FITS từ kho đã cấu hình.'],
    'Images expired': ['Ảnh đã hết hạn', 'Dịch vụ ảnh đã khởi động lại. Hãy tải lại ảnh quan sát.'],
    'WISE 0855 images unavailable': ['Ảnh WISE 0855 không khả dụng', 'Không thể tải ảnh đã xử lý. Hãy thử lại hoặc chỉ chọn SPHEREx.'],
    'Archive unavailable': ['Kho lưu trữ không khả dụng', 'Kho NASA không phản hồi đúng. Hãy thử lại sau.'],
    'The image service is slow': ['Dịch vụ ảnh phản hồi chậm', 'Máy chủ có thể cần một phút để khởi động. Hãy thử lại.'],
    'Connection problem': ['Lỗi kết nối', 'Không thể kết nối dịch vụ ảnh.'],
    'Not available yet': ['Chưa khả dụng', 'Công cụ này cần dữ liệu mà dịch vụ chưa cung cấp.'],
    Cancelled: ['Đã hủy', 'Yêu cầu đã được hủy.'],
    'Something went wrong': ['Đã xảy ra lỗi', 'Đã xảy ra lỗi không mong muốn.'],
  }
  const localized = translations[copy.title]
  return localized ? { ...copy, title: localized[0], body: localized[1] } : copy
}
