import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

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
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div ref={ref} className="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
  )
}
