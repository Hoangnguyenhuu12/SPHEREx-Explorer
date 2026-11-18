import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildSpherexObservatory, disposeSpherexObservatory } from './spherexModel'

interface SceneProps {
  interactive: boolean
  reduceMotion: boolean
  dragOffset: React.RefObject<{ yaw: number; pitch: number; active: boolean }>
}

/**
 * Generates a neutral bright-studio PMREM environment with soft key panels so
 * brushed aluminum shield interiors, metallic bus panels, and solar glass catch gentle
 * reflections across 360° rotation while outer matte-white thermal paint stays true white.
 */
function buildStudioEnvironment(gl: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene()
  envScene.background = new THREE.Color('#28324a')

  const skyGeo = new THREE.SphereGeometry(20, 24, 16)
  const skyMat = new THREE.MeshBasicMaterial({ color: '#33405c', side: THREE.BackSide })
  envScene.add(new THREE.Mesh(skyGeo, skyMat))

  const panels: { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number]; color: string }[] = [
    // Crisp white studio overhead softboxes keep the outer hull unmistakably bright white
    { pos: [2, 11, 5], rot: [-Math.PI / 3, 0.2, 0], scale: [12, 7], color: '#ffffff' },
    { pos: [-6, 6, 5], rot: [-Math.PI / 6, -Math.PI / 3, 0], scale: [8, 5], color: '#e6f0ff' },
    // Top-right warm gold/amber highlight panel reflected gently onto metallic white & steel facets
    { pos: [8, 6, 1], rot: [-Math.PI / 5, Math.PI / 2.6, 0], scale: [10, 6], color: '#ffd99e' },
    // Bottom-left pastel pink/violet bounce panel giving metallic white & solar frames a cosmic sheen
    { pos: [-7, -6, 3], rot: [Math.PI / 3.2, -Math.PI / 3.2, 0], scale: [10, 6], color: '#f39ad5' },
  ]
  const panelGeo = new THREE.PlaneGeometry(1, 1)
  const panelMats: THREE.MeshBasicMaterial[] = []

  for (const p of panels) {
    const mat = new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide })
    panelMats.push(mat)
    const mesh = new THREE.Mesh(panelGeo, mat)
    mesh.position.set(...p.pos)
    mesh.rotation.set(...p.rot)
    mesh.scale.set(p.scale[0], p.scale[1], 1)
    envScene.add(mesh)
  }

  const pmrem = new THREE.PMREMGenerator(gl)
  pmrem.compileEquirectangularShader()
  const target = pmrem.fromScene(envScene, 0.04)

  pmrem.dispose()
  skyGeo.dispose()
  skyMat.dispose()
  panelGeo.dispose()
  panelMats.forEach((m) => m.dispose())
  return target
}

function attachEnvironment(scene: THREE.Scene, gl: THREE.WebGLRenderer): () => void {
  const envTarget = buildStudioEnvironment(gl)
  const prevEnv = scene.environment
  scene.environment = envTarget.texture
  return () => {
    scene.environment = prevEnv
    envTarget.dispose()
  }
}

/**
 * Adds a very subtle, airy micro-grain breakup across midtone and bright facets without
 * darkening shaded undersides or turning surfaces black.
 */
function applySubtleGrainShader(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>()
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const list = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of list) {
      if (!mat || seen.has(mat)) continue
      seen.add(mat)
      if (mat.name === 'Telescope_Lens_Cyan_Glow') continue
      const isWhiteExterior = mat.name === 'Shield_Thermal_Matte_White' || mat.name === 'Bus_Thermal_White'
      const strength = isWhiteExterior ? '0.048' : '0.02'
      mat.customProgramCacheKey = () => (isWhiteExterior ? 'spherex-white-grain-v2' : 'spherex-soft-grain-v2')
      mat.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `
          vec2 spUv = floor( gl_FragCoord.xy );
          float spFine = fract( sin( dot( spUv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          float spCell = fract( sin( dot( floor( gl_FragCoord.xy * 0.55 ), vec2( 39.346, 11.135 ) ) ) * 24634.6345 );
          float spNoise = mix( spFine, spCell, 0.35 );
          float spLuma = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
          float spWeight = mix( 0.25, 1.0, clamp( spLuma, 0.0, 1.0 ) );
          gl_FragColor.rgb = max( vec3( 0.0 ), gl_FragColor.rgb + ( spNoise - 0.46 ) * ${strength} * spWeight );
          #include <dithering_fragment>
          `,
        )
      }
      mat.needsUpdate = true
    }
  })
}

function ObservatoryMesh({ interactive, reduceMotion, dragOffset }: SceneProps) {
  const pivotRef = useRef<THREE.Group>(null)
  const spinRef = useRef(0)
  const { camera, gl, scene } = useThree()
  const model = useMemo(() => {
    const built = buildSpherexObservatory()
    applySubtleGrainShader(built)
    return built
  }, [])

  useEffect(() => {
    camera.lookAt(0, 0.05, 0)
  }, [camera])

  useEffect(() => attachEnvironment(scene, gl), [gl, scene])

  useEffect(() => () => disposeSpherexObservatory(model), [model])

  const basePitch = 0.28
  const baseYaw = 0.56
  const baseRoll = -0.18

  useFrame((state, delta) => {
    const g = pivotRef.current
    if (!g) return
    const t = state.clock.getElapsedTime()
    if (!reduceMotion && !dragOffset.current.active) spinRef.current += Math.min(delta, 0.1) * 0.16
    const idlePitch = reduceMotion ? 0 : Math.cos(t * 0.31) * 0.07
    const targetYaw = baseYaw + spinRef.current + (interactive ? dragOffset.current.yaw : 0)
    const targetPitch = basePitch + idlePitch + (interactive ? dragOffset.current.pitch : 0)

    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetYaw, 0.14)
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetPitch, 0.14)
    g.rotation.z = baseRoll
    g.position.y = reduceMotion ? 0 : Math.sin(t * 0.8) * 0.08
  })

  return (
    <group ref={pivotRef} rotation={[basePitch, baseYaw, baseRoll]}>
      <group position={[0, -1.26, 0]}>
        <primitive object={model} />
      </group>
    </group>
  )
}

/** Interactive 3D Three.js render of the faceted SPHEREx Space Observatory with clean matte-white lighting and pure transparent background. */
export default function SpherexCraft3D({
  className,
  decorative = false,
  interactive = false,
}: {
  className?: string
  decorative?: boolean
  interactive?: boolean
}) {
  const dragOffset = useRef({ yaw: 0, pitch: 0, active: false })
  const lastPointer = useRef({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const reduceMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(151, 189, 255, 0.22) 0%, rgba(192, 144, 235, 0.1) 32%, transparent 68%)',
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? (dragging ? 'grabbing' : 'grab') : undefined,
        touchAction: interactive ? 'none' : undefined,
        userSelect: interactive ? 'none' : undefined,
      }}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': 'Interactive 3D model of the SPHEREx space observatory' })}
      onPointerDown={
        interactive
          ? (e) => {
              e.stopPropagation()
              dragOffset.current.active = true
              lastPointer.current = { x: e.clientX, y: e.clientY }
              setDragging(true)
              if (typeof e.currentTarget.setPointerCapture === 'function') {
                try {
                  e.currentTarget.setPointerCapture(e.pointerId)
                } catch {
                  // Ignore synthetic events in tests without active pointer IDs.
                }
              }
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (e) => {
              if (!dragOffset.current.active) return
              const dx = e.clientX - lastPointer.current.x
              const dy = e.clientY - lastPointer.current.y
              lastPointer.current = { x: e.clientX, y: e.clientY }
              dragOffset.current.yaw += dx * 0.012
              dragOffset.current.pitch = THREE.MathUtils.clamp(dragOffset.current.pitch + dy * 0.009, -1.2, 1.2)
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? (e) => {
              dragOffset.current.active = false
              setDragging(false)
              if (typeof e.currentTarget.releasePointerCapture === 'function') {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId)
                } catch {
                  // Ignore already-released pointer IDs.
                }
              }
            }
          : undefined
      }
      onPointerCancel={
        interactive
          ? () => {
              dragOffset.current.active = false
              setDragging(false)
            }
          : undefined
      }
    >
      <Canvas
        dpr={[1, 2]}
        shadows
        resize={{ scroll: false, offsetSize: true }}
        camera={{ position: [0.05, 3.05, 7.9], fov: 34 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        style={{ width: '100%', height: '100%', pointerEvents: interactive ? 'auto' : 'none' }}
      >
        {/* Even, clean illumination so matte-white shields, silver aluminum, and undersides never crush black */}
        <ambientLight intensity={0.95} color="#f5f8ff" />
        <hemisphereLight args={['#ffffff', '#6d7a99', 0.85]} />

        {/* Soft overhead key light for gentle dimensional shadows inside nested funnels */}
        <directionalLight
          position={[3.6, 6.8, 5.2]}
          intensity={1.35}
          color="#fffef9"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={1}
          shadow-camera-far={20}
          shadow-camera-left={-3}
          shadow-camera-right={3}
          shadow-camera-top={3}
          shadow-camera-bottom={-3}
          shadow-bias={-0.0005}
        />

        {/* Soft neutral fill from front-left + bottom so bottom flange and silver bus stay bright and crisp */}
        <directionalLight position={[-4.5, 2.0, 4.0]} intensity={0.65} color="#e6f0ff" />
        <directionalLight position={[0.0, -5.0, 3.5]} intensity={0.55} color="#dce6fa" />

        {/* Soft pastel accent lights matching the space background ribbons onto metallic white & steel bevels */}
        <directionalLight position={[-5.8, -4.4, -1.6]} intensity={1.25} color="#f472b6" />
        <directionalLight position={[5.6, 5.0, -1.2]} intensity={1.1} color="#fcd34d" />

        {/* Cool and rose backlights lift the silhouette against the nebula. */}
        <directionalLight position={[-4, 3, -6]} intensity={1.15} color="#9acbff" />
        <directionalLight position={[4, 1, -6]} intensity={0.75} color="#f4a6dd" />

        <ObservatoryMesh interactive={interactive} reduceMotion={reduceMotion} dragOffset={dragOffset} />
      </Canvas>
    </div>
  )
}
