import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, Info, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { config } from '../../app/config'
import { api } from '../../shared/api'
import { describeError } from '../../shared/api/errors'
import type { FramesResponse } from '../../shared/api/types'
import { DETECTORS, type TargetInfo } from '../../shared/config/targets'
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
}

export function OverviewPanel({ target, coords, data }: Common) {
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
          The catalog position is for {target.epoch}. The crosshair on the image marks the position predicted for each observation date.
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
    const first = res.points.find((p) => p.predicted)?.predicted
    if (!first) return []
    const cosd = Math.cos((first.dec * Math.PI) / 180)
    const off = (ra: number, dec: number) => ({ x: (ra - first.ra) * cosd * 3600, y: (dec - first.dec) * 3600 })
    const out: { x: number; y: number; err?: number; kind: 'measured' | 'predicted'; active?: boolean; label: string }[] = []
    res.points.forEach((p, i) => {
      const date = formatUtcDate(p.mjd)
      const active = data ? Math.abs((data.frames[activeIndex]?.mjd ?? -1) - p.mjd) < 2 : i === activeIndex
      if (p.predicted) out.push({ ...off(p.predicted.ra, p.predicted.dec), kind: 'predicted', active, label: `Predicted ${date}` })
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
          <OffsetChart points={pts} title={`Measured and predicted positions of ${target?.name ?? 'the target'}`} />
          <ul className="legend">
            <li><span className="sw sw--measured" /> Measured from the image (circle = uncertainty)</li>
            <li><span className="sw sw--predicted" /> Predicted from catalog motion</li>
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

export function DataPanel({ data, activeIndex, detector, onDetector, flags, setFlags }: Common & { onDetector: (d: number) => void; flags: boolean; setFlags: (v: boolean) => void }) {
  const f = data?.frames[activeIndex]
  const flagsQ = useQuery({
    queryKey: ['flags', f?.id ?? null],
    queryFn: ({ signal }) => api.flags(f!.id, signal),
    enabled: !!f && flags,
    staleTime: Infinity,
  })
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
            <dt>Release</dt>
            <dd>{f.release ?? '—'}{f.survey ? ` · sky pass ${f.survey}` : ''}</dd>
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

export function SpectrumResult({ position }: { position: { ra: number; dec: number; x: number; y: number } | null }) {
  const q = useQuery({
    queryKey: ['spectrum', config.useMock, position?.ra ?? null, position?.dec ?? null],
    queryFn: ({ signal }) => api.spectrum({ ra: position!.ra, dec: position!.dec }, signal),
    enabled: !!position,
    staleTime: Infinity,
  })
  if (!position) return <p className="caption">Turn on “Pick a point” and click the image to see the brightness at each wavelength there.</p>
  return (
    <div>
      <div className="panel-head">
        <p className="num caption">
          Pixel ({position.x}, {position.y}) · {formatRaHms(position.ra)} {formatDecDms(position.dec)}
        </p>
        <DemoTag mode={q.data?.mode} />
      </div>
      {q.isPending ? (
        <Pending label="Loading spectrum…" />
      ) : q.isError ? (
        <Failed error={q.error} />
      ) : (
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
          title="Spectrum at the selected point"
        />
      )}
    </div>
  )
}
