import { X } from 'lucide-react'
import { useRef } from 'react'
import { useModalDialog } from '../../shared/ui/useModalDialog'
import { useLanguage } from '../../shared/i18n/language'
import { EyesCopy } from '../../features/target-details/EyesCopy'

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause the observations'],
  ['← / →', 'Previous or next observation'],
  ['D', 'Switch Original / Difference'],
  ['G', 'Show or hide the RA/Dec grid'],
  ['M', 'Turn sky motion on or off'],
  ['C', 'Center the map on the target'],
  ['Esc', 'Close the target details'],
  ['+ / − / 0', 'Zoom or fit the image (when the image has focus)'],
  ['T', 'Show or hide the on-screen guide'],
  ['?', 'Open this help'],
]

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const translations = ['Phát hoặc tạm dừng ảnh quan sát', 'Ảnh quan sát trước hoặc tiếp theo', 'Chuyển ảnh gốc / ảnh hiệu', 'Hiện hoặc ẩn lưới RA/Dec', 'Bật hoặc tắt chuyển động bầu trời', 'Căn giữa bản đồ tại mục tiêu', 'Đóng chi tiết mục tiêu', 'Phóng to, thu nhỏ hoặc vừa ảnh (khi ảnh được chọn)', 'Hiện hoặc ẩn hướng dẫn trên màn hình', 'Mở trợ giúp này']
  const ref = useRef<HTMLDialogElement>(null)
  const closedBy = useModalDialog(ref, onClose, { lightDismiss: true })
  return (
    <dialog ref={ref} className="modal help" {...({ closedby: closedBy } as Record<string, string>)} aria-labelledby="help-title">
        <div className="modal__head">
          <h2 id="help-title" className="help__title">
            <EyesCopy alternate={vi ? 'How The Eyes works' : 'Cách sử dụng Đôi mắt'}>{vi ? 'Cách sử dụng Đôi mắt' : 'How The Eyes works'}</EyesCopy>
          </h2>
          <button type="button" className="icon-btn" aria-label={vi ? 'Đóng trợ giúp' : 'Close help'} onClick={onClose}>
            <X aria-hidden />
          </button>
        </div>
        <p>
          {vi ? 'Bạn đang nhìn từ tâm thiên cầu. Kéo để khám phá bản đồ hồng ngoại toàn bầu trời SPHEREx (thay đổi theo cảm biến đã chọn) và cuộn để thu phóng. Nút Chân trời thêm đường chân trời minh họa. Bảng bên trái hiển thị ảnh quan sát hồng ngoại của mục tiêu vào các ngày khác nhau. Hãy chuyển qua từng ảnh để xem điều gì thay đổi.' : <>You are looking out from the center of the celestial sphere. Drag to look around the SPHEREx infrared all-sky map (it follows the detector you pick) and scroll to zoom.
          The Ground button adds an illustrated horizon. The panel on the left shows SPHEREx infrared
          observations of the selected target, taken on different dates. Step through them to see what changed.</>}
        </p>
        <p className="caption">
          {vi ? 'Bản đồ và ảnh SPHEREx đến từ các kính thiên văn và thời điểm khác nhau. Ngày quan sát hiển thị chỉ thuộc về ảnh SPHEREx.' : 'The map and the SPHEREx images come from different telescopes and dates. The observation date shown belongs only to the SPHEREx image.'}
        </p>
        <h3 className="help__sub">{vi ? 'Phím tắt' : 'Keyboard'}</h3>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([k, d], i) => (
              <tr key={k}>
                <th scope="row">
                  <kbd>{k}</kbd>
                </th>
                <td><EyesCopy alternate={vi ? d : translations[i]}>{vi ? translations[i] : d}</EyesCopy></td>
              </tr>
            ))}
          </tbody>
        </table>
    </dialog>
  )
}
