// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  angularSeparationArcsec,
  customizeContextMenuActions,
  escapeHtml,
  identifySkyLocation,
} from '../features/sky-map/contextMenu'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Aladin context menu customization & SIMBAD lookup', () => {
  it('patches snapshot, removes broken New image layer, rewires What is this? and HiPS2FITS', () => {
    const exportAsPNG = vi.fn()
    const inspect = vi.fn()
    const aladin = { exportAsPNG, getRaDec: () => [269.452, 4.693] }
    const raw = [
      { label: 'Copy position', action: vi.fn() },
      { label: { content: 'Take a snapshot' }, action: vi.fn() },
      {
        label: 'Add',
        subMenu: [
          { label: 'New image layer', action: vi.fn() },
          { label: 'New catalogue layer', action: vi.fn() },
        ],
      },
      { label: { content: 'What is this?' }, action: vi.fn() },
      { label: 'HiPS2FITS cutout', action: vi.fn() },
    ]

    const patched = customizeContextMenuActions(
      raw,
      aladin,
      () => ({ ra: 269.452, dec: 4.693 }),
      () => 60982,
      inspect,
    )

    expect(patched).toHaveLength(5)
    patched[1].action?.()
    expect(exportAsPNG).toHaveBeenCalledWith(true)

    const addMenu = patched[2].subMenu ?? []
    expect(addMenu).toHaveLength(1)
    expect(addMenu[0].label).toBe('New catalogue layer')

    expect(patched[4].label).toBe('View SPHEREx observations here')
    patched[4].action?.()
    expect(inspect).toHaveBeenCalledWith(269.452, 4.693)
  })

  it('escapes HTML entities cleanly and computes angular separation', () => {
    expect(escapeHtml('<script>"test"&\'x\'</script>')).toBe('&lt;script&gt;&quot;test&quot;&amp;&#39;x&#39;&lt;/script&gt;')
    expect(angularSeparationArcsec(10, 0, 10, 1 / 3600)).toBeCloseTo(1, 2)
  })

  it('identifies SIMBAD TAP match and displays safe escaped popup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [["NAME Barnard's star", 269.452, 4.693, 'PM*', 0.42]],
          }),
          { status: 200 },
        ),
      ),
    )
    const showPopup = vi.fn()
    const aladin = { getFov: () => [0.6, 0.6], showPopup }

    await identifySkyLocation(aladin, 269.452, 4.693)

    expect(showPopup).toHaveBeenCalledTimes(1)
    const [ra, dec, title, content] = showPopup.mock.calls[0]
    expect(ra).toBe(269.452)
    expect(dec).toBe(4.693)
    expect(title).toContain('NAME Barnard&#39;s star')
    expect(title).toContain('simbad.cfa.harvard.edu')
    expect(content).toContain('PM*')
    expect(content).toContain('0.4')
  })
})
