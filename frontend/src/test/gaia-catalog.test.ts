// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { gaiaUrl, parseVizierVotable, propagateGaiaCatalog } from '../features/sky-map/gaia'
import { ALLWISE_MAP_MJD, DR1_MAP_MJD, GAIA_DR3_EPOCH_MJD } from '../shared/config/epoch'

const SAMPLE_VOTABLE = `<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE version="1.4" xmlns="http://www.ivoa.net/xml/VOTable/v1.3">
  <RESOURCE>
    <TABLE>
      <FIELD name="RA_ICRS" datatype="double"/>
      <FIELD name="DE_ICRS" datatype="double"/>
      <FIELD name="Source" datatype="long"/>
      <FIELD name="Gmag" datatype="float"/>
      <FIELD name="pmRA" datatype="double"/>
      <FIELD name="pmDE" datatype="double"/>
      <DATA>
        <TABLEDATA>
          <TR><TD>269.448500</TD><TD>4.739400</TD><TD>4472832130942169472</TD><TD>8.19</TD><TD>-801.551</TD><TD>10362.394</TD></TR>
          <TR><TD>269.450000</TD><TD>4.750000</TD><TD>4472835979229621248</TD><TD>17.50</TD><TD></TD><TD></TD></TR>
        </TABLEDATA>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`

describe('Gaia DR3 VOTable parsing and epoch propagation', () => {
  it('requests pmRA and pmDE from VizieR', () => {
    const url = gaiaUrl('https://vizier.cds.unistra.fr', 269.44, 4.76, 0.1)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('-out')).toContain('pmRA')
    expect(parsed.searchParams.get('-out')).toContain('pmDE')
  })

  it('parses VOTable rows including missing proper motions and preserves 64-bit sourceId strings', () => {
    const stars = parseVizierVotable(SAMPLE_VOTABLE)
    expect(stars).toHaveLength(2)
    expect(stars[0].sourceId).toBe('4472832130942169472')
    expect(stars[0].pmRa).toBeCloseTo(-801.551, 3)
    expect(stars[0].pmDec).toBeCloseTo(10362.394, 3)
    expect(stars[1].pmRa).toBeNull()
    expect(stars[1].pmDec).toBeNull()
  })

  it('rejects VizieR responses with QUERY_STATUS=ERROR', () => {
    const errXml = `<?xml version="1.0"?><VOTABLE><INFO name="QUERY_STATUS" value="ERROR">db down</INFO></VOTABLE>`
    expect(() => parseVizierVotable(errXml)).toThrow('db down')
  })

  it('propagates stars with pmRA/pmDE to DR1_MAP_MJD and AllWISE, while keeping missing PM and DSS2 fallback at J2016.0', () => {
    const stars = parseVizierVotable(SAMPLE_VOTABLE)
    const dr1 = propagateGaiaCatalog(stars, DR1_MAP_MJD)
    expect(dr1.total).toBe(2)
    expect(dr1.propagatedCount).toBe(1)
    expect(dr1.staticCount).toBe(1)
    const dtYears = (DR1_MAP_MJD - GAIA_DR3_EPOCH_MJD) / 365.25
    expect((dr1.stars[0].displayDec - stars[0].dec) * 3600).toBeCloseTo((10362.394 * dtYears) / 1000, 3)
    expect(dr1.stars[1].displayRa).toBe(stars[1].ra)
    expect(dr1.stars[1].displayDec).toBe(stars[1].dec)

    const wise = propagateGaiaCatalog(stars, ALLWISE_MAP_MJD)
    expect(wise.stars[0].displayDec).toBeLessThan(stars[0].dec)

    const dss2 = propagateGaiaCatalog(stars, undefined)
    expect(dss2.propagatedCount).toBe(0)
    expect(dss2.staticCount).toBe(2)
    expect(dss2.stars[0].displayDec).toBe(stars[0].dec)
  })
})
