import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TARGET_PRESETS } from "../targets";
import { HOME, project, renderGlobe, rotateView, type SurveyImage, type View } from "./projection";
import "./globe.css";

const LAYERS = {
  dr1w1: { title: "SPHEREx 3.383 µm", file: "spherex-3383" },
  dr1w2: { title: "SPHEREx 4.600 µm", file: "spherex-4600" },
  w1: { title: "AllWISE W1 · 3.4 µm", file: "wise-w1" },
  w2: { title: "AllWISE W2 · 4.6 µm", file: "wise-w2" },
  blend: { title: "SPHEREx + AllWISE", file: "spherex-3383", compare: "wise-w1" },
} as const;
type Layer = keyof typeof LAYERS;

const images = new Map<string, Promise<SurveyImage>>();

function loadImage(file: string) {
  let pending = images.get(file);
  if (!pending) {
    pending = (async () => {
      const image = new Image();
      image.src = `/sky-globe/${file}.webp`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const { width, height } = canvas;
      return { width, height, pixels: context.getImageData(0, 0, width, height).data };
    })();
    images.set(file, pending);
    void pending.catch(() => images.delete(file));
  }
  return pending;
}

const zoomTo = (value: number) => Math.min(4, Math.max(0.9, value));

export default function GlobePage() {
  const [view, setView] = useState<View>(HOME);
  const [layer, setLayer] = useState<Layer>("blend");
  const [targetKey, setTargetKey] = useState("barnard");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ layer: Layer; images?: SurveyImage[] }>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number }>(null);
  const target = TARGET_PRESETS.find((item) => item.key === targetKey)!;
  const pickedLayer = LAYERS[layer];
  const status = result?.layer === layer ? (result.images ? "ready" : "error") : "loading";

  useEffect(() => {
    let active = true;
    const files = "compare" in pickedLayer ? [pickedLayer.file, pickedLayer.compare] : [pickedLayer.file];
    Promise.all(files.map(loadImage)).then(
      (loaded) => { if (active) setResult({ layer, images: loaded }); },
      () => { if (active) setResult({ layer }); },
    );
    return () => { active = false; };
  }, [layer, pickedLayer, retry]);

  useEffect(() => {
    if (!result?.images || !canvas.current) return;
    const surface = canvas.current;
    const context = surface.getContext("2d")!;
    const [primary, secondary] = result.images;
    function draw(width: number) {
      const size = Math.max(1, Math.min(650, Math.round(width)));
      surface.width = size;
      surface.height = size;
      renderGlobe(context, view, primary, secondary);
    }
    draw(surface.clientWidth);
    const observer = new ResizeObserver(([entry]) => draw(entry.contentRect.width));
    observer.observe(surface);
    return () => observer.disconnect();
  }, [view, result]);

  function selectTarget(key: string) {
    const next = TARGET_PRESETS.find((item) => item.key === key);
    if (!next) return;
    setTargetKey(key);
    setView({ ra: next.ra, dec: next.dec, zoom: 1.5 });
  }

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.id !== event.pointerId) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    const scale = 130 / event.currentTarget.clientWidth;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setView((previous) => rotateView(previous, dx * scale / previous.zoom, dy * scale / previous.zoom));
  }

  function keyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8],
    };
    const change = steps[event.key];
    if (!change) return;
    event.preventDefault();
    setView((previous) => rotateView(previous, ...change));
  }

  const framesUrl = `/the-eyes?${new URLSearchParams({ q: target.key, det: "6" })}`;
  return (
    <main className="globe-page">
      <header className="globe-header">
        <a className="globe-home" href="/globe"><span aria-hidden="true">✦</span> SPHEREx Sky Viewer</a>
        <a href="/">Blink Viewer ↗</a>
      </header>
      <div className="globe-layout">
        <section className="globe-display" aria-labelledby="globe-title">
          <div className="globe-title">
            <h1 id="globe-title">3D Sky Globe</h1>
            <p>Drag to rotate or use arrow keys</p>
          </div>
          <div className="globe-viewport" aria-busy={status === "loading"}>
            <canvas ref={canvas} tabIndex={0} aria-label="Interactive sky globe, use arrow keys to rotate"
              onPointerDown={startDrag} onPointerMove={moveDrag}
              onLostPointerCapture={() => { drag.current = null; }} onKeyDown={keyboard} />
            {TARGET_PRESETS.map((item) => {
              const point = project(view, item.ra, item.dec);
              const x = 50 + point.x * 44 * view.zoom;
              const y = 50 - point.y * 44 * view.zoom;
              if (!point.visible || x < 3 || x > 97 || y < 3 || y > 97) return null;
              return <button key={item.key} type="button" className="globe-marker"
                aria-label={item.name} title={item.name} data-active={item.key === targetKey}
                style={{ left: `${x}%`, top: `${y}%` }} onClick={() => selectTarget(item.key)} />;
            })}
            {status !== "ready" && <div className="globe-status" role="status">
              {status === "error" ? <button type="button" onClick={() => { setResult(undefined); setRetry(retry + 1); }}>
                Could not load sky imagery. Retry
              </button> : "Loading all-sky imagery…"}
            </div>}
          </div>
          <div className="globe-readout">
            <span>RA {view.ra.toFixed(1)}° <span aria-hidden="true">·</span> Dec {view.dec.toFixed(1)}°</span>
            <button type="button" onClick={() => setView(HOME)}>Galactic center</button>
          </div>
        </section>
        <aside className="globe-controls" aria-label="Sky globe controls">
          <div className="globe-field">
            <label htmlFor="survey-layer">Infrared survey layer</label>
            <select id="survey-layer" value={layer} onChange={(event) => setLayer(event.target.value as Layer)}>
              {Object.entries(LAYERS).map(([key, item]) => <option key={key} value={key}>{item.title}</option>)}
            </select>
            {layer === "blend" && <p><span className="globe-cyan">■</span> SPHEREx 3.383 µm &nbsp; <span className="globe-warm">■</span> AllWISE W1<br />Visual color blend, uncalibrated flux.</p>}
          </div>
          <div className="globe-field">
            <label htmlFor="globe-zoom">Zoom</label>
            <input id="globe-zoom" type="range" min="0.9" max="4" step="0.1" value={view.zoom}
              onChange={(event) => setView({ ...view, zoom: zoomTo(Number(event.target.value)) })} />
          </div>
          <div className="globe-field">
            <label htmlFor="globe-target">Observation target</label>
            <select id="globe-target" value={targetKey} onChange={(event) => selectTarget(event.target.value)}>
              {TARGET_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
            </select>
            <p>{target.objectType}</p>
            <p className="globe-coordinates">RA {target.ra.toFixed(3)}° · Dec {target.dec.toFixed(3)}° · J2000</p>
            <a className="globe-open" href={framesUrl}>Open Blink Viewer ↗</a>
          </div>
          <footer className="globe-credits">
            All-sky imagery from <a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html">SPHEREx DR1 / IRSA</a> and <a href="https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W1/">AllWISE / CDS</a>.
          </footer>
        </aside>
      </div>
    </main>
  );
}
