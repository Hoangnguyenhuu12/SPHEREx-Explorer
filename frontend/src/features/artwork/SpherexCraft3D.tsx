import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildSpherexObservatory, disposeSpherexObservatory } from './spherexModel'

interface SceneProps {
  interactive: boolean
  reduceMotion: boolean
  dragOffset: React.RefObject<{ yaw: number; pitch: number; active: boolean }>
}

function ObservatoryMesh({ interactive, reduceMotion, dragOffset }: SceneProps) {
  const pivotRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const model = useMemo(() => buildSpherexObservatory(), [])

  useEffect(() => {
    camera.lookAt(0, 0.05, 0)
  }, [camera])

  useEffect(() => () => disposeSpherexObservatory(model), [model])

  // Base 3/4 elevated showcase pose looking into the three nested hexagonal shields,
  // showing the internal telescope barrel, bipod struts, hexagonal gold bus, solar array, and base ring.
  const basePitch = 0.28
  const baseYaw = 0.56
  const baseRoll = -0.18

  useFrame((state) => {
    const g = pivotRef.current
    if (!g) return
    const t = state.clock.getElapsedTime()
    const idleYaw = reduceMotion ? 0 : Math.sin(t * 0.42) * 0.28
    const idlePitch = reduceMotion ? 0 : Math.cos(t * 0.31) * 0.08
    const targetYaw = baseYaw + idleYaw + (interactive ? dragOffset.current.yaw : 0)
    const targetPitch = basePitch + idlePitch + (interactive ? dragOffset.current.pitch : 0)

    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetYaw, 0.1)
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetPitch, 0.1)
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
        cursor: interactive ? 'grab' : undefined,
        touchAction: interactive ? 'none' : undefined,
      }}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': 'Interactive 3D model of the SPHEREx space observatory' })}
      onPointerDown={
        interactive
          ? (e) => {
              dragOffset.current.active = true
              lastPointer.current = { x: e.clientX, y: e.clientY }
              ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
              ;(e.currentTarget as HTMLDivElement).style.cursor = 'grabbing'
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
              dragOffset.current.yaw += dx * 0.01
              dragOffset.current.pitch = THREE.MathUtils.clamp(dragOffset.current.pitch + dy * 0.008, -1.1, 1.1)
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? (e) => {
              dragOffset.current.active = false
              ;(e.currentTarget as HTMLDivElement).style.cursor = 'grab'
            }
          : undefined
      }
      onPointerCancel={
        interactive
          ? (e) => {
              dragOffset.current.active = false
              ;(e.currentTarget as HTMLDivElement).style.cursor = 'grab'
            }
          : undefined
      }
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0.05, 2.55, 6.25], fov: 35 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', pointerEvents: interactive ? 'auto' : 'none' }}
      >
        <ambientLight intensity={0.62} color="#dce6ff" />
        <hemisphereLight args={['#f8f6ec', '#1b2640', 0.65]} />
        <directionalLight position={[5, 7, 5]} intensity={2.6} color="#fff3dc" />
        <directionalLight position={[-5, 2.5, -3.5]} intensity={1.5} color="#2f9dd0" />
        <pointLight position={[0.4, 4.6, 2.4]} intensity={2.4} distance={12} color="#e0f2fe" />
        <pointLight position={[-2.2, -3.2, 2.4]} intensity={2.0} distance={10} color="#e948ac" />
        <ObservatoryMesh interactive={interactive} reduceMotion={reduceMotion} dragOffset={dragOffset} />
      </Canvas>
    </div>
  )
}
