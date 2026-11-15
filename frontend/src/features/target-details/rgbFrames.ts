import type { Frame, FramesResponse, Grid } from '../../shared/api/types'

// The DR1 sequence publisher groups observations less than two days apart.
const MAX_EPOCH_SPAN_DAYS = 2

type RgbSelection =
  | { status: 'missing' | 'incompatible' | 'different-epochs' }
  | { status: 'ready'; grid: Grid; red: Frame; green: Frame; blue: Frame }

function sameGrid(a: Grid, b: Grid) {
  return a.width === b.width && a.height === b.height && a.projection === b.projection
    && a.pixscale_arcsec === b.pixscale_arcsec
    && Math.abs(a.center_ra - b.center_ra) < 1e-6 && Math.abs(a.center_dec - b.center_dec) < 1e-6
}

function nearest(frames: Frame[], mjd: number): Frame | undefined {
  return frames.reduce<Frame | undefined>(
    (best, frame) => !best || Math.abs(frame.mjd - mjd) < Math.abs(best.mjd - mjd) ? frame : best,
    undefined,
  )
}

export function selectRgbFrames(r: FramesResponse, g: FramesResponse, b: FramesResponse, activeMjd?: number): RgbSelection {
  if (!r.frames.length || !g.frames.length || !b.frames.length) return { status: 'missing' }
  if (!sameGrid(r.grid, g.grid) || !sameGrid(r.grid, b.grid)) return { status: 'incompatible' }

  const red = nearest(r.frames, activeMjd ?? r.frames[0].mjd)!
  const green = nearest(g.frames, red.mjd)!
  const blue = nearest(b.frames, red.mjd)!
  const epochs = [red.mjd, green.mjd, blue.mjd]
  if (Math.max(...epochs) - Math.min(...epochs) > MAX_EPOCH_SPAN_DAYS) return { status: 'different-epochs' }
  return { status: 'ready', grid: r.grid, red, green, blue }
}
