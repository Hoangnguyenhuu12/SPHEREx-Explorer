import { AlertCircle, ChevronLeft, ChevronRight, PenLine } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PATHS } from '../../../app/config'
import { AuthActions } from '../../../shared/layout/Shell'
import { loginPath } from '../../auth/returnTo'
import { useSession } from '../../auth/session'
import { describeForumError } from '../errors'
import { useLanguage } from '../../../shared/i18n/language'
import { StableLabel } from '../../../shared/i18n/StableLabel'

/** Header actions on Forum pages: Write a post + account. */
export function ForumHeaderActions({ showWrite = true }: { showWrite?: boolean }) {
  const { user } = useSession()
  const { lang } = useLanguage()
  return (
    <>
      {showWrite && (
        <Link to={user ? PATHS.forumNew : loginPath(PATHS.forumNew)} className="btn btn-primary forum-write">
          <PenLine aria-hidden />
          <span className="forum-write__label"><StableLabel text={lang === 'vi' ? 'Viết bài' : 'Write a post'} alt={lang === 'vi' ? 'Write a post' : 'Viết bài'} /></span>
        </Link>
      )}
      <AuthActions compact />
    </>
  )
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { lang } = useLanguage()
  const copy = describeForumError(error)
  const viErrors: Record<string, [string, string]> = {
    'Something went wrong': ['Đã xảy ra lỗi', 'Vui lòng thử lại sau.'],
    'Could not reach the Forum': ['Không thể kết nối diễn đàn', 'Hãy kiểm tra kết nối và thử lại.'],
    'The Forum server is not ready': ['Máy chủ diễn đàn chưa sẵn sàng', 'Máy chủ có thể đang khởi động. Vui lòng thử lại sau.'],
    'Please log in': ['Vui lòng đăng nhập', 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'],
    'No access': ['Không có quyền truy cập', 'Tài khoản của bạn không thể thực hiện thao tác này.'],
    'Post not found': ['Không tìm thấy bài viết', 'Bài viết có thể đã bị xóa hoặc chưa công khai.'],
    'Choose a display name': ['Chọn tên hiển thị', 'Hãy đặt tên công khai trước khi đăng.'],
    'A topic is no longer available': ['Chủ đề không còn khả dụng', 'Hãy xóa chủ đề đã ngừng sử dụng và chọn chủ đề khác.'],
    'Check the highlighted fields': ['Kiểm tra các trường được đánh dấu', 'Một số giá trị không hợp lệ.'],
    'Waiting for review': ['Đang chờ kiểm duyệt', 'Hãy rút lại bài gửi trước khi chỉnh sửa.'],
    'Comments are closed': ['Đã đóng bình luận', 'Bài viết không còn công khai nên không nhận bình luận mới.'],
    'Topic already exists': ['Chủ đề đã tồn tại', 'Hãy chọn một tên khác.'],
    'This changed while you were looking': ['Nội dung đã thay đổi', 'Hãy tải lại để xem trạng thái mới nhất.'],
  }
  const shown = lang === 'vi' ? viErrors[copy.title] : undefined
  return (
    <div className="notice notice--error forum-notice" role="alert">
      <AlertCircle aria-hidden />
      <div>
        <p>
          <strong>{shown?.[0] ?? copy.title}.</strong> {shown?.[1] ?? copy.body}
        </p>
        {copy.retry && onRetry && (
          <button type="button" className="btn btn-secondary btn-sm forum-notice__action" onClick={onRetry}>
            {lang === 'vi' ? 'Thử lại' : 'Try again'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Full-page message: post not found, no access. */
export function ForumMessage({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const { lang } = useLanguage()
  return (
    <section className="wrap forum-message">
      <h1>{title}</h1>
      <p>{children}</p>
      <div className="forum-message__actions">
        {action ?? (
          <Link className="btn btn-primary" to={PATHS.forum}>
            {lang === 'vi' ? 'Trở về diễn đàn' : 'Back to the Forum'}
          </Link>
        )}
      </div>
    </section>
  )
}

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (p: number) => string }) {
  const { lang } = useLanguage()
  if (pageCount <= 1) return null
  return (
    <nav className="pager" aria-label={lang === 'vi' ? 'Trang' : 'Pages'}>
      {page > 1 ? (
        <Link className="btn btn-secondary btn-sm" to={hrefFor(page - 1)} rel="prev">
          <ChevronLeft aria-hidden /> {lang === 'vi' ? 'Mới hơn' : 'Newer'}
        </Link>
      ) : (
        <span />
      )}
      <span className="pager__status num">
        {lang === 'vi' ? 'Trang' : 'Page'} {page} {lang === 'vi' ? 'trên' : 'of'} {pageCount}
      </span>
      {page < pageCount ? (
        <Link className="btn btn-secondary btn-sm" to={hrefFor(page + 1)} rel="next">
          {lang === 'vi' ? 'Cũ hơn' : 'Older'} <ChevronRight aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
