import { GraduationCap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useGuide } from './guide-state'
import './guide.css'

export function GuideToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="guide-toggle"
      aria-pressed={on}
      title={`${on ? 'Hide' : 'Show'} the on-screen guide (T)`}
      onClick={() => onChange(!on)}
    >
      <GraduationCap aria-hidden />
      <span>Guide</span>
      <span className="guide-toggle__state">{on ? 'On' : 'Off'}</span>
    </button>
  )
}

/** A short hint placed right after the control it explains; renders nothing while the guide is off. */
export function GuideNote({ step, children, className }: { step?: number; children: ReactNode; className?: string }) {
  const on = useGuide()
  if (!on) return null
  return (
    <p className={`guide-note${className ? ` ${className}` : ''}`}>
      {step !== undefined && (
        <span className="guide-note__step" aria-label={`Step ${step}`}>
          {step}
        </span>
      )}
      <span>{children}</span>
    </p>
  )
}
