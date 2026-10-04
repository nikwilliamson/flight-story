import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { Color, CustomBlending, HalfFloatType, Mesh, OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera as Ortho, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderTarget } from 'three'

const clearColor = new Color()

/**
 * Where a layer fades out instead of stopping at a hard edge, CSS px from the top: fully gone at `from`, fully there
 * by `to`; likewise at the bottom over `bottom` px.
 */
export interface Fade {
  from: number
  to: number
  bottom: number
}

/**
 * A screen-space scene drawn on top of everything rendered at a lower priority, in CSS px with the origin at the
 * top-left (y down the screen is negative y). Like drei's Hud, plus an optional fade: on phones the story text
 * scrolls in the space under the pinned globe and dissolves into it as it rises, instead of being cut off.
 */
export function ScreenLayer({ priority, fade, children }: { priority: number; fade?: Fade | null; children: ReactNode }) {
  const gl = useThree((s) => s.gl)
  const { width, height } = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const [scene] = useState(() => new Scene())
  const camera = useMemo(() => ({ left: 0, right: width, top: 0, bottom: -height }), [width, height])
  const masked = useMasked(!!fade, width * dpr, height * dpr)

  useFrame(() => {
    const cam = scene.userData.camera
    if (!cam) return
    gl.autoClear = false
    if (!masked || !fade) {
      gl.clearDepth()
      gl.render(scene, cam)
      return
    }
    // Draw the layer off screen, then composite it through a vertical alpha ramp.
    const screen = gl.getRenderTarget()
    const alpha = gl.getClearAlpha()
    gl.getClearColor(clearColor)
    gl.setRenderTarget(masked.target)
    gl.setClearColor(0x000000, 0)
    gl.clear(true, true, false)
    gl.render(scene, cam)
    gl.setClearColor(clearColor, alpha)
    gl.setRenderTarget(screen)
    const u = masked.material.uniforms
    u.uFrom.value = 1 - fade.from / height
    u.uTo.value = 1 - fade.to / height
    u.uBottom.value = fade.bottom / height
    gl.render(masked.quad, masked.camera)
  }, priority)

  return createPortal(
    <>
      <OrthographicCamera
        ref={(c) => void (scene.userData.camera = c)}
        makeDefault
        {...camera}
        near={-100}
        far={100}
        position={[0, 0, 10]}
      />
      {children}
    </>,
    scene,
    { events: { priority: priority + 1 } },
  )
}

/** The off-screen target and the full-screen quad that composites it, premultiplied, through the fade. */
function useMasked(on: boolean, width: number, height: number) {
  const masked = useMemo(() => {
    if (!on) return null
    // Half float: the layer is rendered in linear light, and 8 bits would band the dim text.
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
    const material = new ShaderMaterial({
      uniforms: { uLayer: { value: target.texture }, uFrom: { value: 1 }, uTo: { value: 1 }, uBottom: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uLayer;
        uniform float uFrom;
        uniform float uTo;
        uniform float uBottom;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(uLayer, vUv);
          float mask = (1.0 - smoothstep(uTo, uFrom, vUv.y)) * smoothstep(0.0, uBottom, vUv.y);
          // Premultiplied already (rendered over transparent black); unpremultiply for the colour-space step.
          vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
          gl_FragColor = vec4(rgb, c.a * mask);
          #include <colorspace_fragment>
          gl_FragColor.rgb *= gl_FragColor.a;
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    })
    return { target, material, quad: new Mesh(new PlaneGeometry(1, 1), material), camera: new Ortho() }
  }, [on])
  useEffect(() => masked?.target.setSize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height))), [masked, width, height])
  useEffect(
    () => () => {
      masked?.target.dispose()
      masked?.material.dispose()
    },
    [masked],
  )
  return masked
}
