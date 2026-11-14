import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../../shared/api/mock/synth'

/**
 * Earth as a textured sphere rotating about its own fixed vertical (Y) axis, with illustrative
 * neighbours (Sun, Mercury, Venus, Moon, Mars) that also turn on their own axes.
 * Sizes and distances are not to scale. No CSS rotation anywhere.
 */

const SECONDS_PER_TURN = 48
const EARTH_RADIUS = 1

export type BodyName = 'sun' | 'mercury' | 'venus' | 'moon' | 'mars'

interface Props {
  paused: boolean
  launching: boolean
  onEarthClick: () => void
  onReady?: () => void
  onHover?: (hover: boolean) => void
  labels?: Partial<Record<BodyName, RefObject<HTMLElement | null>>>
}

const SUN_POS = new THREE.Vector3(-3.7, 1.5, -5)

function Earth({ paused, launching, onEarthClick, onHover, onReady }: Props) {
  const mesh = useRef<THREE.Mesh>(null)
  const texture = useLoader(THREE.TextureLoader, '/textures/earth-blue-marble-2048.jpg')
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  useEffect(() => {
    onReady?.()
  }, [onReady])

  useFrame((_, dt) => {
    if (!mesh.current) return
    if (!paused && !launching) mesh.current.rotation.y += (Math.PI * 2 * Math.min(dt, 0.1)) / SECONDS_PER_TURN
  })

  return (
    <group>
      <mesh
        ref={mesh}
        rotation={[0, -1.9, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onEarthClick()
        }}
        onPointerOver={() => onHover?.(true)}
        onPointerOut={() => onHover?.(false)}
      >
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
        <meshStandardMaterial map={texture} roughness={0.9} metalness={0} />
      </mesh>
      <mesh scale={1.025}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshBasicMaterial color="#5fb6e8" transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

/** Procedural surface so a body's spin is visible: base colour plus seeded blotches and bands. */
function makeSurface(seed: number, base: string, spots: string[], bands = 0): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  const rnd = mulberry32(seed)
  g.fillStyle = base
  g.fillRect(0, 0, 256, 128)
  for (let i = 0; i < bands; i++) {
    g.fillStyle = spots[i % spots.length]
    g.globalAlpha = 0.25 + rnd() * 0.25
    const y = rnd() * 128
    g.fillRect(0, y, 256, 4 + rnd() * 12)
  }
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = 0.18 + rnd() * 0.35
    g.fillStyle = spots[Math.floor(rnd() * spots.length)]
    g.beginPath()
    g.ellipse(rnd() * 256, rnd() * 128, 3 + rnd() * 18, 2 + rnd() * 9, rnd() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  return t
}

interface BodyProps {
  name: BodyName
  radius: number
  position: [number, number, number]
  spinSeconds: number
  texture: () => THREE.CanvasTexture
  paused: boolean
  registry: Map<BodyName, THREE.Object3D>
  orbit?: { radius: number; seconds: number; tilt: number; phase: number }
}

function Body({ name, radius, position, spinSeconds, texture, paused, registry, orbit }: BodyProps) {
  const mesh = useRef<THREE.Mesh>(null)
  const map = useMemo(texture, [texture])
  const angle = useRef(orbit?.phase ?? 0)
  useEffect(() => {
    if (mesh.current) registry.set(name, mesh.current)
    return () => {
      registry.delete(name)
      map.dispose()
    }
  }, [name, registry, map])
  useFrame((_, dt) => {
    const m = mesh.current
    if (!m || paused) return
    const step = Math.min(dt, 0.1)
    m.rotation.y += (Math.PI * 2 * step) / spinSeconds
    if (orbit) {
      angle.current += (Math.PI * 2 * step) / orbit.seconds
      const a = angle.current
      m.position.set(Math.cos(a) * orbit.radius, Math.sin(a) * orbit.radius * orbit.tilt, Math.sin(a) * orbit.radius * 0.9)
    }
  })
  return (
    <mesh ref={mesh} position={position} rotation={[0.2, 0, 0.1]}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  )
}

function Sun({ paused, registry }: { paused: boolean; registry: Map<BodyName, THREE.Object3D> }) {
  const mesh = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Sprite>(null)
  const surface = useMemo(() => makeSurface(11, '#ffcf5c', ['#ff9f2e', '#fff1a8', '#ffb43c'], 6), [])
  const glow = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,230,150,0.9)')
    grad.addColorStop(0.35, 'rgba(255,190,90,0.35)')
    grad.addColorStop(1, 'rgba(255,160,60,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  }, [])
  useEffect(() => {
    if (mesh.current) registry.set('sun', mesh.current)
    return () => {
      registry.delete('sun')
      surface.dispose()
      glow.dispose()
    }
  }, [registry, surface, glow])
  useFrame((state, dt) => {
    if (paused) return
    if (mesh.current) mesh.current.rotation.y += (Math.PI * 2 * Math.min(dt, 0.1)) / 60
    if (halo.current) {
      const s = 2.9 + Math.sin(state.clock.elapsedTime * 1.3) * 0.12
      halo.current.scale.set(s, s, 1)
    }
  })
  return (
    <group position={SUN_POS}>
      <mesh ref={mesh}>
        <sphereGeometry args={[0.62, 48, 48]} />
        <meshBasicMaterial map={surface} />
      </mesh>
      <sprite ref={halo} scale={[2.9, 2.9, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  )
}

const LABEL_OFFSET: Record<BodyName, [number, number]> = {
  sun: [-12, -86],
  mercury: [10, -22],
  venus: [14, 10],
  moon: [14, 12],
  mars: [12, -22],
}

/** Keeps the DOM name labels next to the projected bodies at any canvas size. */
function LabelTracker({ labels, registry }: { labels?: Props['labels']; registry: Map<BodyName, THREE.Object3D> }) {
  const { camera, size } = useThree()
  const v = useRef(new THREE.Vector3())
  useFrame(() => {
    if (!labels) return
    for (const [name, ref] of Object.entries(labels) as [BodyName, RefObject<HTMLElement | null>][]) {
      const el = ref.current
      const obj = registry.get(name)
      if (!el || !obj) continue
      obj.getWorldPosition(v.current)
      v.current.project(camera)
      const [dx, dy] = LABEL_OFFSET[name]
      const x = ((v.current.x + 1) / 2) * size.width + dx
      const y = ((1 - v.current.y) / 2) * size.height + dy
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      el.style.opacity = v.current.z < 1 ? '1' : '0'
    }
  })
  return null
}

/** Camera rush toward Earth during activation. */
function CameraRig({ launching }: { launching: boolean }) {
  const { camera } = useThree()
  const start = useRef<number | null>(null)
  useFrame((state) => {
    if (!launching) {
      start.current = null
      camera.position.set(0, 0, 4.6)
      camera.lookAt(0, 0, 0)
      return
    }
    if (start.current === null) start.current = state.clock.elapsedTime
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / 0.52)
    const e = t * t * t
    camera.position.z = 4.6 - e * 3.3
    camera.lookAt(0, 0, 0)
  })
  return null
}

const TEX = {
  mercury: () => makeSurface(3, '#9c968d', ['#6f6a63', '#bdb7ad', '#857f77']),
  venus: () => makeSurface(5, '#e8cf94', ['#d9b26a', '#f3e2b8', '#c99d55'], 10),
  moon: () => makeSurface(7, '#cfc9bd', ['#8e897f', '#e6e1d6', '#a39d92']),
  mars: () => makeSurface(9, '#b5603f', ['#7c3a24', '#d07a52', '#e8d6c6']),
}

export default function EarthScene(props: Props) {
  const registry = useMemo(() => new Map<BodyName, THREE.Object3D>(), [])
  const still = props.paused || props.launching
  return (
    <Canvas
      className="earth-canvas"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.6], fov: 32, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
      frameloop="always"
    >
      <ambientLight intensity={0.5} />
      {/* Sunlight comes from the Sun's direction. */}
      <directionalLight position={[SUN_POS.x, SUN_POS.y, SUN_POS.z + 8]} intensity={2.8} color="#fff6e8" />
      <pointLight position={SUN_POS} intensity={6} distance={30} color="#ffd9a0" />
      <Suspense fallback={null}>
        <Earth {...props} />
      </Suspense>
      <Sun paused={still} registry={registry} />
      <Body name="mercury" radius={0.07} position={[-1.75, 1.08, -2.4]} spinSeconds={30} texture={TEX.mercury} paused={still} registry={registry} />
      <Body name="venus" radius={0.15} position={[-2.15, -0.95, -1.2]} spinSeconds={40} texture={TEX.venus} paused={still} registry={registry} />
      <Body
        name="moon"
        radius={0.16}
        position={[1.7, -0.5, 0.4]}
        spinSeconds={36}
        texture={TEX.moon}
        paused={still}
        registry={registry}
        orbit={{ radius: 2.05, seconds: 70, tilt: 0.3, phase: -0.35 }}
      />
      <Body name="mars" radius={0.12} position={[2.5, 1.15, -1.8]} spinSeconds={26} texture={TEX.mars} paused={still} registry={registry} />
      <LabelTracker labels={props.labels} registry={registry} />
      <CameraRig launching={props.launching} />
    </Canvas>
  )
}
