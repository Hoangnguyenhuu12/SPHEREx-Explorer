import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const TUTORIAL_KEY = 'spherex-explorer.tutorial.v1'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === 'done'
  } catch {
    return false
  }
}

export function Tutorial({ hidden }: { hidden: boolean }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  if (dismissed || hidden) return null
  const done = () => {
    setDismissed(true)
    try {
      localStorage.setItem(TUTORIAL_KEY, 'done')
    } catch {
      /* private mode: keep it dismissed for this visit only */
    }
  }
  return (
    <section className="tutorial" aria-label="How to use The Eyes">
      <h2 className="tutorial__title">Three steps</h2>
      <ol>
        <li>
          <strong>Choose a target</strong> from the buttons above, or search a name or coordinates.
        </li>
        <li>
          <strong>Press Play</strong> to step through the SPHEREx observations.
        </li>
        <li>
          <strong>Compare the dates.</strong> Look for a star that shifts or changes brightness.
        </li>
      </ol>
      <button type="button" className="btn btn-primary" onClick={done}>
        Got it
      </button>
    </section>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause the observations'],
  ['← / →', 'Previous or next observation'],
  ['D', 'Switch Original / Difference'],
  ['G', 'Show or hide the RA/Dec grid'],
  ['M', 'Turn sky motion on or off'],
  ['C', 'Center the map on the target'],
  ['Esc', 'Close the target details'],
  ['+ / − / 0', 'Zoom or fit the image (when the image has focus)'],
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
          You are standing on Earth looking up. The map is a visible-light sky survey (DSS2) that you can pan and zoom; the
          ground at the bottom and the sky motion are illustrations to help you find your way. The panel on the left shows SPHEREx infrared
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
