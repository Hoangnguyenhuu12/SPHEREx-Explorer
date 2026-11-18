import type { Language } from '../../shared/i18n/language'
import { PUBLISHED } from './mock/store'
import { excerpt } from './markdown'

const DEMO_VI = [
  { title: 'Làm sao phân biệt sao đang chuyển động với nhiễu trong ảnh hiệu?', body: 'Mình mở Sao Barnard ở D6 và chuyển sang chế độ ảnh hiệu. Mình thấy một đốm sáng cạnh một đốm tối, nhưng cũng có nhiều hạt lốm đốm trên ảnh.\n\nCặp sáng–tối đó có phải do sao chuyển động hay chỉ là nhiễu? Mình nên chú ý điều gì?' },
  { title: 'Vì sao WISE 0855 chỉ hiện ở các cảm biến bước sóng dài?', body: 'Mình hầu như không thấy gì tại vị trí WISE 0855 trong D1–D3, nhưng D6 cho thấy một chấm mờ.\n\nTheo mình đọc được, đây là một sao lùn nâu rất lạnh nên phần lớn ánh sáng phát ra ở bước sóng hồng ngoại dài hơn. Mọi người có thấy như vậy không?' },
  { title: 'Mẹo: phóng to trước khi nhấn phát', body: 'Ảnh cắt đầy đủ rộng 10 phút cung, nên rất dễ bỏ sót một ngôi sao chỉ dịch chuyển một pixel.\n\n- Phóng tới khoảng 2 phút cung quanh ngôi sao\n- Bật chế độ ảnh hiệu\n- Phát ở tốc độ 1× và tìm cặp sáng–tối giữ nguyên vị trí\n\nCách này giúp mình nhận ra chuyển động dễ hơn nhiều.' },
  { title: 'R Draconis sáng hơn trong một số ảnh', body: 'R Dra là sao biến quang kiểu Mira nên mình nghĩ độ sáng sẽ thay đổi. Ở D4, ngôi sao trông sáng hơn rõ rệt trong các ảnh chụp sau.\n\nMình chưa xem kỹ biểu đồ độ sáng. Thay đổi trên ảnh có giống với thay đổi trong thẻ Độ sáng không?' },
  { title: 'Vì sao tâm của các ngôi sao sáng lại có màu đen?', body: 'Những sao rất sáng như Barnard và R Dra có một vùng đen ở giữa. Đây có phải là lỗi dữ liệu không?\n\nTheo ghi chú của nhóm, cảm biến bị bão hòa khi quan sát sao quá sáng và các pixel không có giá trị hợp lệ hiện được hiển thị màu đen.' },
] as const

const COMMENT_VI = [
  'Một ngôi sao thực sự chuyển động tạo ra cặp sáng–tối ở cùng vị trí trong các ảnh sau, với phần tối ở vị trí cũ của sao. Các hạt nhiễu thì thay đổi vị trí giữa các ảnh.',
  'Bạn cũng hãy thử phóng to. Với sao Barnard, hai đốm sẽ cách nhau khoảng một đến hai pixel sau một năm.',
  'Mình cũng thấy vậy. D5 và D6 là những cảm biến nên dùng cho mục tiêu này.',
] as const

/** Only exact, unedited demo content is translated; real posts and edits stay untouched. */
export function demoPost(authorId: string, title: string, bodyOrExcerpt: string, lang: Language, summary = false) {
  if (!authorId.startsWith('seed_')) return undefined
  const index = PUBLISHED.findIndex((p) => p.author === authorId && p.title === title && (summary ? excerpt(p.body) === bodyOrExcerpt : p.body === bodyOrExcerpt))
  if (index < 0) return undefined
  const source = PUBLISHED[index]
  const translated = DEMO_VI[index]
  return { title: lang === 'vi' ? translated.title : source.title, body: lang === 'vi' ? translated.body : source.body }
}

export function demoComment(authorId: string, body: string, lang: Language): string {
  const comments = PUBLISHED.flatMap((post) => post.comments ?? [])
  const index = comments.findIndex((c) => c.author === authorId && c.body === body)
  return lang === 'vi' && index >= 0 ? COMMENT_VI[index] : body
}

export function validationText(message: string | undefined, lang: Language): string | undefined {
  if (!message || lang === 'en') return message
  const exact: Record<string, string> = {
    'Add a title.': 'Hãy thêm tiêu đề.', 'Write your post.': 'Hãy viết nội dung bài đăng.',
    'Choose at least one topic.': 'Hãy chọn ít nhất một chủ đề.',
    'One of the topics is no longer available. Choose another.': 'Một chủ đề không còn khả dụng. Hãy chọn chủ đề khác.',
    'Add a title or some text before saving a draft.': 'Hãy thêm tiêu đề hoặc nội dung trước khi lưu bản nháp.',
    'Write a comment first.': 'Hãy viết bình luận trước.', 'Choose a reason.': 'Hãy chọn lý do.',
  }
  if (exact[message]) return exact[message]
  const n = message.match(/[\d,]+/)?.[0]
  if (!n) return message
  if (message.startsWith('Use at least')) return `Hãy dùng ít nhất ${n} ký tự để mọi người hiểu nội dung bài.`
  if (message.startsWith('Write at least')) return `Hãy viết ít nhất ${n} ký tự.`
  if (message.startsWith('Keep the title under')) return `Tiêu đề phải dưới ${n} ký tự.`
  if (message.startsWith('Shorten the post')) return `Hãy rút bài viết xuống tối đa ${n} ký tự.`
  if (message.startsWith('Shorten your comment')) return `Hãy rút bình luận xuống tối đa ${n} ký tự.`
  if (message.startsWith('Choose up to')) return `Chọn tối đa ${n} chủ đề.`
  if (message.startsWith('Add up to')) return `Thêm tối đa ${n} liên kết.`
  if (message.startsWith('Keep it under')) return `Hãy dùng ít hơn ${n} ký tự.`
  if (message.startsWith('Explain in at least')) return `Hãy giải thích bằng ít nhất ${n} ký tự.`
  return message
}
