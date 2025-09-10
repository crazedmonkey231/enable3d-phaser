import * as THREE from 'three'
import { ToonShaderDotted, ToonShaderHatching } from 'three/examples/jsm/shaders/ToonShader.js'
import { ToonShader1 , ToonShader2} from 'three/examples/jsm/shaders/ToonShader.js'

// make a 1D gradient texture with N steps
function makeGradientTexture(steps = 4) {
  const data = new Uint8Array(steps * 3)
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps
    const v = Math.round(t * 255)
    data[i*3+0] = v; data[i*3+1] = v; data[i*3+2] = v
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBFormat)
  tex.needsUpdate = true
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  return tex
}

export const toonMat = new THREE.MeshToonMaterial({
  color: '#69f',
  gradientMap: makeGradientTexture(4)
})

export function ToonMaterial1( baseColor = '#87CEFA' ) {
  const uniforms = THREE.UniformsUtils.clone(ToonShader1.uniforms)
  uniforms.uDirLightPos.value = new THREE.Vector3(1, 1, 1).normalize()
  uniforms.uDirLightColor.value = new THREE.Color(0xcccccc)
  uniforms.uAmbientLightColor.value = new THREE.Color(0x555555)
  uniforms.uBaseColor.value = new THREE.Color(baseColor)
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ToonShader1.vertexShader,
    fragmentShader: ToonShader1.fragmentShader
  })
}

export function ToonMaterial2( baseColor = '#87CEFA' ) {
  const uniforms = THREE.UniformsUtils.clone(ToonShader2.uniforms)
  uniforms.uDirLightPos.value = new THREE.Vector3(0, 1, 0).normalize()
  uniforms.uDirLightColor.value = new THREE.Color(0xffffff)
  uniforms.uAmbientLightColor.value = new THREE.Color(0x999999)
  uniforms.uBaseColor.value = new THREE.Color(baseColor)
  uniforms.uLineColor1.value = new THREE.Color(0x666666)
  uniforms.uLineColor2.value = new THREE.Color(0xffffff)
  uniforms.uLineColor3.value = new THREE.Color(0xffffff)
  uniforms.uLineColor4.value = new THREE.Color(0xffffff)
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ToonShader2.vertexShader,
    fragmentShader: ToonShader2.fragmentShader
  })
}

export function ToonHatchedMaterial( baseColor = '#87CEFA' ) {
  const uniforms = THREE.UniformsUtils.clone(ToonShaderHatching.uniforms)
  uniforms.uDirLightPos.value = new THREE.Vector3(1, 1, 1).normalize()
  uniforms.uDirLightColor.value = new THREE.Color(0x000000)
  uniforms.uAmbientLightColor.value = new THREE.Color(0x000000)
  uniforms.uBaseColor.value = new THREE.Color(baseColor)
  uniforms.uLineColor1.value = new THREE.Color(0xffffff)
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ToonShaderHatching.vertexShader,
    fragmentShader: ToonShaderHatching.fragmentShader
  })
}

export function ToonDottedMaterial( baseColor = '#87CEFA' ) {
  const uniforms = THREE.UniformsUtils.clone(ToonShaderDotted.uniforms)
  uniforms.uDirLightPos.value = new THREE.Vector3(1, 1, 1).normalize()
  uniforms.uDirLightColor.value = new THREE.Color(0x000000)
  uniforms.uAmbientLightColor.value = new THREE.Color(0x000000)
  uniforms.uBaseColor.value = new THREE.Color(baseColor)
  uniforms.uLineColor1.value = new THREE.Color(0xffffff)
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ToonShaderDotted.vertexShader,
    fragmentShader: ToonShaderDotted.fragmentShader
  })
}