import { Link } from 'react-router'
import { PATHS } from '../app/config'
import { PageShell } from '../shared/layout/Shell'

export default function NotFoundPage() {
  return (
    <PageShell>
      <section className="wrap" style={{ paddingBlock: 'var(--space-9)', minHeight: '60vh' }}>
        <h1>Page not found</h1>
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--muted)' }}>This address does not lead anywhere in SPHEREx Explorer.</p>
        <p style={{ marginTop: 'var(--space-5)' }}>
          <Link className="btn btn-primary" to={PATHS.home}>
            Go to the home page
          </Link>
        </p>
      </section>
    </PageShell>
  )
}
