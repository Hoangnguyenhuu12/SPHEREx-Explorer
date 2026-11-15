import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { PATHS } from '../app/config'
import { Artwork } from '../features/artwork/Artwork'
import { DETECTORS, TARGETS } from '../shared/config/targets'
import { TEAM_NAME } from '../shared/config/team'
import { PageShell } from '../shared/layout/Shell'
import { ColourDiagram, DifferenceDiagram, MotionDiagram, SurveyTimeline } from './story/diagrams'
import { ShootingStars } from './story/ShootingStars'
import { TeamGrid } from './story/TeamGrid'
import './story/story.css'

const SECTIONS = [
  { id: 'purpose', title: 'What you can do here' },
  { id: 'how', title: 'How to use it' },
  { id: 'science', title: 'The science, in pictures' },
  { id: 'honest', title: 'Reading it honestly' },
  { id: 'about', title: 'About us' },
] as const

const STEPS = [
  { title: 'Pick a star', text: 'Choose a featured target, or type a star name or coordinates.' },
  { title: 'Press Play', text: 'SPHEREx images of that spot step through in date order.' },
  { title: 'Compare the dates', text: 'Look for a star that shifts or changes brightness, or switch to the Difference view.' },
  { title: 'Read the notes', text: 'Check the date, detector and wavelength of each image, and the charts and quality flags.' },
] as const

function Status({ kind }: { kind: 'planned' | 'built' | 'pending' }) {
  const label = kind === 'planned' ? 'Planned' : kind === 'built' ? 'Built' : 'Results pending'
  return <span className={`status status--${kind}`}>{label}</span>
}

export default function StoryPage() {
  const movers = TARGETS.filter((t) => t.change === 'motion').map((t) => t.name)
  const changers = TARGETS.filter((t) => t.change === 'brightness').map((t) => t.name)

  return (
    <PageShell>
      <ShootingStars />
      <header className="story-head">
        <Artwork variant="corner" className="story-head__art" />
        <div className="wrap">
          <p className="eyebrow">The story</p>
          <h1 className="story-head__title">Watch the sky change, with NASA’s newest infrared telescope</h1>
          <p className="story-head__lead">
            What SPHEREx Explorer is for, how to use it in four steps, the science behind what you see, and the people who
            built it.
          </p>
        </div>
      </header>

      <div className="wrap story">
        <nav className="story-toc" aria-label="Sections">
          <ol>
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>
                  <span className="num">{String(i + 1).padStart(2, '0')}</span> {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="story-body">
          <section id="purpose" className="chapter">
            <p className="chapter__num">01</p>
            <h2>What you can do here</h2>
            <p>
              SPHEREx Explorer shows real NASA SPHEREx infrared images of a small patch of sky in date order, so you can see a
              nearby star creep across the background or change in brightness. No data files, no code, no astronomy degree.
            </p>
            <ul className="plain-list">
              <li>
                <strong>See a star move:</strong> {movers.join(', ')}.
              </li>
              <li>
                <strong>See a star change brightness:</strong> {changers.join(', ')}.
              </li>
              <li>
                <strong>Look anywhere:</strong> type any star name or coordinates and find it on the sky map.
              </li>
            </ul>
            <h3 className="chapter__sub">Who it is for</h3>
            <ul className="plain-list">
              <li>
                <strong>Students and teachers:</strong> show that stars really move, with real telescope images instead of a
                drawing.
              </li>
              <li>
                <strong>Sky fans:</strong> explore NASA’s archive without learning archive tools or reading FITS files.
              </li>
              <li>
                <strong>Judges and reviewers:</strong> see quickly what the data shows, and where its limits are.
              </li>
            </ul>
          </section>

          <section id="how" className="chapter">
            <p className="chapter__num">02</p>
            <h2>How to use it</h2>
            <p>Everything happens on one page, The Eyes. A first visit takes about a minute:</p>
            <ol className="steps" aria-label="Four steps to use The Eyes">
              {STEPS.map((s, i) => (
                <li key={s.title} className="step">
                  <span className="step__num" aria-hidden>
                    {i + 1}
                  </span>
                  <strong className="step__title">{s.title}</strong>
                  <span className="step__text">{s.text}</span>
                </li>
              ))}
            </ol>
            <h3 className="chapter__sub">The toolbar at the bottom of the map</h3>
            <ul className="plain-list">
              <li>
                <strong>RA/Dec</strong> draws the sky’s coordinate grid. <strong>Ground</strong> adds a horizon, and{' '}
                <strong>Sky motion</strong> shows the sky turning as the Earth rotates.
              </li>
              <li>
                <strong>Gaia stars</strong> marks catalogue stars from ESA’s Gaia mission on the map.
              </li>
              <li>
                <strong>SPHEREx DR1</strong> and <strong>WISE</strong> switch the background picture of the whole sky.
              </li>
              <li>
                <strong>Center</strong>, <strong>−</strong> and <strong>+</strong> move and zoom the map; the expand button goes
                full screen.
              </li>
            </ul>
            <p className="note">
              Images marked “Illustrative demo” are generated to show how the tool works. They are not what SPHEREx saw.
            </p>
            <p>
              <Link to={PATHS.explorer} className="btn btn-primary">
                Try it in The Eyes <ArrowRight aria-hidden />
              </Link>
            </p>
          </section>

          <section id="science" className="chapter">
            <p className="chapter__num">03</p>
            <h2>The science, in pictures</h2>
            <p>
              SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) is a NASA
              telescope that maps the whole sky in infrared light. Four ideas are enough to read what you see in The Eyes.
            </p>
            <h3 className="chapter__sub">1. It sees the sky in 102 colours</h3>
            <ColourDiagram />
            <h3 className="chapter__sub">2. Nearby stars drift against distant ones</h3>
            <MotionDiagram />
            <h3 className="chapter__sub">3. Blinking and subtracting reveal the change</h3>
            <DifferenceDiagram />
            <h3 className="chapter__sub">4. It maps the whole sky about every six months</h3>
            <SurveyTimeline />
            <p className="note">
              Behind the player, small cutouts are taken from the NASA/IPAC Infrared Science Archive (IRSA), lined up on one
              grid of 6.15-arcsecond pixels, shown with the same brightness scale, and the target’s catalogue position is
              moved forward to each date. That is why a change you see comes from the sky, not from the display.
            </p>
          </section>

          <section id="honest" className="chapter">
            <p className="chapter__num">04</p>
            <h2>Reading it honestly</h2>
            <ul className="plain-list">
              <li>
                <strong>Small steps.</strong> Barnard’s Star moves about 10 arcseconds a year, under two SPHEREx pixels. Changes
                need observations months apart to show.
              </li>
              <li>
                <strong>Few dates.</strong> With one map every six months, a target may have only a handful of observations so far.
              </li>
              <li>
                <strong>Bright stars saturate.</strong> The centre of a very bright star can stop counting and look flat.
              </li>
              <li>
                <strong>Wavelength matters.</strong> Two frames at different wavelengths can differ in brightness without the star
                changing.
              </li>
            </ul>
            <h3 className="chapter__sub">The six detectors</h3>
            <table className="data-table">
              <caption className="sr-only">SPHEREx detectors and wavelength ranges</caption>
              <thead>
                <tr>
                  <th scope="col">Detector</th>
                  <th scope="col">Wavelength</th>
                  <th scope="col">Band</th>
                </tr>
              </thead>
              <tbody>
                {DETECTORS.map((d) => (
                  <tr key={d.id}>
                    <th scope="row">D{d.id}</th>
                    <td className="num">{d.range}</td>
                    <td>{d.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="chapter__sub">The five featured targets</h3>
            <div className="targets-grid">
              {TARGETS.map((t) => (
                <article key={t.key} className="target-note">
                  <h4>{t.name}</h4>
                  <p className="caption">
                    {t.kind} · {t.distance}
                  </p>
                  <p>{t.description}</p>
                  <p className="target-note__look">
                    <strong>{t.change === 'motion' ? 'Shows motion.' : 'Shows brightness changes.'}</strong> {t.lookFor}
                  </p>
                </article>
              ))}
            </div>
            <h3 className="chapter__sub">Where the data comes from</h3>
            <ul className="plain-list">
              <li>SPHEREx images: NASA/IPAC Infrared Science Archive (IRSA).</li>
              <li>Background sky map: SPHEREx DR1 all-sky cube served by IRSA, shown with Aladin Lite (CDS).</li>
              <li>Catalogue stars: ESA Gaia DR3 via VizieR. Target positions and motions: SIMBAD.</li>
              <li>Earth imagery on “Where are you”: NASA Blue Marble.</li>
            </ul>
            <p>
              <Status kind="pending" /> We will report measured results here only after checking them on real SPHEREx
              observations.
            </p>
          </section>

          <section id="about" className="chapter">
            <p className="chapter__num">05</p>
            <h2>About us</h2>
            <p>
              We are team {TEAM_NAME}, six people who built SPHEREx Explorer for the NASA Space Apps 2026 SPHEREx Sky Viewer
              challenge.
            </p>
            <TeamGrid />
            <p className="story-cta">
              <Link to={PATHS.explorer} className="btn btn-primary btn-lg">
                Open The Eyes <ArrowRight aria-hidden />
              </Link>
            </p>
          </section>
        </article>
      </div>
    </PageShell>
  )
}
