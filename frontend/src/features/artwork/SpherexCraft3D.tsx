import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
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
        <ambientLight intensity={1.15} color="#f8faff" />
        <hemisphereLight args={['#ffffff', '#47557a', 1.1]} />
        <directionalLight position={[4.5, 6.5, 6.5]} intensity={2.8} color="#fffcf5" />
        <directionalLight position={[-5.5, 3.5, 4.5]} intensity={1.7} color="#e0f2fe" />
        <pointLight position={[0.4, 4.8, 2.5]} intensity={3.2} distance={14} color="#f0f9ff" />
        <pointLight position={[-2.4, -3.2, 2.6]} intensity={2.1} distance={10} color="#f472b6" />
        <ObservatoryMesh interactive={interactive} reduceMotion={reduceMotion} dragOffset={dragOffset} />
      </Canvas>
    </div>
  )
}
