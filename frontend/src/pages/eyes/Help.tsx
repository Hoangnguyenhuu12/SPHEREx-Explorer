import { X } from 'lucide-react'
import { useRef } from 'react'
import { useModalDialog } from '../../shared/ui/useModalDialog'

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
  const ref = useRef<HTMLDialogElement>(null)
  const closedBy = useModalDialog(ref, onClose, { lightDismiss: true })
  return (
    <dialog ref={ref} className="modal help" {...({ closedby: closedBy } as Record<string, string>)} aria-labelledby="help-title">
        <div className="modal__head">
          <h2 id="help-title" className="help__title">
            How The Eyes works
          </h2>
          <button type="button" className="icon-btn" aria-label="Close help" onClick={onClose}>
            <X aria-hidden />
          </button>
        </div>
        <p>
          You are looking out from the center of the celestial sphere. Drag to look around the SPHEREx infrared all-sky map (it follows the detector you pick) and scroll to zoom.
          The Ground button adds an illustrated horizon. The panel on the left shows SPHEREx infrared
          observations of the selected target, taken on different dates. Step through them to see what changed.
        </p>
        <p className="caption">
          The map and the SPHEREx images come from different telescopes and dates. The observation date shown belongs only to the
          SPHEREx image.
        </p>
        <h3 className="help__sub">Keyboard</h3>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([k, d]) => (
              <tr key={k}>
                <th scope="row">
                  <kbd>{k}</kbd>
                </th>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
    </dialog>
  )
}
