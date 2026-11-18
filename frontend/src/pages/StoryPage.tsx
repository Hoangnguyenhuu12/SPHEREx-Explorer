import { Link } from 'react-router'
import { PATHS } from '../app/config'
import { Artwork } from '../features/artwork/Artwork'
import { DETECTORS, TARGETS } from '../shared/config/targets'
import { TEAM_NAME } from '../shared/config/team'
import { useLanguage, type Language } from '../shared/i18n/language'
import { StableLabel } from '../shared/i18n/StableLabel'
import { STORY_COPY } from '../shared/i18n/storyTranslations'
import { PageShell } from '../shared/layout/Shell'
import { ColourDiagram, DifferenceDiagram, MotionDiagram, SurveyTimeline } from './story/diagrams'
import { ShootingStarLink } from './story/ShootingStarLink'
import { ShootingStars } from './story/ShootingStars'
import { TeamGrid } from './story/TeamGrid'
import { StableCopy } from './story/StableCopy'
import './story/story.css'

function Status({ kind, label }: { kind: 'planned' | 'built' | 'pending'; label: string }) {
  return <span className={`status status--${kind}`}>{label}</span>
}

function ToolbarItem({ kind, lang }: { kind: 'radec' | 'gaia' | 'surveys' | 'nav'; lang: Language }) {
  if (lang === 'vi') {
    switch (kind) {
      case 'radec':
        return (
          <>
            <strong>RA/Dec</strong> vẽ lưới tọa độ bầu trời. <strong>Ground</strong> thêm đường chân trời, còn{' '}
            <strong>Sky motion</strong> cho thấy bầu trời xoay dần theo vòng tự quay của Trái Đất.
          </>
        )
      case 'gaia':
        return (
          <>
            <strong>Gaia stars</strong> đánh dấu các ngôi sao tham chiếu từ sứ mệnh Gaia của ESA ngay trên bản đồ.
          </>
        )
      case 'surveys':
        return (
          <>
            <strong>SPHEREx DR1</strong> và <strong>WISE</strong> dùng để đổi lớp ảnh nền toàn bầu trời.
          </>
        )
      case 'nav':
        return (
          <>
            <strong>Center</strong>, <strong>−</strong> và <strong>+</strong> giúp căn giữa và thu phóng bản đồ; nút mở rộng bật
            chế độ toàn màn hình.
          </>
        )
    }
  }
  switch (kind) {
    case 'radec':
      return (
        <>
          <strong>RA/Dec</strong> draws the sky’s coordinate grid. <strong>Ground</strong> adds a horizon, and{' '}
          <strong>Sky motion</strong> shows the sky turning as the Earth rotates.
        </>
      )
    case 'gaia':
      return (
        <>
          <strong>Gaia stars</strong> marks catalogue stars from ESA’s Gaia mission on the map.
        </>
      )
    case 'surveys':
      return (
        <>
          <strong>SPHEREx DR1</strong> and <strong>WISE</strong> switch the background picture of the whole sky.
        </>
      )
    case 'nav':
      return (
        <>
          <strong>Center</strong>, <strong>−</strong> and <strong>+</strong> move and zoom the map; the expand button goes full
          screen.
        </>
      )
  }
}

export default function StoryPage() {
  const { lang } = useLanguage()
  const t = STORY_COPY[lang]
  const otherT = STORY_COPY[lang === 'en' ? 'vi' : 'en']
  const movers = TARGETS.filter((target) => target.change === 'motion').map((target) => t.targets[target.key].name)
  const changers = TARGETS.filter((target) => target.change === 'brightness').map((target) => t.targets[target.key].name)
  const headerAction = (
    <ShootingStarLink size="compact" label={t.headerActionLabel} altLabel={otherT.headerActionLabel} />
  )

  return (
    <PageShell headerActions={headerAction}>
      <ShootingStars />
      <header className="story-head">
        <Artwork variant="corner" className="story-head__art" />
        <div className="wrap">
          <p className="eyebrow"><StableCopy alternate={otherT.eyebrow}>{t.eyebrow}</StableCopy></p>
          <h1 className="story-head__title"><StableCopy alternate={otherT.title}>{t.title}</StableCopy></h1>
          <p className="story-head__lead"><StableCopy alternate={otherT.lead}>{t.lead}</StableCopy></p>
          <ol className="flow-trail" aria-label={t.flowTrailLabel}>
            <li>
              <Link to={PATHS.home}><StableLabel text={t.flowHome} alt={otherT.flowHome} /></Link>
            </li>
            <li aria-current="step">
              <span className="flow-trail__here"><StableLabel text={t.flowStory} alt={otherT.flowStory} /></span> <span className="flow-trail__tag"><StableLabel text={t.flowHereTag} alt={otherT.flowHereTag} /></span>
            </li>
            <li>
              <Link to={PATHS.entry} className="flow-trail__next">
                <StableLabel text={t.flowOrbit} alt={otherT.flowOrbit} />
              </Link>{' '}
              <span className="flow-trail__tag"><StableLabel text={t.flowNextTag} alt={otherT.flowNextTag} /></span>
            </li>
            <li><StableLabel text={t.flowEyes} alt={otherT.flowEyes} /></li>
          </ol>
        </div>
      </header>

      <div className="wrap story">
        <nav className="story-toc" aria-label={t.tocLabel}>
          <ol>
            {t.sections.map((s, i) => (
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
            <h2><StableCopy alternate={otherT.sections[0].title}>{t.sections[0].title}</StableCopy></h2>
            <p><StableCopy alternate={otherT.purposeIntro}>{t.purposeIntro}</StableCopy></p>
            <ul className="plain-list">
              <li>
                <StableCopy alternate={<><strong>{otherT.purposeSeeMove}</strong> {TARGETS.filter((target) => target.change === 'motion').map((target) => otherT.targets[target.key].name).join(', ')}.</>}><strong>{t.purposeSeeMove}</strong> {movers.join(', ')}.</StableCopy>
              </li>
              <li>
                <StableCopy alternate={<><strong>{otherT.purposeSeeBrightness}</strong> {TARGETS.filter((target) => target.change === 'brightness').map((target) => otherT.targets[target.key].name).join(', ')}.</>}><strong>{t.purposeSeeBrightness}</strong> {changers.join(', ')}.</StableCopy>
              </li>
              <li>
                <StableCopy alternate={<><strong>{otherT.purposeLookAnywhereLabel}</strong> {otherT.purposeLookAnywhereBody}</>}><strong>{t.purposeLookAnywhereLabel}</strong> {t.purposeLookAnywhereBody}</StableCopy>
              </li>
            </ul>
            <h3 className="chapter__sub"><StableCopy alternate={otherT.whoTitle}>{t.whoTitle}</StableCopy></h3>
            <ul className="plain-list">
              {t.whoItems.map((item, i) => (
                <li key={item.label}>
                  <StableCopy alternate={<><strong>{otherT.whoItems[i].label}</strong> {otherT.whoItems[i].body}</>}><strong>{item.label}</strong> {item.body}</StableCopy>
                </li>
              ))}
            </ul>
          </section>

          <section id="how" className="chapter">
            <p className="chapter__num">02</p>
            <h2><StableCopy alternate={otherT.sections[1].title}>{t.sections[1].title}</StableCopy></h2>
            <p>
              <StableCopy alternate={<>{otherT.howIntroPrefix}<strong>{otherT.howIntroOrbit}</strong>{otherT.howIntroMiddle}<strong>{otherT.howIntroEyes}</strong>{otherT.howIntroSuffix}</>}>
              {t.howIntroPrefix}
              <strong>{t.howIntroOrbit}</strong>
              {t.howIntroMiddle}
              <strong>{t.howIntroEyes}</strong>
              {t.howIntroSuffix}
              </StableCopy>
            </p>
            <ol className="steps" aria-label={t.stepsLabel}>
              {t.steps.map((s, i) => (
                <li key={i} className="step">
                  <span className="step__num" aria-hidden>
                    {i + 1}
                  </span>
                  <strong className="step__title"><StableCopy alternate={otherT.steps[i].title}>{s.title}</StableCopy></strong>
                  <span className="step__text"><StableCopy alternate={otherT.steps[i].text}>{s.text}</StableCopy></span>
                </li>
              ))}
            </ol>
            <h3 className="chapter__sub"><StableCopy alternate={otherT.toolbarTitle}>{t.toolbarTitle}</StableCopy></h3>
            <ul className="plain-list">
              {t.toolbarItems.map((item) => (
                <li key={item.kind}>
                  <StableCopy alternate={<ToolbarItem kind={item.kind} lang={lang === 'en' ? 'vi' : 'en'} />}><ToolbarItem kind={item.kind} lang={lang} /></StableCopy>
                </li>
              ))}
            </ul>
            <p className="note"><StableCopy alternate={otherT.illustrativeNote}>{t.illustrativeNote}</StableCopy></p>
            <p className="story-cta">
              <ShootingStarLink
                label={t.headerActionLabel}
                altLabel={otherT.headerActionLabel}
                hint={t.howCtaHint}
                altHint={otherT.howCtaHint}
              />
            </p>
          </section>

          <section id="science" className="chapter">
            <p className="chapter__num">03</p>
            <h2><StableCopy alternate={otherT.sections[2].title}>{t.sections[2].title}</StableCopy></h2>
            <p><StableCopy alternate={otherT.scienceIntro}>{t.scienceIntro}</StableCopy></p>
            <h3 className="chapter__sub"><StableCopy alternate={otherT.scienceSubs[0]}>{t.scienceSubs[0]}</StableCopy></h3>
            <ColourDiagram />
            <h3 className="chapter__sub"><StableCopy alternate={otherT.scienceSubs[1]}>{t.scienceSubs[1]}</StableCopy></h3>
            <MotionDiagram />
            <h3 className="chapter__sub"><StableCopy alternate={otherT.scienceSubs[2]}>{t.scienceSubs[2]}</StableCopy></h3>
            <DifferenceDiagram />
            <h3 className="chapter__sub"><StableCopy alternate={otherT.scienceSubs[3]}>{t.scienceSubs[3]}</StableCopy></h3>
            <SurveyTimeline />
            <p className="note"><StableCopy alternate={otherT.scienceNote}>{t.scienceNote}</StableCopy></p>
          </section>

          <section id="honest" className="chapter">
            <p className="chapter__num">04</p>
            <h2>{t.sections[3].title}</h2>
            <ul className="plain-list">
              {t.honestItems.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong> {item.body}
                </li>
              ))}
            </ul>
            <h3 className="chapter__sub">{t.detectorsTitle}</h3>
            <table className="data-table">
              <caption className="sr-only">{t.detectorsCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.detectorHeaders[0]}</th>
                  <th scope="col">{t.detectorHeaders[1]}</th>
                  <th scope="col">{t.detectorHeaders[2]}</th>
                </tr>
              </thead>
              <tbody>
                {DETECTORS.map((d) => (
                  <tr key={d.id}>
                    <th scope="row">D{d.id}</th>
                    <td className="num">{d.range}</td>
                    <td>{t.detectorBands[d.label as keyof typeof t.detectorBands] ?? d.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="chapter__sub">{t.targetsTitle}</h3>
            <div className="targets-grid">
              {TARGETS.map((target) => {
                const localized = t.targets[target.key]
                return (
                  <article key={target.key} className="target-note">
                    <h4><StableCopy alternate={otherT.targets[target.key].name}>{localized.name}</StableCopy></h4>
                    <p className="caption">
                      <StableCopy alternate={<>{otherT.targets[target.key].kind} · {otherT.targets[target.key].distance}</>}>{localized.kind} · {localized.distance}</StableCopy>
                    </p>
                    <p><StableCopy alternate={otherT.targets[target.key].description}>{localized.description}</StableCopy></p>
                    <p className="target-note__look">
                      <StableCopy alternate={<><strong>{target.change === 'motion' ? otherT.targetMotionTag : otherT.targetBrightnessTag}</strong> {otherT.targets[target.key].lookFor}</>}><strong>{target.change === 'motion' ? t.targetMotionTag : t.targetBrightnessTag}</strong> {localized.lookFor}</StableCopy>
                    </p>
                  </article>
                )
              })}
            </div>
            <h3 className="chapter__sub">{t.dataSourcesTitle}</h3>
            <ul className="plain-list">
              {t.dataSources.map((src) => (
                <li key={src}>{src}</li>
              ))}
            </ul>
            <p>
              <Status kind="pending" label={t.statusLabels.pending} /> {t.pendingResultsNote}
            </p>
          </section>

          <section id="about" className="chapter">
            <p className="chapter__num">05</p>
            <h2>{t.sections[4].title}</h2>
            <p>{t.aboutIntro(TEAM_NAME)}</p>
            <TeamGrid />
            <p className="story-cta">
              <ShootingStarLink
                label={t.aboutCtaLabel}
                altLabel={otherT.aboutCtaLabel}
                hint={t.aboutCtaHint}
                altHint={otherT.aboutCtaHint}
              />
            </p>
          </section>
        </article>
      </div>
    </PageShell>
  )
}
