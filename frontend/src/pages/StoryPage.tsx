import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { PATHS } from '../app/config'
import { Artwork } from '../features/artwork/Artwork'
import { DETECTORS, TARGETS } from '../shared/config/targets'
import { TEAM, TEAM_NAME } from '../shared/config/team'
import { PageShell } from '../shared/layout/Shell'
import './story/story.css'

const SECTIONS = [
  { id: 'project', title: 'Project and team' },
  { id: 'problem', title: 'Problem and users' },
  { id: 'solution', title: 'Proposed solution' },
  { id: 'data', title: 'NASA data' },
  { id: 'validation', title: 'Validation and impact' },
  { id: 'next', title: 'Next steps' },
] as const

function Status({ kind }: { kind: 'planned' | 'built' | 'pending' }) {
  const label = kind === 'planned' ? 'Planned' : kind === 'built' ? 'Built' : 'Results pending'
  return <span className={`status status--${kind}`}>{label}</span>
}

/** Small explanatory diagram: why a moving star becomes a bright-and-dark pair. */
function DifferenceDiagram() {
  const cell = (x: number, label: string, children: React.ReactNode) => (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="0" width="150" height="150" rx="4" fill="#000" stroke="#2A2A38" />
      {children}
      <text x="75" y="176" textAnchor="middle" className="diagram-label">
        {label}
      </text>
    </g>
  )
  return (
    <figure className="diagram">
      <svg viewBox="0 0 560 190" role="img" aria-label="Diagram: first observation, later observation, and their difference showing a dark spot where the star was and a bright spot where it is now">
        {cell(
          0,
          'First date',
          <>
            <circle cx="40" cy="40" r="5" fill="#FFF3D6" />
            <circle cx="112" cy="104" r="4" fill="#FFF3D6" />
            <circle cx="70" cy="82" r="7" fill="#F4EF83" />
          </>,
        )}
        <text x="168" y="80" className="diagram-op">−</text>
        {cell(
          190,
          'Later date',
          <>
            <circle cx="40" cy="40" r="5" fill="#FFF3D6" />
            <circle cx="112" cy="104" r="4" fill="#FFF3D6" />
            <circle cx="82" cy="68" r="7" fill="#F4EF83" />
          </>,
        )}
        <text x="358" y="80" className="diagram-op">=</text>
        {cell(
          380,
          'Difference',
          <>
            <rect x="0" y="0" width="150" height="150" rx="4" fill="#808080" />
            <circle cx="70" cy="82" r="7" fill="#1a1a1a" />
            <circle cx="82" cy="68" r="7" fill="#ffffff" />
          </>,
        )}
      </svg>
      <figcaption className="caption">
        Stars that stay put cancel out to grey. A star that moved leaves a dark spot where it was and a bright spot where it is now.
      </figcaption>
    </figure>
  )
}

export default function StoryPage() {
  return (
    <PageShell>
      <header className="story-head">
        <Artwork variant="corner" className="story-head__art" />
        <div className="wrap">
          <p className="eyebrow">The story</p>
          <h1 className="story-head__title">Making a space telescope’s sky something you can watch</h1>
          <p className="story-head__lead">
            Why we built SPHEREx Explorer, how it turns archive images into something anyone can read, which NASA data it uses,
            and what we still have to prove.
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
          <section id="project" className="chapter">
            <p className="chapter__num">01</p>
            <h2>Project and team</h2>
            <p>
              SPHEREx Explorer is a web tool made by team {TEAM_NAME} for the NASA Space Apps 2026 SPHEREx Sky Viewer challenge. The
              challenge asks for a way to browse SPHEREx images by position and to see how the sky changes between observations.
              Our answer is a sky map you can pan like a planetarium, with a player that shows SPHEREx images of a chosen target
              in date order.
            </p>
            <p>
              We are six people with different jobs, working in one shared repository with small pull requests and a written API
              contract between the image service and the website.
            </p>
            <ul className="plain-list">
              {TEAM.map((m) => (
                <li key={m.name}>
                  <strong>{m.name}</strong> — {m.role}
                </li>
              ))}
            </ul>
            <h3 className="chapter__sub">How the work is split</h3>
            <p>
              Data flows through the team the same way it flows through the product: archive search and cutouts, then image
              alignment and measurements, then the API, then the interface. Each hand-off has a written format, so the website can
              be built against example data while the pipeline is still being finished.
            </p>
          </section>

          <section id="problem" className="chapter">
            <p className="chapter__num">02</p>
            <h2>Problem and users</h2>
            <p>
              NASA’s SPHEREx telescope maps the whole sky in 102 infrared colours, and repeats the map about every six months.
              Repeated maps of the same sky are exactly what you need to catch things that move or change. The data is public,
              but using it means several steps that stop most people:
            </p>
            <ul className="plain-list">
              <li>
                <strong>Finding the images.</strong> Archive queries work by coordinates and collections, and a full SPHEREx image is
                hundreds of megabytes, so you need cutouts.
              </li>
              <li>
                <strong>Reading the files.</strong> Images come as FITS files with several layers: the picture, quality flags, noise
                estimates and wavelength maps.
              </li>
              <li>
                <strong>Lining them up.</strong> Each exposure is rotated differently on the sky. Before two dates can be compared they
                must be reprojected onto one common grid.
              </li>
              <li>
                <strong>Knowing where to look.</strong> Fast stars are not where old catalogues put them; their position has to be
                moved forward to the date of each image.
              </li>
            </ul>
            <h3 className="chapter__sub">Who it is for</h3>
            <ul className="plain-list">
              <li>
                <strong>Students and teachers</strong> who want to show that stars really move, with real telescope images instead of
                a diagram.
              </li>
              <li>
                <strong>Astronomy enthusiasts</strong> who know the sky but not archive tools.
              </li>
              <li>
                <strong>Judges and reviewers</strong> who need to see quickly what the data shows and how honest the presentation is.
              </li>
            </ul>
            <p>None of them should need to know what a FITS header is.</p>
          </section>

          <section id="solution" className="chapter">
            <p className="chapter__num">03</p>
            <h2>Proposed solution</h2>
            <p>The site has four pages that lead into one working space:</p>
            <ul className="plain-list">
              <li>
                <strong>Home</strong> explains the idea in one screen.
              </li>
              <li>
                <strong>Story</strong> (this page) explains the method and the data.
              </li>
              <li>
                <strong>Where are you</strong> starts from Earth, a reminder that every observation is taken from our neighbourhood.
              </li>
              <li>
                <strong>The Eyes</strong> is the tool itself.
              </li>
            </ul>
            <h3 className="chapter__sub">Inside The Eyes</h3>
            <ul className="plain-list">
              <li>
                A real sky map (Aladin Lite with the DSS2 colour survey), with an RA/Dec grid, a horizon to give a sense of
                standing on Earth, and an optional view of the sky turning as the Earth rotates. <Status kind="built" />
              </li>
              <li>
                Five featured targets and a search box that accepts star names or coordinates in degrees or hours, minutes and
                seconds. <Status kind="built" />
              </li>
              <li>
                A player that steps through SPHEREx images of the target in date order. The observation date, detector and
                wavelength are always visible, and a crosshair marks where the star is predicted to be on that date.{' '}
                <Status kind="built" />
              </li>
              <li>
                A difference view that subtracts the first observation from each later one. <Status kind="built" />
              </li>
              <li>
                Charts of position and brightness over time with error bars, quality flags, a spectrum at any clicked point, a
                false-colour view from three detectors, Gaia DR3 stars on the map, and a share or embed link. <Status kind="built" />
              </li>
              <li>
                Connection to the team’s image service for real cutouts of all five targets. <Status kind="pending" />
              </li>
            </ul>
            <DifferenceDiagram />
            <h3 className="chapter__sub">What happens behind the player</h3>
            <ol className="plain-list">
              <li>The service asks the NASA/IPAC archive for SPHEREx images that cover the position and detector.</li>
              <li>It cuts out a small square around the target instead of downloading whole images.</li>
              <li>Each cutout is reprojected onto one common grid of 6.15-arcsecond pixels, north up.</li>
              <li>All frames are scaled with the same brightness stretch, so a change in brightness is not an artefact of display.</li>
              <li>The target’s catalogue position is moved forward by its proper motion to each observation date.</li>
              <li>The website receives the frames in date order and plays them; zooming and panning happen in the browser.</li>
            </ol>
            <p className="note">
              Until the image service is connected, the player shows generated pictures marked “Illustrative demo”. They show how
              the tool works, not what SPHEREx saw.
            </p>
          </section>

          <section id="data" className="chapter">
            <p className="chapter__num">04</p>
            <h2>NASA data</h2>
            <p>
              SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) launched on 11
              March 2025 and began its sky survey on 1 May 2025. It orbits Earth on a polar, Sun-synchronous path and scans the sky
              in strips, completing a full map about every six months. Its science goals are to study the first moments after the
              Big Bang through the large-scale pattern of galaxies, to measure how much light galaxies have produced over cosmic
              history, and to map water and other ices in the clouds where stars and planets form.
            </p>
            <p>
              The telescope records light from 0.75 to 5 micrometres on six detectors. Special filters change colour across each
              detector, so as the sky drifts past, every point is seen in many colours; together they make 102 spectral channels.
              Pixels are about 6.15 arcseconds across. Data is released through the NASA/IPAC Infrared Science Archive (IRSA).
            </p>
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
            <h3 className="chapter__sub">Reading the images honestly</h3>
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
            <h3 className="chapter__sub">Other sources</h3>
            <ul className="plain-list">
              <li>Target positions and motions: SIMBAD (CDS), epoch J2000.</li>
              <li>Background sky map: Digitized Sky Survey (DSS2 colour), served as HiPS by CDS and mirrors, shown with Aladin Lite.</li>
              <li>Catalogue stars on the map: ESA Gaia DR3 via VizieR.</li>
              <li>Earth imagery on the “Where are you” page: NASA Blue Marble.</li>
            </ul>
          </section>

          <section id="validation" className="chapter">
            <p className="chapter__num">05</p>
            <h2>Validation and impact</h2>
            <p>
              <Status kind="pending" /> We report results here only after checking them on real SPHEREx observations. The checks we
              plan are:
            </p>
            <ul className="plain-list">
              <li>Stars that should not move stay within one pixel between dates, which shows the images are aligned.</li>
              <li>The predicted-position crosshair sits on the target in every frame.</li>
              <li>Barnard’s Star shows a clear bright-and-dark pair in the difference view across a year.</li>
              <li>Brightness changes of RW Aurigae and R Draconis are measured with error bars and quality flags.</li>
            </ul>
            <h3 className="chapter__sub">How we test the website</h3>
            <ul className="plain-list">
              <li>Automated tests cover coordinate parsing, links that share a view, the player, and image geometry.</li>
              <li>Each page is checked in a browser at common laptop sizes, with the keyboard only and with reduced motion.</li>
              <li>The website has been run against the team’s API with example SPHEREx cutouts.</li>
            </ul>
            <p>Impact will be judged by whether a first-time visitor can find and describe a change without help.</p>
          </section>

          <section id="next" className="chapter">
            <p className="chapter__num">06</p>
            <h2>Next steps</h2>
            <ul className="plain-list">
              <li>Connect the image service and verify all five targets on real data. <Status kind="planned" /></li>
              <li>Add more observations as new SPHEREx sky passes are released. <Status kind="planned" /></li>
              <li>Draw measured positions on the image when the service provides them. <Status kind="planned" /></li>
              <li>Let visitors save and compare their own targets. <Status kind="planned" /></li>
              <li>Improve the experience on phones and tablets. <Status kind="planned" /></li>
            </ul>
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
