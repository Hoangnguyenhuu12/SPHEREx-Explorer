import { CheckCircle2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Short confirmation ("Report sent") announced politely, then fades away. */
export function useFlash(timeoutMs = 4000) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = useCallback(
    (text: string) => {
      setMessage(text)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setMessage(null), timeoutMs)
    },
    [timeoutMs],
  )
  useEffect(() => () => clearTimeout(timer.current), [])
  const node = (
    <div className="flash-region" role="status" aria-live="polite">
      {message && (
        <p className="flash">
          <CheckCircle2 aria-hidden />
          {message}
        </p>
      )}
    </div>
  )
  return { show, node }
}
