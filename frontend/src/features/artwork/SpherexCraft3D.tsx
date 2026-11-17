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
 * Generates an in-memory HDR-like studio reflection dome via PMREMGenerator so high-metalness
 * brushed aluminum shield interiors, metallic bus panels, and glossy solar glass reflect crisp highlights.
 */
function buildStudioEnvironment(gl: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene()
  envScene.background = new THREE.Color('#161b2e')

  const skyGeo = new THREE.SphereGeometry(20, 24, 16)
  const skyMat = new THREE.MeshBasicMaterial({ color: '#1b2238', side: THREE.BackSide })
  envScene.add(new THREE.Mesh(skyGeo, skyMat))

  const panels: { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number]; color: string }[] = [
    { pos: [6, 9, 6], rot: [-Math.PI / 4, Math.PI / 4, 0], scale: [10, 6], color: '#ffffff' },
    { pos: [-8, 5, 5], rot: [-Math.PI / 6, -Math.PI / 3, 0], scale: [8, 5], color: '#dbeafe' },
    { pos: [0, 12, -4], rot: [Math.PI / 2.2, 0, 0], scale: [12, 6], color: '#f8fafc' },
    { pos: [-4, -7, 6], rot: [Math.PI / 3, -Math.PI / 6, 0], scale: [9, 4], color: '#93c5fd' },
    { pos: [7, -4, -6], rot: [Math.PI / 4, Math.PI / 3, 0], scale: [8, 4], color: '#e2e8f0' },
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

function ObservatoryMesh({ interactive, reduceMotion, dragOffset }: SceneProps) {
  const pivotRef = useRef<THREE.Group>(null)
  const { camera, gl, scene } = useThree()
  const model = useMemo(() => buildSpherexObservatory(), [])

  useEffect(() => {
    camera.lookAt(0, 0.05, 0)
  }, [camera])

  useEffect(() => {
    const envTarget = buildStudioEnvironment(gl)
    const prevEnv = scene.environment
    scene.environment = envTarget.texture
    return () => {
      scene.environment = prevEnv
      envTarget.dispose()
    }
  }, [gl, scene])

  useEffect(() => () => disposeSpherexObservatory(model), [model])

  // Base 3/4 elevated showcase pose looking into the three nested hexagonal shields,
  // revealing the brushed aluminum interior, cyan lens under thin white tripod strut,
  // white/silver metallic bus, glossy glass solar cells, and base adapter ring.
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

/** Interactive 3D Three.js render of the faceted SPHEREx Space Observatory. */
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
        resize={{ scroll: false, offsetSize: true }}
        camera={{ position: [0.05, 3.05, 7.9], fov: 34 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', pointerEvents: interactive ? 'auto' : 'none' }}
      >
        <ambientLight intensity={0.85} color="#f8faff" />
        <hemisphereLight args={['#ffffff', '#47557a', 0.9]} />
        <directionalLight position={[4.5, 6.5, 6.5]} intensity={2.4} color="#ffffff" />
        <directionalLight position={[-5.5, 3.5, 4.5]} intensity={1.5} color="#e0f2fe" />
        <pointLight position={[0.4, 4.8, 2.5]} intensity={2.8} distance={14} color="#f0f9ff" />
        <ObservatoryMesh interactive={interactive} reduceMotion={reduceMotion} dragOffset={dragOffset} />
      </Canvas>
    </div>
  )
}
