import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLanguage } from '../../shared/i18n/language'
import { StableLabel } from '../../shared/i18n/StableLabel'
import { config, PATHS } from '../../app/config'
import { api } from '../../shared/api'
import { describeError } from '../../shared/api/errors'
import type { FramesResponse } from '../../shared/api/types'
import { DR1_MAP_MJD } from '../../shared/config/epoch'
import type { TargetInfo } from '../../shared/config/targets'
import wiseReferenceConfig from '../../shared/config/wise-reference.json'
import { framesQueryKey } from '../blink/useFrameSession'
import { buildForumCandidatePrefill, type RulerMeasurement } from '../experience-mode/mode'
import type { GaiaStatusInfo, SurveyInfo } from '../sky-map/AladinMap'
import { formatDecDms, formatRaHms } from '../target-search/coordinates'
import { DemoTag } from './SciencePanels'
import { formatUtcDate } from './format'
import { selectRgbFrames } from './rgbFrames'

interface Props {
  target: TargetInfo | null
  coords: { ra: number; dec: number }
  detector?: number
  picked?: { ra: number; dec: number; x: number; y: number } | null
  rulerMeasurement?: RulerMeasurement | null
  data: FramesResponse | null
  originals: (ImageBitmap | null)[]
  activeIndex: number
  gaia: boolean
  setGaia: (v: boolean) => void
  gaiaStatus: GaiaStatusInfo
  survey: SurveyInfo
  shareUrl: string
  embedUrl: string
}

function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const { lang } = useLanguage()
  const [done, setDone] = useState(false)
  const id = `copy-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="copy-field">
      <label htmlFor={id}>{label}</label>
      <div className="copy-field__row">
        {multiline ? (
          <textarea id={id} className="input" readOnly rows={3} value={value} onFocus={(e) => e.currentTarget.select()} />
        ) : (
          <input id={id} className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            void navigator.clipboard?.writeText(value).then(() => {
              setDone(true)
              setTimeout(() => setDone(false), 1500)
            })
          }
        >
          {done ? <Check aria-hidden /> : <Copy aria-hidden />} {done ? (lang === 'vi' ? 'Đã sao chép' : 'Copied') : (lang === 'vi' ? 'Sao chép' : 'Copy')}
        </button>
      </div>
    </div>
  )
}

const RGB_DETECTORS = { r: 6, g: 4, b: 2 } as const

interface WiseImage {
  target: string
  band: string
  wavelength_um: number
  start: string
  end: string
  image_url: string
  coverage: { inside: boolean }[]
}

interface UnwiseFrame {
  epoch: number
  date: string
  image_url: string
}

export function UnwiseBlink({ target, inline = false }: { target: TargetInfo; inline?: boolean }) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const sources = (wiseReferenceConfig.blinkManifests as Record<string, Partial<Record<'W1' | 'W2', string>>>)[target.key] ?? {}
  const [playing, setPlaying] = useState(false)
  const [index, setIndex] = useState(0)
  const [band, setBand] = useState<'W1' | 'W2'>(sources.W2 ? 'W2' : 'W1')
  const manifestUrl = sources[band]
  const query = useQuery({
    queryKey: ['unwise-blink', target.key, band],
    queryFn: async ({ signal }) => {
      if (!manifestUrl) throw new Error('unWISE sequence unavailable')
      const response = await fetch(manifestUrl, { signal })
      if (!response.ok) throw new Error('unWISE sequence unavailable')
      return response.json() as Promise<{ frames: UnwiseFrame[] }>
    },
    staleTime: 300_000,
    retry: false,
    enabled: Boolean(manifestUrl),
  })
  const frames = query.data?.frames ?? []
  useEffect(() => {
    if (!playing || frames.length < 2) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), 700)
    return () => window.clearInterval(timer)
  }, [playing, frames.length])
  if (!manifestUrl) return <p className="caption">{vi ? 'Không có chuỗi unWISE cho dải này.' : 'No unWISE sequence is available for this band.'}</p>
  if (query.isPending) return <p className="caption" role="status">{vi ? 'Đang tải chuỗi unWISE thực của NASA…' : 'Loading real NASA unWISE sequence…'}</p>
  if (query.isError || frames.length < 2) return <p className="caption" role="status">{vi ? 'Chuỗi unWISE tạm thời không khả dụng.' : 'unWISE sequence is temporarily unavailable.'}</p>
  const clampedIdx = index % frames.length
  const frame = frames[clampedIdx]
  return (
    <div className={inline ? 'viewer-unwise-inline' : 'wise-reference'}>
      <div className="panel-head">
        <h4>{target.name} · unWISE blink</h4>
        <span className="viewer-real-badge">{vi ? 'Dữ liệu unWISE thực của NASA' : 'Real NASA unWISE data'}</span>
      </div>
      <div className="wise-blink__controls" aria-label="Select WISE band">
        {(['W1', 'W2'] as const).filter((choice) => sources[choice]).map((choice) => (
          <button
            key={choice}
            className="btn btn-secondary btn--compact"
            type="button"
            aria-pressed={band === choice}
            onClick={() => { setPlaying(false); setIndex(0); setBand(choice) }}
          >
            {choice === 'W1' ? 'W1 (3.4 µm)' : 'W2 (4.6 µm)'}
          </button>
        ))}
      </div>
      <p className="caption">{vi ? `Ảnh cộng gộp ${band} theo thời gian · cùng lưới bầu trời · ${frames.length} thời điểm · chỉ so sánh trực quan.` : `Time-resolved ${band} coadds · same sky grid · ${frames.length} epochs · visual comparison only.`}</p>
      <img className="wise-blink__image" src={frame.image_url} alt={`unWISE ${band} field at epoch ${frame.epoch}`} />
      <input
        type="range"
        className="viewer-unwise-slider"
        min={0}
        max={Math.max(0, frames.length - 1)}
        step={1}
        value={clampedIdx}
        aria-label="Real unWISE observation epoch"
        onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }}
      />
      <p className="caption num" aria-live={playing ? 'off' : 'polite'}>
        {vi ? 'Thời điểm' : 'Epoch'} {frame.epoch} · {frame.date.slice(0, 10)} UTC · {clampedIdx + 1}/{frames.length}
      </p>
      <div className="wise-blink__controls">
        <button className="btn btn-secondary btn--compact" type="button" onClick={() => { setPlaying(false); setIndex((clampedIdx + frames.length - 1) % frames.length) }}><StableLabel text={vi ? 'Trước' : 'Previous'} alt={vi ? 'Previous' : 'Trước'} /></button>
        <button
          className="btn btn-secondary btn--compact"
          type="button"
          aria-label={playing ? 'Pause real unWISE sequence' : 'Play real unWISE sequence'}
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          <StableLabel text={playing ? (vi ? 'Tạm dừng' : 'Pause') : (vi ? 'Phát' : 'Play')} alt={playing ? (vi ? 'Pause' : 'Tạm dừng') : (vi ? 'Play' : 'Phát')} />
        </button>
        <button className="btn btn-secondary btn--compact" type="button" onClick={() => { setPlaying(false); setIndex((clampedIdx + 1) % frames.length) }}><StableLabel text={vi ? 'Tiếp' : 'Next'} alt={vi ? 'Next' : 'Tiếp'} /></button>
      </div>
      {!inline && (
        <p className="caption">{vi ? 'Mỗi ảnh đã được loại nền và dùng cùng phép giãn hiển thị. Nguồn sáng mạnh có thể bị bão hòa. Chuyển động nhìn thấy chưa phải phép đo đã xác nhận.' : 'Each frame has its background removed and shares the same display stretch. Bright sources may saturate. Apparent movement is not a confirmed measurement.'}</p>
      )}
    </div>
  )
}

function WiseReference({ target }: { target: TargetInfo }) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const query = useQuery({
    queryKey: ['allwise-reference'],
    queryFn: async ({ signal }) => {
      const response = await fetch(wiseReferenceConfig.manifestUrl, { signal })
      if (!response.ok) throw new Error('AllWISE reference unavailable')
      return response.json() as Promise<{ images: WiseImage[] }>
    },
    staleTime: 300_000,
    retry: false,
  })
  const images = query.data?.images.filter((image) => image.target === target.key) ?? []
  if (query.isPending) return <p className="caption" role="status">{vi ? 'Đang tải ảnh tham chiếu AllWISE…' : 'Loading AllWISE references…'}</p>
  if (query.isError) return <p className="caption" role="status">{vi ? 'Ảnh tham chiếu AllWISE tạm thời không khả dụng.' : 'AllWISE references are temporarily unavailable.'}</p>
  if (!images.length) return <p className="caption">{vi ? 'Không có ảnh tham chiếu AllWISE cho mục tiêu này.' : 'No AllWISE reference available for this target.'}</p>
  return (
    <div className="wise-reference">
      <p className="caption">AllWISE coadds · WISE/IPAC · {images[0].start.slice(0, 10)} {vi ? 'đến' : 'to'} {images[0].end.slice(0, 10)} UTC. {vi ? 'Các ảnh được giãn độc lập; không thể so sánh trực tiếp độ sáng với SPHEREx.' : 'Independently stretched; brightness is not directly comparable with SPHEREx.'}</p>
      {images.some((image) => image.coverage.length !== 2 || image.coverage.some((point) => !point.inside)) && (
        <p className="notice notice--warn">{vi ? 'Phạm vi quan sát mục tiêu chưa đầy đủ ở ít nhất một ngày. Các ảnh này chỉ cho thấy vùng xung quanh.' : 'Target coverage is incomplete for at least one observation date. These images show the surrounding field only.'}</p>
      )}
      <div className="wise-reference__images">
        {images.map((image) => (
          <figure key={image.band}>
            <img src={image.image_url} alt={`AllWISE ${image.band} reference field for ${target.name}`} loading="lazy" />
            <figcaption className="caption">{image.band} · {image.wavelength_um} µm</figcaption>
          </figure>
        ))}
      </div>
      <p className="caption">{vi ? 'Ảnh tham chiếu, không phải khung hình SPHEREx. Phạm vi bao phủ dùng chuyển động riêng gần đúng; việc phát hiện nguồn chưa được xác nhận.' : 'Reference images, not SPHEREx blink frames. Coverage uses approximate proper motion; source detection is not confirmed.'}</p>
    </div>
  )
}

export function RgbView({ target, coords, data, originals, activeIndex }: Pick<Props, 'target' | 'coords' | 'data' | 'originals' | 'activeIndex'>) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pixels = useRef(new Map<string, Uint8ClampedArray<ArrayBuffer>>())
  const params = (d: number) => ({ ra: coords.ra, dec: coords.dec, detector: d, size: config.cutoutSizeDeg, maxFrames: config.maxFrames, targetKey: target?.key })
  const results = useQueries({
    queries: [RGB_DETECTORS.r, RGB_DETECTORS.g, RGB_DETECTORS.b].map((d) => ({
      queryKey: framesQueryKey(params(d)),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.frames(params(d), signal),
      staleTime: Infinity,
      retry: false,
    })),
  })
  const [r, g, b] = results.map((result) => result.data)
  const err = results.find((r) => r.isError)?.error
  const activeMjd = data?.frames[activeIndex]?.mjd
  const selection = useMemo(() => r && g && b ? selectRgbFrames(r, g, b, activeMjd) : null, [r, g, b, activeMjd])
  const red = selection?.status === 'ready' ? selection.red.png : null
  const green = selection?.status === 'ready' ? selection.green.png : null
  const blue = selection?.status === 'ready' ? selection.blue.png : null
  const width = selection?.status === 'ready' ? selection.grid.width : 0
  const height = selection?.status === 'ready' ? selection.grid.height : 0
  const selectionKey = JSON.stringify([red, green, blue, width, height])
  const [rendered, setRendered] = useState<{ key: string; error?: unknown } | null>(null)
  const findOriginal = useEffectEvent((url: string) => {
    const index = data?.frames.findIndex((frame) => frame.png === url) ?? -1
    return index >= 0 ? originals[index] ?? null : null
  })

  useEffect(() => {
    if (!red || !green || !blue) return
    const ctrl = new AbortController()
    const scratch = document.createElement('canvas')
    scratch.width = width
    scratch.height = height
    const scratchContext = scratch.getContext('2d')!
    const read = async (url: string) => {
      const key = JSON.stringify([url, width, height])
      const saved = pixels.current.get(key)
      if (saved) return saved
      const original = findOriginal(url)
      const bitmap = original ?? await api.image(url, ctrl.signal)
      try {
        if (ctrl.signal.aborted) throw ctrl.signal.reason
        if (bitmap.width !== width || bitmap.height !== height) throw new Error('Frame dimensions do not match its sky grid')
        scratchContext.clearRect(0, 0, width, height)
        scratchContext.drawImage(bitmap, 0, 0)
        const rgba = scratchContext.getImageData(0, 0, width, height).data
        const channel = new Uint8ClampedArray(width * height)
        for (let i = 0; i < channel.length; i++) channel[i] = rgba[i * 4]
        pixels.current.set(key, channel)
        if (pixels.current.size > 12) pixels.current.delete(pixels.current.keys().next().value!)
        return channel
      } finally {
        if (!original) bitmap.close()
      }
    }
    Promise.all([read(red), read(green), read(blue)])
      .then(([r, g, b]) => {
        const c = canvasRef.current
        if (!c || ctrl.signal.aborted) return
        const out = new ImageData(width, height)
        for (let i = 0; i < r.length; i++) {
          out.data[i * 4] = r[i]
          out.data[i * 4 + 1] = g[i]
          out.data[i * 4 + 2] = b[i]
          out.data[i * 4 + 3] = 255
        }
        c.width = width
        c.height = height
        c.getContext('2d')!.putImageData(out, 0, 0)
        setRendered({ key: selectionKey })
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setRendered({ key: selectionKey, error: e })
        ctrl.abort()
      })
    return () => ctrl.abort()
  }, [red, green, blue, width, height, selectionKey])

  const current = rendered?.key === selectionKey ? rendered : null
  const error = err ?? current?.error
  const visible = selection?.status === 'ready' && Boolean(current) && !error
  const loading = !error && (!selection || (selection.status === 'ready' && !visible))

  return (
    <div className="rgb">
      <div className="panel-head">
        <p className="caption">
          {vi ? 'Ảnh màu giả · đỏ' : 'False-color view · red'} D{RGB_DETECTORS.r}, {vi ? 'lục' : 'green'} D{RGB_DETECTORS.g}, {vi ? 'lam' : 'blue'} D{RGB_DETECTORS.b}
          {visible && selection.status === 'ready' ? ` · ${formatUtcDate(selection.red.iso)}` : ''}
        </p>
        <DemoTag mode={r?.mode} />
      </div>
      <div className="rgb__frame">
        <canvas ref={canvasRef} hidden={!visible} aria-label={vi ? 'Ảnh màu giả kết hợp từ ba cảm biến SPHEREx' : 'False-color composite of three SPHEREx detectors'} role="img" />
        {loading && (
          <p className="panel-status" role="status">
            <Loader2 className="spin" size={16} aria-hidden /> {vi ? 'Đang tải ba cảm biến…' : 'Loading three detectors…'}
          </p>
        )}
        {error != null && <p className="caption">{describeError(error).title}. {vi ? 'Ảnh màu giả cần đủ ba cảm biến.' : 'False-color needs all three detectors.'}</p>}
        {selection?.status === 'incompatible' && <p className="caption">{vi ? 'Ba cảm biến không dùng cùng lưới ảnh nên không thể kết hợp.' : 'The three detectors are not on the same image grid, so they cannot be combined.'}</p>}
        {selection?.status === 'missing' && <p className="caption">{vi ? 'Ít nhất một trong ba cảm biến không có ảnh quan sát.' : 'No observations are available in at least one of the three detectors.'}</p>}
        {selection?.status === 'different-epochs' && <p className="caption">{vi ? 'Các quan sát gần nhất cách nhau hơn hai ngày. Hãy chọn ngày khác để so sánh ba cảm biến.' : 'The nearest observations span more than two days. Choose another date to compare the three detectors.'}</p>}
      </div>
      <p className="caption">{vi ? 'Màu được gán để minh họa: ánh sáng hồng ngoại được ánh xạ thành đỏ, lục và lam để so sánh các kênh.' : 'Colours are assigned, not seen: infrared light is mapped to red, green and blue to compare channels.'}</p>
    </div>
  )
}

export function MoreTools(p: Props) {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const [reportCopied, setReportCopied] = useState(false)
  const navigate = useNavigate()
  const activeFrame = p.data?.frames[p.activeIndex] ?? null
  const hasUnwiseInMainViewer = Boolean(p.data?.frames.some((f) => f.mission === 'unWISE'))
  const candidatePrefill = buildForumCandidatePrefill({
    targetName: p.target?.name ?? 'Custom sky position',
    targetKey: p.target?.key,
    coords: p.coords,
    picked: p.picked,
    detector: p.detector ?? p.data?.detector ?? 6,
    frame: activeFrame,
    shareUrl: p.shareUrl,
    rulerMeasurement: p.rulerMeasurement,
  })
  const isDssFallback = p.survey.key === 'dss2' || p.survey.id === 'CDS/P/DSS2/color'
  const sourceName = p.gaiaStatus.source === 'sky_archive' ? 'Supabase sky_archive (ESA Gaia DR3)' : 'ESA/Gaia DR3 via VizieR'
  const targetEpochText = p.survey.cube
    ? `DR1_MAP_MJD (${DR1_MAP_MJD}, Nov 2025)`
    : (p.survey.epochLabel ?? 'active map epoch')

  const gaiaCaption = (() => {
    if (p.gaiaStatus.status === 'loading') {
      return vi ? 'Đang tải danh mục Gaia DR3 (sky_archive / VizieR)…' : 'Loading Gaia DR3 catalog (sky_archive / VizieR)…'
    }
    if (p.gaiaStatus.status === 'error') {
      return vi ? 'Không thể tải Gaia DR3 từ sky_archive hoặc VizieR.' : 'Gaia DR3 could not be loaded from sky_archive or VizieR.'
    }
    if (p.gaiaStatus.status === 'ready') {
      const total = p.gaiaStatus.count ?? 0
      const propagated = p.gaiaStatus.propagatedCount ?? 0
      const staticCount = p.gaiaStatus.staticCount ?? 0
      if (isDssFallback) {
        return vi ? `Đã tải ${total} nguồn Gaia DR3 từ ${sourceName}. Giữ nguyên thời điểm tham chiếu J2016.0, không chuyển sang thời điểm các tấm DSS2 (thập niên 1950–1990).` : `${total} Gaia DR3 sources loaded from ${sourceName}. Kept at Gaia reference epoch J2016.0 (not shifted to the mixed 1950s–1990s DSS2 plate epochs).`
      }
      if (staticCount > 0) {
        return vi ? `${total} nguồn Gaia DR3 (${sourceName}): ${propagated} nguồn được quy đổi bằng pmRA/pmDE từ J2016.0 đến ${targetEpochText}; ${staticCount} nguồn giữ ở J2016.0 do thiếu pmRA/pmDE.` : `${total} Gaia DR3 sources (${sourceName}): ${propagated} propagated via pmRA/pmDE (angular_proper_motion_only) from J2016.0 to ${targetEpochText}; ${staticCount} kept at J2016.0 because pmRA/pmDE are absent.`
      }
      return vi ? `${total} nguồn Gaia DR3 (${sourceName}) được quy đổi bằng pmRA/pmDE từ J2016.0 đến ${targetEpochText}.` : `${total} Gaia DR3 sources (${sourceName}): propagated via pmRA/pmDE (angular_proper_motion_only) from J2016.0 to ${targetEpochText}.`
    }
    if (isDssFallback) {
      return vi ? 'Dữ liệu danh mục thực ESA/Gaia DR3 (thời điểm J2016.0). Lưu ý: ảnh nền hiện tại là các tấm quang học DSS2 từ thập niên 1950–1990.' : 'Real catalog data from ESA/Gaia DR3 (epoch J2016.0). Note: the current background is DSS2 optical plates from the 1950s–1990s.'
    }
    return vi ? `Dữ liệu thực ESA/Gaia DR3 (sky_archive cho mục tiêu chuẩn, nếu không thì dùng VizieR), quy đổi bằng pmRA/pmDE từ J2016.0 đến ${targetEpochText}; giữ ở J2016.0 khi thiếu pmRA/pmDE.` : `Real catalog data from ESA/Gaia DR3 (sky_archive for standard targets, VizieR otherwise), propagated with pmRA/pmDE from J2016.0 to ${targetEpochText} (or kept at J2016.0 when pmRA/pmDE are absent).`
  })()

  const wiseViewUrl = `http://byw.tools/wiseview#ra=${p.coords.ra.toFixed(6)}&dec=${p.coords.dec.toFixed(6)}`
  return (
    <div className="panel">
      <section className="tool">
        <h4>{vi ? 'Ảnh tham chiếu hồng ngoại WISE' : 'WISE infrared reference'}</h4>
        <p className="caption">{vi ? 'Khám phá ảnh quan sát WISE và NEOWISE trong WiseView. Vị trí bầu trời đã chọn có thể khác vị trí của mục tiêu ở các thời điểm cũ.' : "Explore WISE and NEOWISE observations in WiseView. The selected sky position may differ from the target's location at older epochs."}</p>
        <a className="btn btn-secondary" href={wiseViewUrl} target="_blank" rel="noopener noreferrer"><StableLabel text={vi ? 'Mở vị trí này trong WiseView ↗' : 'Open this position in WiseView ↗'} alt={vi ? 'Open this position in WiseView ↗' : 'Mở vị trí này trong WiseView ↗'} /></a>
        {p.target && !hasUnwiseInMainViewer && <WiseReference target={p.target} />}
        {p.target && !hasUnwiseInMainViewer && p.target.key in wiseReferenceConfig.blinkManifests && <UnwiseBlink key={p.target.key} target={p.target} />}
      </section>
      <section className="tool">
        <h4>{vi ? 'Sao Gaia DR3 trên bản đồ' : 'Gaia DR3 stars on the map'}</h4>
        {isDssFallback && (
          <div className="notice notice--warn" role="status">
            <AlertTriangle aria-hidden />
            <span>
              <strong>{vi ? 'Không khớp thời điểm (dùng DSS2 dự phòng):' : 'Epoch mismatch (DSS2 fallback):'}</strong> {vi ? `Bản đồ dùng các tấm quang học DSS2 từ thập niên 1950–1990. Dấu mục tiêu (DR1 MJD ${DR1_MAP_MJD}) và sao Gaia DR3 (J2016.0) không phải vị trí tức thời trên các tấm DSS2.` : `The sky map fell back to DSS2 optical plates (1950s–1990s). Target markers (DR1 epoch MJD ${DR1_MAP_MJD}) and Gaia DR3 crosses (J2016.0) are not instantaneous positions on the DSS2 plates.`}
            </span>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={p.gaia} onChange={(e) => p.setGaia(e.target.checked)} />
          {vi ? 'Hiện các sao trong danh mục Gaia DR3 quanh mục tiêu (dấu cộng xanh)' : 'Show Gaia DR3 catalog stars around this target (blue crosses)'}
        </label>
        <p className="caption">{gaiaCaption}</p>
      </section>

      <section className="tool">
        <h4>{vi ? 'Khoa học cộng đồng · Báo cáo ứng viên' : 'Citizen science · Report a candidate'}</h4>
        <p className="caption">
          {p.picked
            ? `${vi ? 'Vị trí đã đánh dấu' : 'Marked position'}: pixel (${p.picked.x}, ${p.picked.y}) · ${formatRaHms(p.picked.ra)} ${formatDecDms(p.picked.dec)}`
            : `${vi ? 'Vị trí trường' : 'Field position'}: ${formatRaHms(p.coords.ra)} ${formatDecDms(p.coords.dec)} ${vi ? '(nhấn vào ảnh để đánh dấu nguồn cụ thể)' : '(click the image to mark a specific source)'}`}
        </p>
        <div className="detail-block__row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(PATHS.forumNew, { state: { prefill: candidatePrefill } })}
          >
            <StableLabel text={vi ? 'Tạo ghi chú nghiên cứu trong diễn đàn' : 'Create research note in Forum'} alt={vi ? 'Create research note in Forum' : 'Tạo ghi chú nghiên cứu trong diễn đàn'} />
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(`# ${candidatePrefill.title}\n\n${candidatePrefill.body}`).then(() => {
                setReportCopied(true)
                setTimeout(() => setReportCopied(false), 1500)
              })
            }
          >
            {reportCopied ? <Check aria-hidden /> : <Copy aria-hidden />} {reportCopied ? (vi ? 'Đã sao chép' : 'Copied note') : (vi ? 'Sao chép báo cáo Markdown' : 'Copy Markdown report')}
          </button>
        </div>
      </section>

      <section className="tool">
        <h4>{vi ? 'Chia sẻ và nhúng' : 'Share and embed'}</h4>
        <CopyField label={vi ? 'Liên kết đến khung nhìn này' : 'Link to this view'} value={p.shareUrl} />
        <CopyField
          label={vi ? 'Mã nhúng' : 'Embed code'}
          multiline
          value={`<iframe src="${p.embedUrl}" title="SPHEREx Explorer: ${p.target?.name ?? 'sky view'}" width="960" height="640" style="border:0" loading="lazy"></iframe>`}
        />
      </section>
    </div>
  )
}
