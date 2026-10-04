import { useMemo } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat, ShaderMaterial, TextureLoader, Vector3, Vector4, type Texture } from 'three'
import topoUrl from '../assets/topo_2048.png'
import lightsUrl from '../assets/lights_viirs.png'
import detailUrl from '../assets/lights_florida.png'
import { palette } from '../theme'
import { sunDirection } from './light'
import { TERRAIN, terrainGlsl } from './terrain'
import { noiseGlsl } from './noise'
import { RouteField } from './routeField'
import { landedAt, timeline } from '../story/timeline'

/** lon0, lat0, lon1, lat1 of the sharper lights patch. Keep in step with BOX in scripts/build_lights_detail.py. */
const DETAIL_BOX = [-88, 23, -76, 33] as const

const lonLatUv = /* glsl */ `
  vec2 lonLatUv(vec3 dir) {
    float lat = degrees(asin(clamp(dir.y, -1.0, 1.0)));
    float lon = degrees(atan(dir.x, dir.z));
    return vec2((lon + 180.0) / 360.0, (lat + 90.0) / 180.0);
  }
`

const vertexShader = /* glsl */ `
  uniform sampler2D uTopo;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vObj;
  varying vec3 vWorld;
  ${lonLatUv}
  ${terrainGlsl}
  void main() {
    vec3 dir = normalize(position);
    // Displace along the normal by the exaggerated elevation; a slightly blurred lookup keeps the mesh smooth.
    float h = terrainHeight(textureLod(uTopo, lonLatUv(dir), 1.0).rgb);
    vec4 mv = modelViewMatrix * vec4(dir * (${TERRAIN.base.toFixed(4)} + h), 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vObj = dir;
    vWorld = (modelMatrix * vec4(dir * (${TERRAIN.base.toFixed(4)} + h), 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`

/**
 * The dark globe body (it writes depth, hiding the far side). Elevation is data, not a fill: it displaces the
 * mesh and tilts the shading normal, so relief shows only as slopes catching the key light. On top:
 *  - light pollution (NASA Black Marble 2016 grayscale, VIIRS): additive emissive layer plus a blurred bleed for glow,
 *    with a sharper patch over central Florida for the close-ups (the joyrides and the jump)
 */
const fragmentShader = /* glsl */ `
  uniform sampler2D uTopo;
  uniform sampler2D uLights;
  uniform sampler2D uDetail;
  uniform vec4 uDetailBox;
  uniform vec3 uOcean;
  uniform vec3 uShelf;
  uniform vec3 uGrid;
  uniform vec3 uLightColor;
  uniform vec3 uRim;
  uniform vec3 uRelief;
  uniform vec3 uSun;
  uniform vec3 uHaze;
  uniform vec3 uFog;
  uniform float uTime;
  uniform sampler2D uRoutes;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vObj;
  varying vec3 vWorld;
  ${terrainGlsl}
  ${noiseGlsl}
  float gridLine(float v, float step) {
    float f = abs(fract(v / step + 0.5) - 0.5) * step;
    return 1.0 - smoothstep(0.0, fwidth(v) * 1.2, f);
  }
  void main() {
    float lat = degrees(asin(clamp(vObj.y, -1.0, 1.0)));
    float lon = degrees(atan(vObj.x, vObj.z));
    vec2 uv = vec2((lon + 180.0) / 360.0, (lat + 90.0) / 180.0);
    // Screen-space UV gradients without the jump at the antimeridian, so mipmapping leaves no seam.
    vec2 uvWrap = vec2(fract(uv.x + 0.5), uv.y);
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    vec2 dxW = dFdx(uvWrap), dyW = dFdy(uvWrap);
    if (abs(dxW.x) < abs(dx.x)) dx = dxW;
    if (abs(dyW.x) < abs(dy.x)) dy = dyW;
    vec3 topo = textureGrad(uTopo, uv, dx, dy).rgb;

    float land = smoothstep(6.0 / 255.0, 10.0 / 255.0, topo.r);
    // A faint continental-shelf lift is the only trace of the ocean depth in the body itself.
    float shelf = (1.0 - smoothstep(0.0, 0.35, topo.g)) * (1.0 - land);
    vec3 color = uOcean + uShelf * shelf * 0.35;

    // Relief normal from the height field: central differences one texel east/west and north/south.
    vec2 texel = 1.0 / vec2(textureSize(uTopo, 0));
    float hE = terrainHeight(textureGrad(uTopo, uv + vec2(texel.x, 0.0), dx, dy).rgb);
    float hW = terrainHeight(textureGrad(uTopo, uv - vec2(texel.x, 0.0), dx, dy).rgb);
    float hN = terrainHeight(textureGrad(uTopo, uv + vec2(0.0, texel.y), dx, dy).rgb);
    float hS = terrainHeight(textureGrad(uTopo, uv - vec2(0.0, texel.y), dx, dy).rgb);
    float stepLon = 2.0 * 6.2832 * texel.x * max(cos(radians(lat)), 0.05);
    float stepLat = 2.0 * 3.1416 * texel.y;
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), vObj));
    vec3 north = cross(vObj, east);
    // Shading relief is exaggerated twice as much as the mesh: crisp slopes without tall geometry.
    vec3 n = normalize(vObj - (east * (hE - hW) / stepLon + north * (hN - hS) / stepLat) * 2.4);
    // Only the change in lighting that the slope causes: flat ground adds nothing, sunward slopes glow, lee slopes dim.
    float relief = dot(n, uSun) - dot(vObj, uSun);
    float slope = 1.0 - dot(n, vObj);
    color += uRelief * land * (max(relief, 0.0) * 1.2 + slope * 0.15);
    color *= 1.0 - land * clamp(-relief, 0.0, 1.0) * 0.5;

    // Graticule every 7.5 degrees (every fourth line a little stronger), drawn as beaded lines whose strength wanders
    // with noise, so the grid reads as etched texture rather than wireframe. Beads melt back into a plain line
    // wherever they would get smaller than a couple of pixels (toward the limb), so they never shimmer.
    float merid = smoothstep(88.0, 70.0, abs(lat));
    float onLat = gridLine(lat, 7.5) * mix(0.6, 1.0, gridLine(lat, 30.0));
    float onLon = gridLine(lon, 7.5) * mix(0.6, 1.0, gridLine(lon, 30.0)) * merid;
    float beadLat = smoothstep(0.32, 0.12, abs(fract(lon / 0.75) - 0.5));
    float beadLon = smoothstep(0.32, 0.12, abs(fract(lat / 0.75) - 0.5));
    beadLat = mix(beadLat, 0.45, smoothstep(0.15, 0.35, fwidth(lon) / 0.75));
    beadLon = mix(beadLon, 0.45, smoothstep(0.15, 0.35, fwidth(lat) / 0.75));
    float grain = 0.3 + 1.1 * fbm(vObj * 7.0, 2);
    float g = max(onLat * beadLat, onLon * beadLon) * grain;


    // Lights are screen-blended into the body rather than added on top: they tint the ground and can never pass
    // 1.0, so they stay below the bloom threshold and read as part of the surface. A wide blurred lookup is the bleed.
    float lights = textureGrad(uLights, uv, dx, dy).r;
    // Inside the detail box the sharper patch takes over, feathered at its edges so the seam never shows.
    vec2 boxSize = uDetailBox.zw - uDetailBox.xy;
    vec2 duv = (vec2(lon, lat) - uDetailBox.xy) / boxSize;
    vec2 edge = smoothstep(0.0, 0.08, duv) * smoothstep(1.0, 0.92, duv);
    float inBox = edge.x * edge.y;
    if (inBox > 0.0) {
      vec2 toBox = vec2(360.0, 180.0) / boxSize;
      lights = mix(lights, textureGrad(uDetail, duv, dx * toBox, dy * toBox).r, inBox);
    }
    float bleed = textureGrad(uLights, uv, dx * 10.0, dy * 10.0).r;
    vec3 lightLayer = uLightColor * clamp(pow(lights, 1.4) * 0.7 + bleed * 0.06, 0.0, 1.0);
    color = 1.0 - (1.0 - color) * (1.0 - lightLayer);

    // Inner fog: the globe reads as filled with a slow, dense, dark haze. The view ray is continued into the sphere and
    // smooth fbm is sampled at three depths, so the fog parallaxes like a volume as the globe turns. The layers
    // drift in different directions so it keeps churning, and along the flown routes the fog is stirred faster
    // and lit from within, as if the traffic were moving through it.
    float route = textureLod(uRoutes, vec2(uv.x, uv.y), 0.0).r;
    vec3 into = -normalize(cameraPosition - vWorld);
    float t = uTime * 0.06;
    float fog = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float depth = 0.06 + 0.14 * fk * fk;
      vec3 drift = vec3(sin(t * 0.7 + fk), t * (0.5 + 0.3 * fk), cos(t * 0.6 - fk * 2.0)) * 0.6;
      vec3 stir = vec3(sin(uTime * 0.5 + fk * 1.7), cos(uTime * 0.41 + fk), sin(uTime * 0.33 - fk)) * route * 0.6;
      fog += fbm((vObj + into * depth) * 1.6 + drift + stir, 3) * (1.0 - 0.25 * fk);
    }
    fog = smoothstep(0.35, 1.45, fog);
    float facing = max(dot(vObj, -into), 0.0);
    // Thicker toward the edge, where the line of sight runs through more of it; brighter on the key-light side.
    float fogAmount = fog * (0.55 + 0.9 * pow(1.0 - facing, 2.0)) * (0.55 + 0.45 * smoothstep(-0.4, 0.9, dot(vObj, uSun)));
    // Absorbing, not glowing: the fog pulls the surface toward a near-black navy, swallowing relief and lights where
    // it is thick. Only along the routes does a faint light come through it.
    color = mix(color, uFog, clamp(fogAmount * 1.25, 0.0, 0.93));
    color += uHaze * route * fog * 0.08;
    // The grid sits on the outer shell, so the fog only half-hides it.
    color += uGrid * g * 0.85 * (1.0 - land * 0.5) * (1.0 - fogAmount * 0.35);
    // A faint emissive term on top (Nik: very slightly emissive), so the brightest cities glow through the haze.
    color += uLightColor * pow(lights, 2.2) * 0.14 * (1.0 - fogAmount * 0.5);

    float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.5);
    color += uRim * fres * 0.15;
    gl_FragColor = vec4(color, 1.0);
  }
`

function prepare(texture: Texture) {
  // Mipmapped: the lights texture is several times denser than the screen at the default zoom.
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 4
  return texture
}

/**
 * The lights map is 8192x4096; uploaded as RGBA it would cost ~180 MB of GPU memory with mipmaps, so keep only
 * the red channel (~45 MB), shrinking first on GPUs that cap textures below 8192.
 */
function toRedTexture(source: Texture, maxSize: number): DataTexture {
  const image = source.image as HTMLImageElement
  const width = Math.min(image.width, maxSize)
  const height = Math.round((width * image.height) / image.width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data
  const red = new Uint8Array(width * height)
  for (let i = 0; i < red.length; i++) red[i] = rgba[i * 4]
  source.dispose()
  const texture = new DataTexture(red, width, height, RedFormat)
  texture.flipY = true
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}

export function Surface() {
  const [topo, lightsImage, detail] = useLoader(TextureLoader, [topoUrl, lightsUrl, detailUrl])
  const maxTextureSize = useThree((s) => s.gl.capabilities.maxTextureSize)
  const lights = useMemo(() => toRedTexture(lightsImage, maxTextureSize), [lightsImage, maxTextureSize])
  const routes = useMemo(() => new RouteField(), [])
  const refresh = useMemo(() => ({ at: 0 }), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTopo: { value: prepare(topo) },
          uLights: { value: prepare(lights) },
          uDetail: { value: prepare(detail) },
          uDetailBox: { value: new Vector4(...DETAIL_BOX) },
          uOcean: { value: palette.ocean },
          uShelf: { value: palette.shelf },
          uGrid: { value: palette.grid },
          uLightColor: { value: palette.lights },
          uRim: { value: palette.atmosphere },
          uRelief: { value: palette.relief },
          uSun: { value: new Vector3() },
          uHaze: { value: palette.haze },
          uFog: { value: palette.fog },
          uTime: { value: 0 },
          uRoutes: { value: routes.texture },
        },
      }),
    [topo, lights, detail, routes],
  )
  useFrame(({ camera, clock }) => {
    sunDirection(camera, material.uniforms.uSun.value)
    material.uniforms.uTime.value = clock.elapsedTime
    // The fog's route glow grows with the story; re-blurred a few times a second at most.
    if (clock.elapsedTime - refresh.at > 0.2) {
      refresh.at = clock.elapsedTime
      routes.draw(landedAt(timeline.time))
    }
  })
  return (
    <mesh material={material} renderOrder={0}>
      {/* Dense enough (~0.5 deg per quad) for the displacement to resolve mountain ranges. */}
      <sphereGeometry args={[1, 720, 360]} />
    </mesh>
  )
}
