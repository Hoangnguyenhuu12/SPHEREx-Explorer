import { useId, useState, type CSSProperties } from 'react'

export interface Step {
  title: string
  body: string
}

/**
 * "How it works" steps. With a mouse or trackpad (`reveal`), titles stay visible and only the
 * selected step shows its text: hovering or focusing a number or title selects it, and the
 * selection stays when the pointer leaves, so moving between columns never blinks. Text is only
 * faded, never removed, so screen readers read every step and the layout never shifts.
 * Touch screens (`reveal` false) show every step's text.
 */
export function HowItWorksSteps({ steps, reveal }: { steps: readonly Step[]; reveal: boolean }) {
  const [active, setActive] = useState(0)
  const uid = useId()
  return (
    <ol className="steps" data-reveal={reveal || undefined} style={{ '--active': active } as CSSProperties}>
      {steps.map((s, i) => {
        const select = () => setActive(i)
        return (
          <li
            key={s.title}
            className={`step${i === active ? ' is-active' : ''}${i < active ? ' is-reached' : ''}`}
            aria-current={reveal && i === active ? 'step' : undefined}
          >
            <span className="step__num" aria-hidden onPointerEnter={select}>
              {i + 1}
            </span>
            <h3 className="step__title">
              <button type="button" className="step__trigger" onPointerEnter={select} onFocus={select} onClick={select} aria-describedby={`${uid}-${i}`}>
                {s.title}
              </button>
            </h3>
            <p id={`${uid}-${i}`} className="step__body">
              {s.body}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
