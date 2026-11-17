import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { buildSpherexObservatory, disposeSpherexObservatory } from './spherexModel'

interface SceneProps {
  interactive: boolean
  reduceMotion: boolean
  dragOffset: React.RefObject<{ yaw: number; pitch: number; active: boolean }>
}

/**
 * Cleans low-alpha bloom tails and fades near the canvas border so post-processed WebGL
 * composites seamlessly over the starfield ribbons with zero rectangular seam.
 */
const AlphaCleanShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      float edge = smoothstep( 0.0, 0.08, min( min( vUv.x, 1.0 - vUv.x ), min( vUv.y, 1.0 - vUv.y ) ) );
      float cleanAlpha = smoothstep( 0.015, 0.06, texel.a ) * mix( texel.a, 1.0, 0.0 ) * edge;
      float outAlpha = texel.a * smoothstep( 0.012, 0.055, texel.a ) * edge;
      gl_FragColor = vec4( texel.rgb * step( 0.005, outAlpha ), outAlpha + cleanAlpha * 0.0 );
    }
  `,
}

/**
 * Generates an HDR-like studio reflection dome via PMREMGenerator accented with top-right warm
 * amber-gold and bottom-left magenta-purple strips so brushed aluminum & solar glass match the sky.
 */
function buildStudioEnvironment(gl: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene()
  envScene.background = new THREE.Color('#131728')

  const skyGeo = new THREE.SphereGeometry(20, 24, 16)
  const skyMat = new THREE.MeshBasicMaterial({ color: '#181e34', side: THREE.BackSide })
  envScene.add(new THREE.Mesh(skyGeo, skyMat))

  const panels: { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number]; color: string }[] = [
    // Top-right warm yellow/orange reflection strip
    { pos: [7, 8, 5], rot: [-Math.PI / 4, Math.PI / 4, 0], scale: [10, 6], color: '#ffd18c' },
    // Top zenith crisp white reflection strip
    { pos: [0, 12, -2], rot: [Math.PI / 2.1, 0, 0], scale: [12, 6], color: '#f1f5ff' },
    // Bottom-left pink/purple stylized rim bounce
    { pos: [-7, -6, 3], rot: [Math.PI / 3.5, -Math.PI / 4, 0], scale: [9, 5], color: '#e948ac' },
    // Upper-left cool cyan fill strip
    { pos: [-8, 5, 4], rot: [-Math.PI / 6, -Math.PI / 3, 0], scale: [7, 4], color: '#93c5fd' },
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
  const target = pmrem.fromScene(envScene, 0.03)

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
 * Injects a stippled / ordered-dither retro film-grain shader pass across PBR materials so
 * shaded faces match the speckled space artwork behind SPHEREx without losing metallic highlights.
 */
function applyRetroStippleShader(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>()
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const list = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of list) {
      if (!mat || seen.has(mat)) continue
      seen.add(mat)
      const isLens = mat.name === 'Telescope_Lens_Cyan_Glow'
      const grainStrength = isLens ? '0.02' : '0.072'
      mat.customProgramCacheKey = () => (isLens ? 'spherex-stipple-lens-v2' : 'spherex-stipple-v2')
      mat.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `
          vec2 spUv = floor( gl_FragCoord.xy );
          float spNoise = fract( sin( dot( spUv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          float spCell = fract( sin( dot( floor( gl_FragCoord.xy * 0.5 ), vec2( 39.346, 11.135 ) ) ) * 24634.6345 );
          float spGrain = mix( spNoise, spCell, 0.42 ) - 0.48;
          float spLuma = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
          float spWeight = mix( 1.0, 0.44, clamp( spLuma, 0.0, 1.0 ) );
          gl_FragColor.rgb = max( vec3( 0.0 ), gl_FragColor.rgb + spGrain * ${grainStrength} * spWeight );
          #include <dithering_fragment>
          `,
        )
      }
      mat.needsUpdate = true
    }
  })
}

/** Alpha-preserving UnrealBloom post-processing pass so only the glowing cyan lens and brightest edges emit a soft aura. */
function BloomComposer() {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef<{
    composer: EffectComposer
    bloomPass: UnrealBloomPass
    outputPass: OutputPass
    cleanPass: ShaderPass
    target: THREE.WebGLRenderTarget
  } | null>(null)

  useEffect(() => {
    const w = Math.max(1, size.width)
    const h = Math.max(1, size.height)
    const dpr = gl.getPixelRatio()
    const target = new THREE.WebGLRenderTarget(Math.round(w * dpr), Math.round(h * dpr), {
      type: THREE.HalfFloatType,
      samples: 4,
    })

    const composer = new EffectComposer(gl, target)
    composer.setPixelRatio(dpr)
    composer.setSize(w, h)

    const renderPass = new RenderPass(scene, camera)
    renderPass.clearColor = new THREE.Color(0x000000)
    renderPass.clearAlpha = 0

    // High threshold keeps midtone surfaces razor-crisp while blooming the cyan lens & hottest edges
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.28, 1.15)
    const outputPass = new OutputPass()
    const cleanPass = new ShaderPass(AlphaCleanShader)

    composer.addPass(renderPass)
    composer.addPass(bloomPass)
    composer.addPass(outputPass)
    composer.addPass(cleanPass)

    composerRef.current = { composer, bloomPass, outputPass, cleanPass, target }
    return () => {
      composerRef.current = null
      composer.dispose()
      bloomPass.dispose()
      outputPass.dispose()
      cleanPass.dispose()
      target.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera])

  useEffect(() => {
    const entry = composerRef.current
    if (!entry) return
    const w = Math.max(1, size.width)
    const h = Math.max(1, size.height)
    const dpr = gl.getPixelRatio()
    entry.composer.setPixelRatio(dpr)
    entry.composer.setSize(w, h)
    entry.bloomPass.setSize(w, h)
  }, [gl, size.width, size.height])

  useFrame(() => {
    composerRef.current?.composer.render()
  }, 1)

  return null
}

function ObservatoryMesh({ interactive, reduceMotion, dragOffset }: SceneProps) {
  const pivotRef = useRef<THREE.Group>(null)
  const { camera, gl, scene } = useThree()
  const model = useMemo(() => {
    const built = buildSpherexObservatory()
    applyRetroStippleShader(built)
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

  useFrame((state) => {
    const g = pivotRef.current
    if (!g) return
    const t = state.clock.getElapsedTime()
    const idleYaw = reduceMotion ? 0 : Math.sin(t * 0.42) * 0.24
    const idlePitch = reduceMotion ? 0 : Math.cos(t * 0.31) * 0.07
    const targetYaw = baseYaw + idleYaw + (interactive ? dragOffset.current.yaw : 0)
    const targetPitch = basePitch + idlePitch + (interactive ? dragOffset.current.pitch : 0)

    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetYaw, 0.14)
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetPitch, 0.14)
    g.rotation.z = baseRoll
  })

  return (
    <group ref={pivotRef} rotation={[basePitch, baseYaw, baseRoll]}>
      <group position={[0, -1.26, 0]}>
        <primitive object={model} />
      </group>
    </group>
  )
}

/** Interactive 3D Three.js render of the faceted SPHEREx Space Observatory with stylized rim lighting, bloom, AO, and retro-grain shader. */
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
        {/* Subtle low ambient + cool-plum hemisphere so deep nested AO crevices darken dramatically */}
        <ambientLight intensity={0.44} color="#e2ebff" />
        <hemisphereLight args={['#f5f8ff', '#28143b', 0.62]} />

        {/* Front-top shadow-casting key light keeps matte white thermal faces crisp & legible */}
        <directionalLight
          position={[1.2, 7.4, 5.4]}
          intensity={1.75}
          color="#f8fbff"
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

        {/* Top-right warm yellow/orange stylized rim & sun key */}
        <directionalLight position={[6.0, 5.6, -1.4]} intensity={2.1} color="#ff9e2c" />
        <pointLight position={[3.6, 4.2, -2.0]} intensity={11} distance={15} color="#ffd166" />

        {/* Bottom-left vibrant pink/purple rim light positioned to kiss the left/bottom silhouette without washing out front white faces */}
        <directionalLight position={[-6.5, -5.5, -2.8]} intensity={2.6} color="#f048b8" />
        <pointLight position={[-3.4, -3.5, -2.2]} intensity={14} distance={15} color="#a855f7" />

        <ObservatoryMesh interactive={interactive} reduceMotion={reduceMotion} dragOffset={dragOffset} />
        <BloomComposer />
      </Canvas>
    </div>
  )
}
