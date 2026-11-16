import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, Info, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import { ApiError, describeError } from '../../shared/api/errors'
import type { FramesResponse } from '../../shared/api/types'
import { DETECTORS, type TargetInfo } from '../../shared/config/targets'
import { buildObservationsCsv, buildPythonSnippet, type ExperienceMode } from '../experience-mode/mode'
import { formatDecDms, formatDeg, formatRaHms } from '../target-search/coordinates'
import { ErrorBarChart, OffsetChart } from './charts'
import { formatInterval, formatShortDate, formatUtcDate } from './format'

export function DemoTag({ mode }: { mode?: string }) {
  if (mode !== 'mock') return null
  return (
    <span className="demo-tag">
      <Info size={14} aria-hidden /> Illustrative demo
    </span>
  )
}

function Pending({ label }: { label: string }) {
  return (
    <p className="panel-status" role="status">
      <Loader2 className="spin" size={16} aria-hidden /> {label}
    </p>
  )
}

function Failed({ error }: { error: unknown }) {
  const c = describeError(error)
  return (
    <div className="notice notice--warn" role="alert">
      <AlertTriangle aria-hidden />
      <div>
        <strong>{c.title}</strong>
        <p>{c.body}</p>
      </div>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="icon-btn icon-btn--sm"
      aria-label={done ? 'Copied' : label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
    </button>
  )
}

interface Common {
  target: TargetInfo | null
  coords: { ra: number; dec: number }
  detector: number
  data: FramesResponse | null
  activeIndex: number
  experienceMode?: ExperienceMode
}

export function OverviewPanel({ target, coords, data, experienceMode = 'explore' }: Common) {
  const frames = data?.frames ?? []
  const raText = formatRaHms(coords.ra)
  const decText = formatDecDms(coords.dec)
  return (
    <div className="panel">
      {target ? (
        <>
          <p>{target.description}</p>
          <div className="look-for">
            <h4>What to look for</h4>
            <p>{target.lookFor}</p>
            <p className="caption">A viewing tip, not a guaranteed result. Small movements may not be visible across these dates.</p>
          </div>
          {experienceMode === 'explore' ? (
            <div className="look-for" aria-label="Plain-language science guide">
              <h4>Why is this object special?</h4>
              <p>{target.funFact}</p>
              <dl className="facts">
                <div>
                  <dt>How fast it moves</dt>
                  <dd>{target.speedAnalogy}</dd>
                </div>
                <div>
                  <dt>How warm or cold it is</dt>
                  <dd>{target.temperatureAnalogy}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="look-for" aria-label="Catalog reference parameters">
              <h4>Catalog reference</h4>
              <dl className="facts">
                <div>
                  <dt>Proper motion ({target.epoch})</dt>
                  <dd className="num">
                    μ_α* = {target.pmRaCosDecMasYr.toLocaleString('en-US')} mas/yr · μ_δ = {target.pmDecMasYr.toLocaleString('en-US')} mas/yr
                  </dd>
                </div>
                <div>
                  <dt>Recommended channel</dt>
                  <dd className="num">D{target.recommendedDetector}</dd>
                </div>
                <div>
                  <dt>SIMBAD identifier</dt>
                  <dd className="num">{target.simbadId}</dd>
                </div>
              </dl>
            </div>
          )}
        </>
      ) : (
        <p>A custom position. Step through the observations and compare the stars between dates.</p>
      )}
      <dl className="facts">
        <div>
          <dt>Coordinates{target ? ` (catalog, ${target.epoch})` : ' (ICRS)'}</dt>
          <dd className="num">
            {raText} {decText} <CopyButton text={`${raText} ${decText}`} label="Copy sexagesimal coordinates" />
          </dd>
          <dd className="num caption">
            {formatDeg(coords.ra)}°, {formatDeg(coords.dec)}° <CopyButton text={`${coords.ra.toFixed(6)} ${coords.dec.toFixed(6)}`} label="Copy decimal coordinates" />
          </dd>
        </div>
        {target && (
          <div>
            <dt>Distance</dt>
            <dd>{target.distance}</dd>
          </div>
        )}
        <div>
          <dt>Observations shown</dt>
          <dd className="num">
            {frames.length === 0
              ? '—'
              : frames.length === 1
                ? `1 observation, ${formatUtcDate(frames[0].iso)}`
                : `${frames.length} observations, ${formatUtcDate(frames[0].iso)} to ${formatUtcDate(frames[frames.length - 1].iso)}`}
          </dd>
        </div>
      </dl>
      {target && (
        <p className="caption">
          The catalog position is for {target.epoch}.
        </p>
      )}
    </div>
  )
}

export function MotionPanel({ target, coords, detector, activeIndex, data, showTrail, setShowTrail }: Common & { showTrail: boolean; setShowTrail: (v: boolean) => void }) {
  const q = useQuery({
    queryKey: ['astrometry', config.useMock, coords.ra, coords.dec, detector, target?.key ?? null],
    queryFn: ({ signal }) => api.astrometry({ ra: coords.ra, dec: coords.dec, detector, targetKey: target?.key }, signal),
    staleTime: Infinity,
  })
  const pts = useMemo(() => {
    const res = q.data
    if (!res || !res.points.length) return []
    const first = res.points.find((p) => p.measured)?.measured
    if (!first) return []
    const cosd = Math.cos((first.dec * Math.PI) / 180)
    const off = (ra: number, dec: number) => ({ x: (ra - first.ra) * cosd * 3600, y: (dec - first.dec) * 3600 })
    const out: { x: number; y: number; err?: number; kind: 'measured'; active?: boolean; label: string }[] = []
    res.points.forEach((p, i) => {
      const date = formatUtcDate(p.mjd)
      const active = data ? Math.abs((data.frames[activeIndex]?.mjd ?? -1) - p.mjd) < 2 : i === activeIndex
      if (p.measured) out.push({ ...off(p.measured.ra, p.measured.dec), err: p.measured.err_arcsec, kind: 'measured', active, label: `Measured ${date} ± ${p.measured.err_arcsec}″` })
    })
    return out
  }, [q.data, data, activeIndex])

  if (target && target.change !== 'motion') {
    return (
      <div className="panel">
        <p>{target.name} barely moves across the sky over these dates. Use the Brightness tab to compare how bright it is.</p>
      </div>
    )
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <h4>Position over time</h4>
        <DemoTag mode={q.data?.mode} />
      </div>
      {q.isPending ? (
        <Pending label="Loading positions…" />
      ) : q.isError ? (
        <Failed error={q.error} />
      ) : pts.length === 0 ? (
        <p className="caption">No position measurements for this selection.</p>
      ) : (
        <>
          <OffsetChart points={pts} title={`Measured positions of ${target?.name ?? 'the target'}`} />
          <ul className="legend">
            <li><span className="sw sw--measured" /> Measured from the image (circle = uncertainty)</li>
          </ul>
          {target && (
            <p className="caption num">
              Catalog proper motion: {target.pmRaCosDecMasYr.toLocaleString('en-US')} mas/yr east, {target.pmDecMasYr.toLocaleString('en-US')} mas/yr north (SIMBAD, {target.epoch}).
            </p>
          )}
          <label className="check">
            <input type="checkbox" checked={showTrail} onChange={(e) => setShowTrail(e.target.checked)} />
            Draw the path on the image
          </label>
        </>
      )}
    </div>
  )
}

export function BrightnessPanel({ target, coords, detector, data, activeIndex }: Common) {
  const q = useQuery({
    queryKey: ['photometry', config.useMock, coords.ra, coords.dec, detector, target?.key ?? null],
    queryFn: ({ signal }) => api.photometry({ ra: coords.ra, dec: coords.dec, detector, targetKey: target?.key }, signal),
    staleTime: Infinity,
  })
  const activeMjd = data?.frames[activeIndex]?.mjd
  const points = (q.data?.points ?? [])
    .filter((p) => p.detector === detector)
    .map((p) => ({
      x: p.mjd,
      y: p.flagged ? null : p.flux_mjy,
      err: p.err_mjy,
      flagged: p.flagged,
      active: activeMjd != null && Math.abs(p.mjd - activeMjd) < 2,
      label: `${formatUtcDate(p.mjd)}: ${p.flux_mjy ?? '—'} ± ${p.err_mjy ?? '—'} mJy${p.flagged ? ' (flagged)' : ''}`,
    }))
  const flagged = (q.data?.points ?? []).filter((p) => p.detector === detector && p.flagged)
  return (
    <div className="panel">
      <div className="panel-head">
        <h4>Brightness over time · D{detector}</h4>
        <DemoTag mode={q.data?.mode} />
      </div>
      {q.isPending ? (
        <Pending label="Loading brightness…" />
      ) : q.isError ? (
        <Failed error={q.error} />
      ) : points.length === 0 ? (
        <p className="caption">No brightness measurements for detector D{detector}.</p>
      ) : (
        <>
          <ErrorBarChart points={points} xLabel="Observation date (UTC)" yLabel="Flux (mJy)" formatX={formatShortDate} title={`Light curve of ${target?.name ?? 'the target'} in detector D${detector}`} />
          {flagged.length > 0 && (
            <p className="caption">
              {flagged.length} observation{flagged.length > 1 ? 's are' : ' is'} left out because of quality flags
              {flagged[0].flag_reasons?.length ? ` (${flagged[0].flag_reasons.join(', ')})` : ''}.
            </p>
          )}
          <p className="caption">Flux in millijansky with 1σ error bars. The highlighted point is the observation on screen.</p>
        </>
      )}
    </div>
  )
}

export function DataPanel({
  target,
  coords,
  data,
  activeIndex,
  detector,
  onDetector,
  flags,
  setFlags,
  picked,
  combined,
  spectrumOpen,
  onSpectrumOpenChange,
}: Common & {
  onDetector: (d: number) => void
  flags: boolean
  setFlags: (v: boolean) => void
  picked: { ra: number; dec: number; x: number; y: number } | null
  combined: boolean
  spectrumOpen: boolean
  onSpectrumOpenChange: (open: boolean) => void
}) {
  const f = data?.frames[activeIndex]
  const flagsQ = useQuery({
    queryKey: ['flags', f?.id ?? null],
    queryFn: ({ signal }) => api.flags(f!.id, signal),
    enabled: !!f && flags,
    staleTime: Infinity,
  })
  const fitsUrl =
    combined && !config.useMock && target?.key
      ? config.apiBaseUrl
        ? `${config.apiBaseUrl}/api/frames/combined/${encodeURIComponent(target.key)}/aligned_sequence.fits`
        : target.key === 'wise0855'
          ? 'https://gprawwpsgvhfzwyfoout.supabase.co/storage/v1/object/public/spherex-dr1-demo/combined/wise0855_unwise_spherex_d6/aligned_sequence.fits'
          : null
      : null
  const manifestUrl =
    combined && !config.useMock && target?.key === 'wise0855'
      ? 'https://gprawwpsgvhfzwyfoout.supabase.co/storage/v1/object/public/spherex-dr1-demo/combined/wise0855_unwise_spherex_d6/sequence_manifest.json'
      : null
  const pythonSnippet = useMemo(
    () =>
      buildPythonSnippet({
        targetName: target?.name ?? 'Custom sky position',
        targetKey: target?.key,
        ra: coords.ra,
        dec: coords.dec,
        detector,
        fitsUrl,
        manifestUrl,
      }),
    [target?.name, target?.key, coords.ra, coords.dec, detector, fitsUrl, manifestUrl],
  )
  const downloadCsv = () => {
    if (!data) return
    const csv = buildObservationsCsv(data)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${target?.key ?? 'custom'}_d${detector}_observations.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="panel">
      <fieldset className="detector-pick">
        <legend>Detector (infrared channel)</legend>
        <div className="segmented" role="radiogroup" aria-label="Detector">
          {DETECTORS.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={detector === d.id} title={`${d.label}, ${d.range}`} onClick={() => onDetector(d.id)}>
              D{d.id}
            </button>
          ))}
        </div>
        <p className="caption">
          D{detector}: {DETECTORS[detector - 1]?.range}. Longer wavelengths show colder objects. Changing the detector loads a new set of observations.
        </p>
      </fieldset>

      {f && data && (
        <dl className="facts">
          <div>
            <dt>Observation time</dt>
            <dd className="num">{formatInterval(f.t_min_mjd, f.t_max_mjd) ?? `${formatUtcDate(f.iso)} UTC`}</dd>
            {f.n_exposures && f.n_exposures > 1 && <dd className="caption">Combined from {f.n_exposures} exposures</dd>}
          </div>
          <div>
            <dt>Wavelength</dt>
            <dd className="num">{f.wavelength_um != null ? `${f.wavelength_um.toFixed(3)} µm` : '—'}{f.bandwidth_um ? ` (width ${f.bandwidth_um} µm)` : ''}</dd>
          </div>
          <div>
            <dt>Release &amp; quality label</dt>
            <dd>
              {f.release ?? '—'}
              {f.survey ? ` · sky pass ${f.survey}` : ''}
              {f.quality_label ? ` · ${f.quality_label}` : ''}
            </dd>
          </div>
          <div>
            <dt>Image grid</dt>
            <dd className="num">
              {data.grid.width}×{data.grid.height} px · {data.grid.pixscale_arcsec}″/px · {data.grid.projection}
              {data.norm ? ` · stretch ${data.norm.stretch}` : ''}
            </dd>
          </div>
          {f.bad_pixel_frac != null && (
            <div>
              <dt>Flagged pixels</dt>
              <dd className="num">{(f.bad_pixel_frac * 100).toFixed(2)}%</dd>
            </div>
          )}
          <div>
            <dt>Source</dt>
            <dd>{f.mission === 'unWISE' ? 'unWISE time-resolved coadds via WiseView' : data.attribution ?? 'NASA/IPAC Infrared Science Archive (IRSA), SPHEREx'}</dd>
          </div>
          <details>
            <summary>Product identifier</summary>
            <code className="num">{f.source_product_id ?? f.id}</code>
          </details>
        </dl>
      )}

      <section className="detail-block" aria-label="FITS data download">
        <h4>Science data &amp; table export</h4>
        <div className="detail-block__row">
          {data && data.frames.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={downloadCsv}>
              Download observation table (.csv)
            </button>
          )}
          {fitsUrl && (
            <a className="btn btn-secondary btn-sm" href={fitsUrl} download={`${target?.key ?? 'sequence'}_aligned_sequence.fits`}>
              Download aligned FITS cube (.fits)
            </a>
          )}
          {manifestUrl && (
            <a className="btn btn-secondary btn-sm" href={manifestUrl} target="_blank" rel="noreferrer">
              Open sequence manifest (.json)
            </a>
          )}
        </div>
        <p className="caption">
          {fitsUrl
            ? `Aligned FITS cube contains all ${data?.frames.length ?? ''} WCS-registered frames on the shared ${data?.grid.width}×${data?.grid.height} TAN grid.`
            : config.useMock
              ? 'CSV table export is ready; FITS cube download is available when connected to the real observation archive.'
              : 'CSV table export is ready; aligned FITS cube download is available for combined unWISE + SPHEREx sequences on D6.'}
        </p>
        <details>
          <summary>Python / Astropy notebook snippet</summary>
          <div className="detail-block__row">
            <pre className="num caption" style={{ overflowX: 'auto' }}>{pythonSnippet}</pre>
            <CopyButton text={pythonSnippet} label="Copy Python snippet" />
          </div>
        </details>
      </section>

      <section className="detail-block" aria-label="Quality flags">
        <h4>Quality flags</h4>
        <label className="check">
          <input type="checkbox" checked={flags} onChange={(e) => setFlags(e.target.checked)} disabled={!f} />
          Show quality flags on the image
        </label>
        {flags &&
          (flagsQ.isPending ? (
            <Pending label="Loading quality flags…" />
          ) : flagsQ.isError ? (
            <Failed error={flagsQ.error} />
          ) : flagsQ.data ? (
            <>
              <DemoTag mode={flagsQ.data.mode} />
              <ul className="legend">
                {flagsQ.data.legend.map((l) => (
                  <li key={l.bit}>
                    <span className="sw" style={{ background: l.color }} /> <strong>{l.name}.</strong> {l.description}
                  </li>
                ))}
              </ul>
            </>
          ) : null)}
      </section>

      <details id="viewer-spectrum-details" className="detail-block" open={spectrumOpen} onToggle={(event) => onSpectrumOpenChange(event.currentTarget.open)}>
        <summary className="detail-summary">Spectrum (D1–D6 measured flux)</summary>
        <div className="detail-block__inner">
          {spectrumOpen && <SpectrumResult
            isPicked={Boolean(picked)}
            position={
              picked ?? {
                ra: coords.ra,
                dec: coords.dec,
                x: Math.floor((data?.grid.width ?? 0) / 2),
                y: Math.floor((data?.grid.height ?? 0) / 2),
              }
            }
            target={picked && f?.predicted_px
              ? Math.hypot(picked.x - f.predicted_px[0], picked.y - f.predicted_px[1]) <= 3 ? target : null
              : target}
          />}
        </div>
      </details>
    </div>
  )
}

/** Loads the flags overlay image for the active frame when flags are on. */
export function useFlagsOverlay(frameId: string | null, enabled: boolean): HTMLImageElement | null {
  const q = useQuery({
    queryKey: ['flags', frameId],
    queryFn: ({ signal }) => api.flags(frameId!, signal),
    enabled: !!frameId && enabled,
    staleTime: Infinity,
  })
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const url = q.data?.overlay
  useEffect(() => {
    if (!url || !enabled) {
      setImg(null)
      return
    }
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => setImg(im)
    im.src = url
  }, [url, enabled])
  return img
}

export function SpectrumResult({ position, target, isPicked = false }: { position: { ra: number; dec: number; x: number; y: number } | null; target: TargetInfo | null; isPicked?: boolean }) {
  const q = useQuery({
    queryKey: ['spectrum', config.useMock, target?.key ?? null, position?.ra ?? null, position?.dec ?? null],
    queryFn: ({ signal }) => api.spectrum({ ra: position!.ra, dec: position!.dec, targetKey: target?.key }, signal),
    enabled: !!position,
    retry: (count, err) => !(err instanceof ApiError && err.code === 'NO_SPECTRUM') && count < 2,
    staleTime: Infinity,
  })
  if (!position) return <p className="caption">Turn on “Pick a point” and click the image to see the brightness at each wavelength there.</p>
  return (
    <div>
      <div className="panel-head">
        <p className="num caption">
          {isPicked ? 'Pixel' : 'Target center'} ({position.x}, {position.y}) · {formatRaHms(position.ra)} {formatDecDms(position.dec)}
        </p>
        <DemoTag mode={q.data?.mode} />
      </div>
      {q.isPending ? (
        <Pending label="Loading spectrum…" />
      ) : q.isError && !(q.error instanceof ApiError && q.error.code === 'NO_SPECTRUM') ? (
        <Failed error={q.error} />
      ) : q.isError || (q.data?.points.length ?? 0) === 0 ? (
        <p className="caption">{q.error instanceof ApiError && q.error.code === 'SPECTRUM_ASSET_UNAVAILABLE'
          ? 'The archive has metadata for this observation, but no readable FITS file is available.'
          : 'No measured spectral samples cover this position. No stellar properties are reported.'}</p>
      ) : (
        <>
          <h5>{q.data?.is_continuous_spectrum ? 'Measured spectral flux' : 'Measured SPHEREx band flux'}</h5>
          <ErrorBarChart
            points={(q.data?.points ?? []).map((p) => ({
              x: p.wavelength_um,
              y: p.flux_mjy,
              err: p.err_mjy,
              flagged: p.flagged,
              label: `D${p.detector} ${p.wavelength_um.toFixed(2)} µm: ${p.flux_mjy ?? '—'} mJy`,
            }))}
            xLabel="Wavelength (µm)"
            yLabel="Flux (mJy)"
            formatX={(x) => x.toFixed(1)}
            bands={[
              { xMin: 1.35, xMax: 1.5, label: 'H₂O' },
              { xMin: 1.85, xMax: 2.05, label: 'H₂O' },
              { xMin: 2.9, xMax: 3.3, label: 'H₂O / CH₄' },
              { xMin: 4.4, xMax: 4.8, label: 'CO / CO₂' },
            ]}
            title={q.data?.is_continuous_spectrum ? 'Spectrum at the selected point' : 'SPHEREx band flux at the selected point'}
          />
          {target && (
            <div className="look-for" aria-label="Plain-language spectrum guide">
              <h4>What its light says</h4>
              <p>
                {target.temperatureAnalogy} Shaded vertical bands highlight key near-infrared molecular dips (H₂O water vapor, CH₄ methane, and CO / CO₂) that cool stars and brown dwarfs carve out between SPHEREx detectors D1 and D6.
              </p>
            </div>
          )}
          <p className="caption">
            {q.data?.is_continuous_spectrum
              ? 'These are measured spectral samples from the selected position.'
              : 'These are aperture-measured SPHEREx detector-band fluxes. They are not a continuous spectrum and do not measure a temperature by themselves.'}{' '}
            The viewer does not infer a stellar class, distance, or planet from this chart. Use the target catalog and cited archive products for physical interpretation.
          </p>
          <p className="caption">Wavelength source: {q.data?.wavelength_source ?? 'FITS metadata'} · Flux unit: mJy · {q.data?.points.length ?? 0} measured point(s).</p>
          {target ? (
            <>
              <p className="caption">Catalog facts below come from the named target record. They are not inferred from this measured flux chart.</p>
              <dl className="facts">
                <div><dt>Catalog object classification</dt><dd>{target.kind}</dd></div>
                <div><dt>Catalog distance</dt><dd>{target.distance}</dd></div>
                <div><dt>Catalog notes</dt><dd>{target.temperatureAnalogy}</dd></div>
                <div><dt>Catalog source</dt><dd><a href={`https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(target.simbadId)}`}>Team target notes · SIMBAD identification</a></dd></div>
              </dl>
              {target.kind.toLowerCase().includes('brown dwarf') && (
                <p className="caption">
                  A brown dwarf is a substellar object. It does not sustain hydrogen fusion like a main-sequence star.
                </p>
              )}
            </>
          ) : (
            <p className="caption">No catalog match was found at this position, so no stellar properties are reported.</p>
          )}
        </>
      )}
    </div>
  )
}
