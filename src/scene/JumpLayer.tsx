import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, LinearFilter, Mesh, PlaneGeometry, ShaderMaterial, TextureLoader, Vector2, Vector4, type Texture } from 'three'
import { palette } from '../theme'
import { useStory } from '../state/store'
import { CHAPTERS } from '../story/chapters'
import { JUMP, jump, jumpPhase } from '../story/jump'
import { scroll } from '../story/scrollState'

/** Halftone cell, CSS px: coarse enough that faces never resolve, fine enough to read as the globe's particles. */
const CELL_PX = 4.5
/** Start fetching the atlas this many chapters ahead. */
const PRELOAD = 2
const JUMP_INDEX = CHAPTERS.findIndex((c) => c.jump)
/** A still from the cabin for reduced motion. */
const STILL_FRAME = 72

const vertexShader = /* glsl */ `
  uniform vec4 uRect;
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    // Straight to clip space, over the stage only: no camera, no depth.
    gl_Position = vec4(mix(uRect.xy, uRect.zw, vUv), 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uFrame;
  uniform float uOpacity;
  uniform float uDoor;
  uniform float uTime;
  uniform float uCell;
  uniform vec2 uStage;
  uniform vec3 uCyan;
  uniform vec3 uAmber;
  varying vec2 vUv;

  const vec2 GRID = vec2(${JUMP.COLS}.0, ${JUMP.ROWS}.0);
  const float FRAMES = ${JUMP.FRAMES}.0;
  const float VIDEO_ASPECT = 16.0 / 9.0;

  float frameLuma(float f, vec2 uv) {
    vec2 cell = vec2(mod(f, GRID.x), floor(f / GRID.x));
    // Inset half a texel so neighbouring frames never bleed in.
    uv = clamp(uv, vec2(0.004), vec2(0.996));
    return texture2D(uAtlas, vec2((cell.x + uv.x) / GRID.x, 1.0 - (cell.y + 1.0 - uv.y) / GRID.y)).r;
  }

  void main() {
    vec2 px = vUv * uStage;
    // The dot grid drifts slowly, so the footage reads as something seen through the scene, not a flat overlay.
    vec2 drift = vec2(sin(uTime * 0.13), cos(uTime * 0.11)) * uCell * 2.0;
    vec2 centre = (floor((px + drift) / uCell) + 0.5) * uCell - drift;
    vec2 uv = centre / uStage;
    // Cover the stage, cropping the clip's long side.
    float stageAspect = uStage.x / uStage.y;
    vec2 fit = stageAspect > VIDEO_ASPECT ? vec2(1.0, VIDEO_ASPECT / stageAspect) : vec2(stageAspect / VIDEO_ASPECT, 1.0);
    uv = (uv - 0.5) * fit + 0.5;
    // Crossfade neighbouring frames so the 8 fps atlas scrubs smoothly.
    float f0 = floor(uFrame);
    float luma = mix(frameLuma(f0, uv), frameLuma(min(f0 + 1.0, FRAMES - 1.0), uv), fract(uFrame));
    luma = smoothstep(0.06, 0.92, luma);
    // Dot area follows brightness; dark cells vanish.
    float radius = 0.5 * sqrt(luma);
    float d = length(px - centre) / uCell;
    float dot = smoothstep(radius, radius - 0.18, d);
    // Duotone: the shadows in the domestic cyan, the light toward amber, and the open door washes it to white.
    vec3 color = mix(uCyan, uAmber, smoothstep(0.4, 0.95, luma));
    color = mix(color, vec3(1.0), uDoor * luma * 0.7);
    // Feather the stage edges so the layer has no frame.
    vec2 edge = smoothstep(0.0, 0.12, vUv) * smoothstep(1.0, 0.88, vUv);
    float a = dot * uOpacity * edge.x * edge.y;
    gl_FragColor = vec4(color * a * (1.0 + uDoor * 1.5), a);
  }
`

/**
 * The jump: Nik's onboard footage as a dot-screened layer over the globe, played in real time on the chapter clock.
 * It is atmosphere, not a player (Nik): you sense the cabin, the people and the light rather than watch them.
 */
export function JumpLayer() {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const [atlas, setAtlas] = useState<Texture | null>(null)
  const loading = useRef(false)
  const mesh = useRef<Mesh>(null)
  const geometry = useMemo(() => new PlaneGeometry(2, 2), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uAtlas: { value: null },
          uFrame: { value: 0 },
          uOpacity: { value: 0 },
          uDoor: { value: 0 },
          uTime: { value: 0 },
          uCell: { value: CELL_PX },
          uStage: { value: new Vector2(1, 1) },
          uRect: { value: new Vector4(-1, -1, 1, 1) },
          uCyan: { value: palette.domestic },
          uAmber: { value: palette.international },
        },
      }),
    [],
  )
  useEffect(() => () => atlas?.dispose(), [atlas])

  useFrame(({ clock }) => {
    if (!atlas && !loading.current && scroll.active >= JUMP_INDEX - PRELOAD) {
      loading.current = true
      new TextureLoader().load(`${import.meta.env.BASE_URL}jump-atlas.jpg`, (t) => {
        // Raw gray values: the shader treats them as brightness data, not colour.
        t.minFilter = LinearFilter
        t.generateMipmaps = false
        material.uniforms.uAtlas.value = t
        setAtlas(t)
      })
    }
    const phase = jumpPhase(jump.progress)
    const on = !!atlas && phase.opacity > 0.002
    if (mesh.current) mesh.current.visible = on
    if (!on) return
    const stage = useStory.getState().stage ?? { x: 0, y: 0, width: size.width, height: size.height }
    const u = material.uniforms
    u.uRect.value.set(
      (stage.x / size.width) * 2 - 1,
      1 - ((stage.y + stage.height) / size.height) * 2,
      ((stage.x + stage.width) / size.width) * 2 - 1,
      1 - (stage.y / size.height) * 2,
    )
    u.uStage.value.set(stage.width * dpr, stage.height * dpr)
    u.uCell.value = CELL_PX * dpr
    u.uFrame.value = matchMedia('(prefers-reduced-motion: reduce)').matches ? STILL_FRAME : phase.frame
    u.uOpacity.value = phase.opacity
    u.uDoor.value = phase.door
    u.uTime.value = clock.elapsedTime
  })

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={20} frustumCulled={false} visible={false} />
}
