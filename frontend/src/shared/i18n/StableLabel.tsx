/**
 * Reserves `max(text, alt)` inline width via `.bi-slot::after` so switching EN/VI
 * never shifts or resizes buttons, tabs, or navigation items under the user's pointer.
 */
export function StableLabel({ text, alt }: { text: string; alt: string }) {
  return (
    <span className="bi-slot" data-alt={alt}>
      {text}
    </span>
  )
}
