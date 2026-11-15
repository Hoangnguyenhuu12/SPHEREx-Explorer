# Star guide (chatbot): khung thiết kế giao diện

Ngày: 15/11/2026. Dựa trên code của Hữu Hoàng ở nhánh `huu-hoang` (commit `b531ec8`, "feat(chat): add star guide chatbot with zero-token guard") và `docs/DESIGN.md`.

> Trạng thái (15/11): **đã làm cả đợt 1 và đợt 2** trên nhánh `duy-hoang/star-chat-ui` (tách từ `huu-hoang`). Mọi thông số dùng token sẵn có trong `frontend/src/styles/tokens.css`, không thêm màu hay font mới.
>
> Khác với bản khung lúc đầu:
> - The Eyes đặt `--chat-top` = header + 68 px để panel không che nút Tutorial ở góc phải trên bản đồ.
> - Chat cũng ẩn ở chế độ nhúng (`?embed=1`).
> - Câu bị server trả lỗi 400 không có nút Try again (gửi lại cũng bị từ chối).
> - Khi bottom sheet mở thì ẩn nút nổi (sheet có nút đóng riêng); đóng xong focus quay lại nút nổi.

---

## 0. Hiện trạng trên nhánh `huu-hoang`

| Phần | File | Đã có |
| --- | --- | --- |
| UI | `frontend/src/features/chat/StarChat.tsx`, `chat.css` | Nút tròn nổi góc phải dưới, panel 380×520, lời chào, 5 câu hỏi gợi ý (chip), ô nhập 400 ký tự, "Thinking…", Esc để đóng |
| Trả lời tức thì | `features/chat/faq.ts` | 5 câu FAQ về 5 mục tiêu; câu gõ tay kiểu "tell me about R Dra", "WISE 0855 là gì" cũng khớp, không gọi AI |
| Bộ lọc 0 token | `features/chat/guard.ts` (bản sao ở `supabase/functions/star-chat/guard.ts`) | Chặn câu quá ngắn, gõ bừa, lạc đề ngay trên trình duyệt |
| Server | `supabase/functions/star-chat/index.ts` | Gemini (key ở Supabase secret), giới hạn 8 câu/phút/IP, cache câu đầu, CORS chỉ cho Vercel + localhost |
| Gắn vào app | `app/App.tsx` | `<StarChat />` nằm trong `Root`, nên hiện ở **mọi route** và giữ hội thoại khi chuyển trang |

### Vấn đề giao diện cần khung thiết kế giải quyết

1. **Lớp chồng sai.** `.star-chat` có `z-index: 900`, cao hơn modal mục tiêu (300), dialog (400), toast Forum (450), màn chuyển route (500) và hiệu ứng Story (600). Khi mở popup hay chuyển trang, nút chat vẫn nổi lên trên.
2. **Không phân biệt nguồn câu trả lời.** Code đã có cờ `ai` / `skip` nhưng giao diện hiển thị giống hệt nhau. Giám khảo và người dùng không biết câu nào là dữ kiện soạn sẵn, câu nào do AI sinh ra.
3. **Không có lối ra hành động.** Câu trả lời nhắc "play its sequence in The Eyes" nhưng không có nút mở The Eyes đúng mục tiêu.
4. **Lỗi chỉ là một dòng chữ**, không có nút thử lại; refusal và lỗi trông như câu trả lời thường.
5. **Mobile:** panel nổi 380 px chiếm gần hết màn hình nhưng vẫn để lộ trang phía sau, bàn phím ảo che ô nhập.
6. **The Eyes:** đang đẩy panel lên bằng số cứng `bottom: 132px`; khi popup mục tiêu mở bên trái thì không sao, nhưng dock công cụ ở giữa dưới có thể chạm panel ở màn 1366.
7. Thiếu nút xoá hội thoại, thiếu dòng nhắc "AI có thể sai", nút nổi không có tooltip (trái với `DESIGN.md` §4).

---

## 1. Mục tiêu và nguyên tắc

- **Phụ, không chen ngang.** Chatbot là trợ lý bên lề. Không tự mở, không popup chào, không che dữ liệu khoa học.
- **Thật thà về nguồn.** Mỗi câu trả lời ghi rõ là "Quick answer" (soạn sẵn, đã kiểm chứng) hay "AI answer" (Gemini, có thể sai).
- **Dẫn về sản phẩm.** Câu trả lời nhắc tới mục tiêu nào thì có nút mở mục tiêu đó trong The Eyes.
- **Cùng ngôn ngữ thiết kế.** Nền `--surface`, chữ `--fg`, radius 8, Lucide 1.75, nút 40 px, focus `--primary`. Không glow, không gradient, không bubble bo tròn lớn.
- **Giao diện tiếng Anh** (bài nộp tiếng Anh). AI trả lời theo ngôn ngữ người hỏi, như prompt hiện tại.

---

## 2. Giải phẫu thành phần

```text
<StarChat>
 ├─ ChatLauncher        nút nổi 52×52, góc phải dưới
 └─ ChatPanel           role="dialog", aria-label="Star guide"
     ├─ ChatHeader      icon + "Star guide" + phụ đề · [Clear] [Close]
     ├─ ChatLog         aria-live="polite", cuộn trong
     │   ├─ Greeting            tin chào cố định
     │   ├─ SuggestionChips     câu gợi ý (ưu tiên mục tiêu đang xem)
     │   ├─ Message (user)
     │   ├─ Message (assistant)  ── SourceTag + nội dung + ActionRow
     │   ├─ Notice (refusal / error) ── kèm [Try again] khi là lỗi
     │   └─ TypingIndicator
     ├─ ChatComposer    [✦ gợi ý] [ô nhập] [gửi] + bộ đếm ký tự khi gần 400
     └─ ChatFootnote    "AI answers may be wrong. Check facts in The Eyes."
```

Class giữ tiền tố `star-chat__` như code hiện tại. Các khối mới: `__sub`, `__tag`, `__actions`, `__notice`, `__count`, `__foot`.

---

## 3. Wireframe

### 3.1 Đóng (mọi trang)

```text
                                                    ┌────────────────────┐
                                                    │ Ask the star guide │  ← tooltip khi hover/focus
                                                    └────────────────────┘
                                                                  ╭────╮
                                                                  │ ✦💬 │ 52×52, nền --primary
                                                                  ╰────╯ cách mép 16 px
```

- Icon `MessageCircle` (giữ như code), khi mở đổi thành `X`.
- **Không** có chấm đỏ, không rung, không tự bật bong bóng chào. Lần đầu vào trang chỉ có tooltip khi hover.

### 3.2 Mở, chưa hỏi gì (desktop, panel 380 × 560)

```text
┌──────────────────────────────────────────┐
│ ✦ Star guide                    [⟲] [✕] │ 56 px, border-bottom --line
│   Quick facts and AI answers             │ caption --muted
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ Hi! I'm the star guide. Pick a       │ │ tin chào, --surface-2
│ │ question for an instant answer, or   │ │
│ │ ask anything about stars.            │ │
│ └──────────────────────────────────────┘ │
│                                          │
│  Suggested                               │ label 12 px --muted
│  ( Why is Barnard's Star special?    )   │ chip, xếp dọc, căn trái
│  ( What is WISE 0855?                )   │
│  ( What is Epsilon Indi B?           )   │
│  ( Why does RW Aurigae change bright…)   │
│  ( What is R Draconis?               )   │
│                                          │
├──────────────────────────────────────────┤
│ [✦] [ Ask about a star…           ] [➤] │ 40 px, border-top --line
│  AI answers may be wrong.                │ caption --muted, 1 dòng
└──────────────────────────────────────────┘
```

- `[⟲]` = Clear chat (`RotateCcw`), chỉ bật khi đã có tin nhắn. Bấm là xoá luôn, không hỏi lại (hội thoại ngắn, không có gì quý).
- Trên The Eyes khi URL có `?q=<mục tiêu>`, chip của mục tiêu đó lên đầu và có viền `--primary`.

### 3.3 Đang hội thoại

```text
├──────────────────────────────────────────┤
│                 ┌──────────────────────┐ │
│                 │ Why is Barnard's     │ │ user: --primary / --on-primary
│                 │ Star special?        │ │ căn phải, max 88%
│                 └──────────────────────┘ │
│ ● Quick answer                           │ tag: chấm --olive + caption
│ ┌──────────────────────────────────────┐ │
│ │ Barnard's Star is a red dwarf about  │ │ assistant: --surface-2
│ │ 6 light-years away…                  │ │
│ └──────────────────────────────────────┘ │
│ [◎ Open in The Eyes]                     │ btn-secondary btn-sm
│                                          │
│                 ┌──────────────────────┐ │
│                 │ How far is it?       │ │
│                 └──────────────────────┘ │
│ ✦ AI answer · may be wrong               │ tag: icon Sparkles --blue + caption
│ ┌──────────────────────────────────────┐ │
│ │ About 5.96 light-years…              │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌────────┐                               │
│ │ • • •  │  Thinking…                    │ typing: 3 chấm, reduced-motion → chữ tĩnh
│ └────────┘                               │
├──────────────────────────────────────────┤
```

**Source tag** (dòng nhỏ phía trên bong bóng assistant):

| Loại tin | Điều kiện trong code | Tag | Màu |
| --- | --- | --- | --- |
| Quick answer | `skip && faqAnswer()` khớp | `● Quick answer` | chấm `--olive`, chữ `--muted` |
| AI answer | `ai === true` | `✦ AI answer · may be wrong` | icon `--blue`, chữ `--muted` |
| Từ chối / lọc | `guard()` chặn hoặc `blocked` | không tag, dùng Notice (3.4) | |
| Lỗi | mạng, 429, 503 | Notice lỗi (3.4) | |

Cần thêm trường `kind: 'faq' | 'ai' | 'notice' | 'error'` vào `Msg` thay cho cặp cờ `ai`/`skip` khi hiển thị (giữ `skip` cho logic lịch sử gửi AI).

**Action row** (chỉ dưới tin assistant):
- Nếu nội dung nhắc tới đúng **một** mục tiêu (dùng lại bảng `NAMES` trong `faq.ts`) → nút `Open in The Eyes` dẫn tới `/the-eyes?q=<target_key>`. Đang ở The Eyes với đúng mục tiêu đó thì ẩn nút.
- Không thêm nút like/dislike, copy (không có backend nhận phản hồi; tránh thừa).

### 3.4 Notice: từ chối và lỗi

```text
│ ⓘ Sorry, I can only answer questions     │ refusal: không nền, viền trái 3 px --line-strong,
│   about stars, astronomy and this site.  │ chữ --muted, icon Info
│                                          │
│ ⚠ The star guide is busy right now.      │ lỗi: viền trái 3 px --danger, icon AlertTriangle
│   [Try again]                            │ btn-ghost btn-sm, gửi lại câu hỏi cuối
```

| Tình huống | Câu hiển thị (giữ từ code) | Try again |
| --- | --- | --- |
| Quá ngắn / gõ bừa / lạc đề | `TOO_SHORT`, `GIBBERISH`, `REFUSAL` | Không |
| 429 | "Too many questions. Please wait a minute." | Không, khoá ô gửi 30 s và ghi đếm ngược trong placeholder |
| 503 / Gemini lỗi | "The star guide is busy right now…" | Có |
| Mạng | "Network error. Please try again." | Có |
| Thiếu `VITE_STAR_CHAT_URL` và URL mặc định | "The AI guide is offline. Try one of the suggested questions." | Không; hiện lại chip gợi ý |

### 3.5 Mobile (< 720 px): bottom sheet

```text
┌─────────────────────────┐
│ ▔▔▔ (kéo xuống để đóng) │
│ ✦ Star guide   [⟲] [✕] │
├─────────────────────────┤
│                         │
│   …hội thoại…           │ cao 85dvh, rộng 100vw, radius 8 ở 2 góc trên
│                         │ backdrop rgb(0 0 0 / 0.5) phía sau
├─────────────────────────┤
│ [✦][ Ask…        ][➤]   │ dính đáy, padding-bottom env(safe-area-inset-bottom)
└─────────────────────────┘
```

- Dùng `height: 85dvh` để bàn phím ảo không che ô nhập.
- Mở sheet thì khoá cuộn trang (`overflow: hidden` trên `body`), trả lại khi đóng.
- Nút nổi thu còn 48×48.

---

## 4. Vị trí trên từng trang

| Trang | Nút nổi | Panel | Ghi chú |
| --- | --- | --- | --- |
| Landing `/` | Phải dưới, 16 px | Mở lên trên nút | Tàu SPHEREx trang trí ở góc **trái**, không đụng |
| Story `/story` | Phải dưới | như trên | Hiệu ứng sao băng (`.sky-fx`, z 600) phải nằm **trên** chat; xem §5 |
| Where are you | Phải dưới | như trên | |
| The Eyes `/the-eyes` | Phải, ngay trên footer gọn 36 px và cao hơn dock | Neo phải; cao tối đa = vùng giữa header 56 px và dock | Thay số cứng `132px` bằng biến `--chat-bottom` do `eyes.css` đặt |
| Forum, Admin | Phải dưới | như trên | Toast Forum ở giữa dưới; trên mobile toast phải nổi trên nút |
| Login / Signup | **Ẩn** | | Trang biểu mẫu, không cần trợ lý |

Cài đặt: mỗi trang có thể đặt `--chat-bottom` trên phần tử gốc của trang; `chat.css` dùng `bottom: var(--chat-bottom, var(--space-4))`. Ẩn ở trang auth bằng một danh sách route trong `StarChat` (đọc `useLocation()`).

### The Eyes, 1440 × 900, popup mục tiêu đang mở

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☰ SPHEREx Explorer · The Eyes                                       header 56 │
├───────────────────────┬──────────────────────────────────────────────────────┤
│ Popup mục tiêu 460 px │                                   ┌────────────────┐ │
│                       │          bản đồ trời              │ Star guide     │ │
│                       │                                   │ …              │ │
│                       │                                   │                │ │
│                       │                                   │ [Ask…]   [➤]  │ │
│                       │         ┌──── dock ────┐          └────────────────┘ │
│                       │         │ ◀ ▶ ⟲ ⊕ ⊖   │                      ╭──╮   │
│                       │         └──────────────┘                      │✕ │   │
├───────────────────────┴──────────────────────────────────────────────────────┤
│ footer gọn 36                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

Ở 1366 px, popup 420 + panel 380 + dock giữa vẫn đủ chỗ (1366 − 420 − 380 − 2×16 = 534 px cho bản đồ). Dưới 1100 px panel chuyển sang dạng sheet như mobile.

---

## 5. Lớp chồng (z-index)

Thứ tự hiện tại trên `main` và vị trí đề xuất cho chat:

| z | Lớp | Ghi chú |
| --- | --- | --- |
| 100 / 120 | header, nav drawer | |
| **250** | **star chat (đề xuất)** | đang là 900 |
| 300 | modal mục tiêu (`popup.css`) | phải che chat |
| 400 | dialog dùng chung (`ui.css`) | phải che chat |
| 450 | toast Forum | |
| 500 | màn chuyển route | phải che chat |
| 600 | hiệu ứng Story | |
| 1000 | tour hướng dẫn The Eyes, skip-link | |

Khi tour hướng dẫn (`features/guide`) đang chạy thì ẩn nút nổi, tránh hai lớp trợ giúp cùng lúc.

---

## 6. Token và kích thước

| Phần | Giá trị |
| --- | --- |
| Panel desktop | `width: min(380px, 100vw − 32px)`, `height: min(560px, 100dvh − var(--header-h) − 96px)`, nền `--surface`, viền `1px --line-strong`, radius `--radius`, bóng `0 12px 40px rgb(0 0 0 / .5)` |
| Header | cao 56, tiêu đề Averia 18/24 `--heading`, phụ đề `caption` `--muted` |
| Bong bóng | padding 8×12, radius `--radius`, chữ `body-sm` 14/20, `max-width: 88%` |
| Source tag | `caption` 12/16, cách bong bóng 4 px |
| Chip gợi ý | `.chip` sẵn có, xếp dọc, `white-space: normal` |
| Composer | `.icon-btn` 40×40 + `.input` 40 cao; bộ đếm `caption` hiện khi ≥ 320/400 ký tự, chuyển `--warn` ở 380 |
| Footnote | `caption` `--muted`, cách composer 4 px |
| Motion | mở/đóng panel: `motion` 220 ms `--ease-out`, trượt lên 8 px + fade; reduced motion: fade 120 ms; typing 3 chấm nhấp nháy 1,2 s, reduced motion: chữ "Thinking…" tĩnh |

---

## 7. Bàn phím và trợ năng

- Nút nổi: `aria-expanded`, `aria-controls="star-chat-panel"`, tooltip "Ask the star guide".
- Mở panel: focus vào ô nhập. Đóng (Esc, nút ✕, bấm lại nút nổi): focus trả về nút nổi.
- Panel desktop **không** bẫy focus (không phải modal, người dùng vẫn thao tác bản đồ). Sheet mobile **có** bẫy focus và backdrop.
- `ChatLog` giữ `aria-live="polite"`; tin "Thinking…" có `role="status"`. Source tag đọc trước nội dung ("Quick answer: …").
- Enter gửi; Shift+Enter không cần (ô một dòng, 400 ký tự).
- Contrast: chữ `--muted` trên `--surface` 10,1:1; chữ `--on-primary` trên `--primary` 16,6:1.

---

## 8. Kế hoạch làm (vừa với thời gian còn lại đến 22:30)

**Đợt 1 (bắt buộc, khoảng 1 giờ):**
1. Hạ `z-index` về 250; ẩn chat ở trang auth và khi tour chạy.
2. Thêm `kind` vào `Msg`, hiển thị source tag "Quick answer" / "AI answer · may be wrong".
3. Notice cho refusal và lỗi, nút Try again cho 503 và lỗi mạng.
4. Footnote "AI answers may be wrong." và tooltip cho nút nổi.
5. Thay `bottom: 132px` bằng `--chat-bottom`.

**Đợt 2 (nếu còn giờ):**
6. Nút `Open in The Eyes` dưới câu trả lời nhắc đúng một mục tiêu.
7. Chip gợi ý ưu tiên mục tiêu đang xem trên The Eyes.
8. Bottom sheet mobile < 720 px (và < 1100 px trên The Eyes).
9. Nút Clear chat, khoá 30 s khi 429.

**Test cần thêm** (`frontend/src/test/star-chat.test.tsx`):
- tag đúng loại cho câu FAQ và câu AI;
- Try again gửi lại đúng câu cuối và chỉ hiện với lỗi 503/mạng;
- nút Open in The Eyes có `href` đúng `target_key`;
- không render trên `/login`;
- Esc đóng và trả focus về nút nổi.

---

## 9. Câu hỏi mở cho nhóm

1. Đặt tên hiển thị: giữ **"Star guide"** hay đổi theo chủ đề trang (ví dụ "Ask SPHEREx")?
2. Bài nộp phải liệt kê công cụ AI: thêm "Google Gemini (star guide chatbot)" vào mục AI tools; footnote có nên ghi tên Gemini không?
3. Có giữ hội thoại qua lần tải lại trang (`sessionStorage`) không? Đề xuất: không, cho đơn giản.
4. Trang Forum: chatbot có nên gợi ý "Post this observation" không? Đề xuất: không, ngoài phạm vi.
