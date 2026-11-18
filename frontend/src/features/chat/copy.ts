import { fold } from './guard'

export const CHAT_COPY = {
  en: {
    title: 'Star guide', subtitle: 'Quick facts and AI answers', clear: 'Clear chat', close: 'Close star guide', closeShort: 'Close', open: 'Open star guide', ask: 'Ask the star guide',
    greeting: "Hi! I'm the star guide. Pick a question for an instant answer, or ask anything about stars and astronomy.",
    footnote: 'AI answers may be wrong. Check the images in The Eyes.', thinking: 'Thinking…', suggested: 'Suggested', hide: 'Hide suggested questions', show: 'Show suggested questions',
    placeholder: 'Ask about a star…', question: 'Your question', send: 'Send', retry: 'Try again', quick: 'Quick answer', ai: 'AI answer · may be wrong', eyes: 'Open in The Eyes',
    wait: (s: number) => `Wait ${s} s to ask again…`, offline: 'The AI guide is offline. Try one of the suggested questions.', network: 'Network error. Please try again.', error: 'Something went wrong. Please try again.', rate: 'Too many questions. Please wait a minute.',
    refusal: 'Sorry, I can only answer questions about stars, astronomy and the SPHEREx Explorer site.', short: 'Please type a full question about stars or astronomy.', gibberish: "I couldn't understand that. Please ask a question about stars or astronomy.",
    hello: 'Hello! I’m your star guide. If you have a question about the sky or this site, just ask me.', bye: 'Goodbye! Come back anytime if you have more questions about the sky.', thanks: 'You’re welcome! If you have another question, just ask.', ok: 'Sounds good! Feel free to ask if you have any questions.', identity: 'I’m the star guide for SPHEREx Explorer. I can help you explore the site and learn about stars and astronomy.',
  },
  vi: {
    title: 'Người dẫn đường', subtitle: 'Thông tin nhanh và câu trả lời AI', clear: 'Xóa cuộc trò chuyện', close: 'Đóng người dẫn đường', closeShort: 'Đóng', open: 'Mở người dẫn đường', ask: 'Hỏi người dẫn đường',
    greeting: 'Chào bạn! Mình là người dẫn đường khám phá bầu trời. Hãy chọn một câu hỏi gợi ý hoặc hỏi mình về các ngôi sao và thiên văn nhé.',
    footnote: 'Câu trả lời AI có thể sai. Hãy kiểm tra hình ảnh trong Đôi mắt.', thinking: 'Đang suy nghĩ…', suggested: 'Gợi ý', hide: 'Ẩn câu hỏi gợi ý', show: 'Hiện câu hỏi gợi ý',
    placeholder: 'Hỏi về một ngôi sao…', question: 'Câu hỏi của bạn', send: 'Gửi', retry: 'Thử lại', quick: 'Trả lời nhanh', ai: 'Câu trả lời AI · có thể sai', eyes: 'Mở trong Đôi mắt',
    wait: (s: number) => `Vui lòng đợi ${s} giây…`, offline: 'Trợ lý AI đang ngoại tuyến. Bạn hãy thử một câu hỏi gợi ý nhé.', network: 'Lỗi kết nối. Vui lòng thử lại.', error: 'Đã xảy ra lỗi. Vui lòng thử lại.', rate: 'Bạn đã hỏi quá nhanh. Vui lòng đợi một chút.',
    refusal: 'Mình có thể giúp bạn tìm hiểu về các ngôi sao, thiên văn và cách dùng SPHEREx Explorer nhé.', short: 'Bạn hãy nhập một câu hỏi về các ngôi sao hoặc thiên văn nhé.', gibberish: 'Mình chưa hiểu ý bạn. Bạn hãy thử hỏi lại về các ngôi sao hoặc thiên văn nhé.',
    hello: 'Chào bạn! Mình là người dẫn đường khám phá bầu trời. Nếu bạn có câu hỏi về thiên văn hoặc cách dùng trang, cứ hỏi mình nhé!', bye: 'Tạm biệt bạn! Khi nào muốn khám phá bầu trời, bạn cứ quay lại hỏi mình nhé.', thanks: 'Không có gì! Nếu có câu hỏi khác, bạn cứ hỏi mình nhé.', ok: 'Được nhé! Nếu có câu hỏi gì, bạn cứ hỏi mình.', identity: 'Mình là người dẫn đường của SPHEREx Explorer. Mình có thể giúp bạn tìm hiểu các ngôi sao, thiên văn và cách sử dụng trang.',
  },
} as const

export type LocalReply = 'hello' | 'bye' | 'thanks' | 'ok' | 'identity'

/** Match only complete conversational turns: a greeting must not hide a separate request. */
export function conversationalReply(input: string): LocalReply | undefined {
  const text = fold(input)
  if (/^(hi|hello|hey|hi there|chao|xin chao|chao ban|chao ban nhe|alo|hello ban)$/.test(text)) return 'hello'
  if (/^(bye|goodbye|bye bye|see you|tam biet|hen gap lai|chao tam biet)$/.test(text)) return 'bye'
  if (/^(thanks|thank you|thank you very much|cam on|cam on ban|cam on nhieu)$/.test(text)) return 'thanks'
  if (/^(ok|okay|alright|got it|duoc|duoc roi|hieu roi|vang|uh|uk|oke)$/.test(text)) return 'ok'
  if (/^(who are you|what are you|what is your name|ban la ai|ban ten gi|ban la gi|may la ai)$/.test(text)) return 'identity'
  return undefined
}
