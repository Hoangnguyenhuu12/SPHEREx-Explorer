import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { alignToSun, attitude, bestViewAngle, ORBIT_RADIUS, ORBIT_SECONDS, orbitFrame, orbitPosition } from './spherexOrbit'

/**
 * SPHEREx built from simple shapes in metres, using the published dimensions (JPL press kit):
 * three nested photon-shield cones 1.7 m tall and 3.2 m across (white outside, reflective inside),
 * three V-groove radiator stages, the spacecraft bus at the bottom, one 2.67 × 1.02 m solar panel;
 * 2.6 m tall overall. Bus shape and panel mounting are not described in text and are assumed.
 */

/** Metres → scene units. The real craft would be ~0.0004 Earth radii; drawn ~270× larger. */
const CRAFT_SCALE = 0.042
/** Model origin at roughly the middle of the 2.6 m stack so it orbits around its centre. */
const CENTER_Y = 1.3

function panelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 96
  const g = c.getContext('2d')!
  g.fillStyle = '#1b2c63'
  g.fillRect(0, 0, 256, 96)
  g.strokeStyle = 'rgba(160, 190, 255, 0.45)'
  g.lineWidth = 2
  for (let x = 0; x <= 256; x += 21.3) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 96)
    g.stroke()
  }
  for (let y = 0; y <= 96; y += 24) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(256, y)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function SpherexModel() {
  const panelMap = useMemo(() => panelTexture(), [])
  useEffect(() => () => panelMap.dispose(), [panelMap])
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }), [])
  const mirror = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfd6de', roughness: 0.22, metalness: 0.95, side: THREE.DoubleSide }), [])
  useEffect(
    () => () => {
      white.dispose()
      mirror.dispose()
    },
    [white, mirror],
  )

  return (
    <group position={[0, -CENTER_Y, 0]}>
      {/* Spacecraft bus (BAE Systems). Hexagonal prism: assumption, shape not given in text. */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.75, 0.75, 0.6, 6]} />
        <meshStandardMaterial color="#4a4d5a" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Two cone-shaped Ka-band antennas under the bus. */}
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x, -0.08, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.12, 0.16, 16]} />
          <meshStandardMaterial color="#b9bcc4" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Single fixed solar panel, 2.67 × 1.02 m, on the Sun side (+Z), parallel to the cone axis. */}
      <mesh position={[0, 0.42, 0.8]}>
        <boxGeometry args={[2.67, 1.02, 0.04]} />
        <meshStandardMaterial map={panelMap} roughness={0.35} metalness={0.3} />
      </mesh>
      {/* Three V-groove radiator stages; the lower two are wider. */}
      {[
        [0.66, 1.12],
        [0.78, 1.12],
        [0.9, 0.98],
      ].map(([y, r]) => (
        <mesh key={y} position={[0, y, 0]} material={mirror}>
          <cylinderGeometry args={[r, 0.32, 0.1, 40, 1, true]} />
        </mesh>
      ))}
      {/* Telescope (20 cm aperture), tipped 8° towards the solar panel. */}
      <mesh position={[0, 1.22, 0.04]} rotation={[THREE.MathUtils.degToRad(8), 0, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.45, 24]} />
        <meshStandardMaterial color="#20222b" roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Three nested photon-shield cones, opening away from Earth; cone angle grows outward. */}
      <mesh position={[0, 1.76, 0]} material={mirror}>
        <cylinderGeometry args={[1.22, 0.8, 1.52, 48, 1, true]} />
      </mesh>
      <mesh position={[0, 1.76, 0]} material={mirror}>
        <cylinderGeometry args={[1.4, 0.87, 1.62, 48, 1, true]} />
      </mesh>
      <mesh position={[0, 1.75, 0]} material={white}>
        <cylinderGeometry args={[1.6, 0.95, 1.7, 56, 1, true]} />
      </mesh>
    </group>
  )
}

function OrbitPath({ frame }: { frame: ReturnType<typeof orbitFrame> }) {
  const line = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 160; k++) pts.push(orbitPosition(frame, (k / 160) * Math.PI * 2, ORBIT_RADIUS))
    const geometry = new THREE.BufferGeometry().setFromPoints(pts)
    const material = new THREE.LineDashedMaterial({ color: '#2f9dd0', dashSize: 0.035, gapSize: 0.025, transparent: true, opacity: 0.55, depthWrite: false })
    const l = new THREE.Line(geometry, material)
    l.computeLineDistances()
    return l
  }, [frame])
  useEffect(
    () => () => {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    },
    [line],
  )
  return <primitive object={line} />
}

/** Values the scene updates every frame and SPHEREx reads. */
export interface SceneLive {
  /** Direction from Earth towards the Sun (world space). */
  light: THREE.Vector3
  /** Sun direction the orbit plane was first built for. */
  referenceLight: THREE.Vector3
  /** Extra model size when Earth is drawn small (solar view). */
  craftBoost: number
}

interface Props {
  live: SceneLive
  paused: boolean
  /** The moving group is registered here so the DOM label can follow it. */
  registry: Map<string, THREE.Object3D>
}

/**
 * SPHEREx in its sun-synchronous dawn–dusk polar orbit, riding the day–night line. Lives inside
 * Earth's group (so it follows Earth). As the Sun's direction changes, the whole orbit turns about
 * Earth's axis to keep facing it, which is what "sun-synchronous" means.
 */
export function SpherexSatellite({ live, paused, registry }: Props) {
  const frame = useMemo(() => orbitFrame(live.referenceLight), [live.referenceLight])
  const angle = useRef(bestViewAngle(frame))
  const plane = useRef<THREE.Group>(null)
  const craft = useRef<THREE.Group>(null)
  const tmpPos = useMemo(() => new THREE.Vector3(), [])
  const tmpRot = useMemo(() => new THREE.Matrix4(), [])
  const tmpQ = useMemo(() => new THREE.Quaternion(), [])
  const localLight = useMemo(() => new THREE.Vector3(), [])

  const place = () => {
    const g = craft.current
    const p = plane.current
    if (!g || !p) return
    alignToSun(live.referenceLight, live.light, tmpQ)
    p.quaternion.copy(tmpQ)
    // Attitude is computed in the turned plane's frame, with the sunlight expressed in it too.
    localLight.copy(live.light).applyQuaternion(tmpQ.invert())
    orbitPosition(frame, angle.current, ORBIT_RADIUS, tmpPos)
    g.position.copy(tmpPos)
    g.quaternion.setFromRotationMatrix(attitude(tmpPos, localLight, tmpRot))
    g.scale.setScalar(CRAFT_SCALE * live.craftBoost)
  }

  useEffect(() => {
    place()
    if (craft.current) registry.set('spherex', craft.current)
    return () => {
      registry.delete('spherex')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, registry])

  useFrame((_, dt) => {
    if (!paused) angle.current += (Math.PI * 2 * Math.min(dt, 0.1)) / ORBIT_SECONDS
    place()
  })

  return (
    <group ref={plane}>
      <OrbitPath frame={frame} />
      <group ref={craft} scale={CRAFT_SCALE}>
        <SpherexModel />
      </group>
    </group>
  )
}
