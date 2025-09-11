// src/objects/GPGPUWaterPBR.js
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { GameObject } from '../engine/GameObject.js'

export class GPGPUWaterPBR extends GameObject {
  constructor(world, {
    x = 0, y = 0, z = 0,
    sizeX = 20, sizeY = 20,        // plane size in world units (X = width, Y = depth mapped to local Y)
    simW = 128, simH = 128,        // simulation resolution
    mouseSize = 10.0,               // splash radius (world units)
    viscosity = 0.04,              // damping
    displacementScale = 0.35,      // vertical amplitude (world units)
    color = '#1fa6d7',             // water albedo tint
    roughness = 0.25,              // base roughness (foam pushes toward 1.0)
    metalness = 0.0,
    foamThreshold = 0.020,         // where foam starts (slope magnitude)
    foamSharpness = 0.040,         // softness of foam edge
    foamIntensity = 1.1            // how white foam mixes (0.6–1.3 typical)
  } = {}) {
    super(world, { groups: ['water'] })

    this.renderer = world.renderer
    this.scene = world.scene
    this.camera = world.camera

    this.displacementScale = displacementScale

    // ---------------- GPU simulation ----------------
    this.gpu = new GPUComputationRenderer(simW, simH, this.renderer)
    this.gpu.setDataType(THREE.FloatType)

    const heightInit = this.gpu.createTexture()
    this.#seed(heightInit)

    // HEIGHT compute: R = height, G = velocity
    const HEIGHT_FS = /* glsl */`
      #include <common>
      uniform vec2  mousePos;        // in local XY of the plane
      uniform float mouseSize;       // splash radius (world units)
      uniform float viscosity;       // damping
      uniform float delta;           // dt (seconds)
      uniform vec2  bounds;          // half-size in world units (X,Y)
      uniform float splashStrength;  // impulse multiplier (set by JS)
      uniform float baselineReturn;

      void main() {
        vec2 cell = 1.0 / resolution.xy;
        vec2 uv   = gl_FragCoord.xy * cell;

        vec4 h  = texture2D(heightmap, uv);
        float hC = h.x;

        float hL = texture2D(heightmap, uv + vec2(-cell.x, 0.0)).x;
        float hR = texture2D(heightmap, uv + vec2( cell.x, 0.0)).x;
        float hD = texture2D(heightmap, uv + vec2(0.0, -cell.y)).x;
        float hU = texture2D(heightmap, uv + vec2(0.0,  cell.y)).x;
        float sump = (hL + hR + hD + hU - 4.0 * hC);

        float GRAVITY = resolution.x * 3.0;
        float accel = sump * GRAVITY;

        float vel    = h.y + accel * delta;
        float height = hC   + vel   * delta;

        // viscosity-type smoothing
        height += sump * viscosity;

        // splash: UV->local XY in world units
        vec2 local = (uv - 0.5) * 2.0 * bounds;
        float d = length(local - mousePos);
        float k = clamp(1.0 - smoothstep(0.0, mouseSize, d), 0.0, 1.0);

        // impulse into VELOCITY (feels better)
        float r   = d / mouseSize;           // normalized radius (0..~1 in splash)
        float r2  = r * r;
        float g   = exp(-3.0 * r2);          // bell core
        float impulse = (1.0 - 2.0 * r2) * g * splashStrength;
        // positive center, negative ring ⇒ net ≈ 0
        vel += impulse;

        // slight global decay & integrate
        vel   *= 0.995;
        height = hC + vel * delta;
        height -= height * baselineReturn * delta;

        // edge damping
        float fx = min(uv.x, 1.0 - uv.x);
        float fy = min(uv.y, 1.0 - uv.y);
        float border = smoothstep(0.0, 0.04, min(fx, fy));
        vel *= mix(0.95, 1.0, border);

        gl_FragColor = vec4(height, vel, 0.0, 1.0);
      }
    `

    this.varHeight = this.gpu.addVariable('heightmap', HEIGHT_FS, heightInit)
    this.gpu.setVariableDependencies(this.varHeight, [this.varHeight])
    const hmU = this.varHeight.material.uniforms
    hmU.mousePos       = { value: new THREE.Vector2(9999, 9999) }
    hmU.mouseSize      = { value: mouseSize }
    hmU.viscosity      = { value: viscosity }
    hmU.delta          = { value: 1 / 60 }
    hmU.bounds         = { value: new THREE.Vector2(sizeX * 0.5, sizeY * 0.5) }
    hmU.splashStrength = { value: 0.0 }
    hmU.baselineReturn = { value: 0.03 }  // start at 0.01–0.03; 0 to disable

    // NORMAL compute: RGB = encoded tangent-space normal, A = foam mask
    const NORMAL_FS = /* glsl */`
      // NOTE: 'uniform sampler2D heightmap;' is auto-injected by GPUComputationRenderer
      uniform vec2  cell;           // 1 / resolution
      uniform float displacement;   // match MeshStandardMaterial.displacementScale
      uniform vec2  foamParams;     // x=threshold, y=sharpness

      void main() {
        vec2 uv = gl_FragCoord.xy * cell;

        float c  = texture2D(heightmap, uv).x;
        float cx = texture2D(heightmap, uv + vec2(cell.x, 0.0)).x;
        float cy = texture2D(heightmap, uv + vec2(0.0, cell.y)).x;

        // derivatives in object-space units
        float dx = (cx - c) * displacement;
        float dy = (cy - c) * displacement;

        // tangent-space normal (plane is XY, +Z up in object space)
        vec3 n   = normalize(vec3(-dx, -dy, 1.0));
        vec3 enc = n * 0.5 + 0.5;

        // foam from slope magnitude (simple & fast)
        float slope = length(vec2(cx - c, cy - c));
        float foam  = smoothstep(foamParams.x, foamParams.x + foamParams.y, slope);

        gl_FragColor = vec4(enc, foam);
      }
    `

    this.varNormal = this.gpu.addVariable('normalmap', NORMAL_FS, this.gpu.createTexture())
    this.gpu.setVariableDependencies(this.varNormal, [this.varHeight])
    const nmU = this.varNormal.material.uniforms
    nmU.cell         = { value: new THREE.Vector2(1 / simW, 1 / simH) }
    nmU.displacement = { value: this.displacementScale }
    nmU.foamParams   = { value: new THREE.Vector2(foamThreshold, foamSharpness) }

    const err = this.gpu.init()
    if (err) console.error(err)

    // ---------------- Draw mesh (PBR) ----------------
    const geo = new THREE.PlaneGeometry(sizeX, sizeY, simW - 1, simH - 1)

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness,
      roughness,
      transparent: true,
      opacity: 0.98
    })
    mat.userData.foamIntensity = foamIntensity
    mat.userData.shaderRef = null

    mat.onBeforeCompile = (shader) => {
      // make sure we have our own UV varying
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec2 vMyUv;\nvoid main() {')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMyUv = uv;')

      const samplerFn = shader.fragmentShader.includes('#version 300 es') ? 'texture' : 'texture2D'

      shader.fragmentShader = shader.fragmentShader
        // declare our sampler + varying at top of fragment
        .replace('void main() {', 'uniform sampler2D foamMap;\nvarying vec2 vMyUv;\nvoid main() {')
        // sample foam alpha from our map
        .replace('#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
    float foam = ${samplerFn}(foamMap, vMyUv).a;`)
        // whiten + roughen where foam is present
        .replace('#include <output_fragment>',
    `  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(foam * foamIntensity, 0.0, 1.0));
      roughnessFactor  = mix(roughnessFactor, 1.0, foam);
    #include <output_fragment>`)

      // expose uniforms we set from JS
      shader.uniforms.foamIntensity = { value: mat.userData.foamIntensity ?? 1.2 }
      shader.uniforms.foamMap       = { value: null }
      mat.userData.shaderRef = shader
    }

    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, y, z)
    this.scene.add(mesh)

    this.object3D = mesh
    this.material = mat

    // Raycast helper to get local XY on the plane
    this.raycaster = new THREE.Raycaster()
    this.pointerNDC = new THREE.Vector2()
    this.hitPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(sizeX, sizeY),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    this.hitPlane.rotation.x = -Math.PI / 2
    this.hitPlane.position.copy(mesh.position)
    this.scene.add(this.hitPlane)

    // Pointer → NDC
    world.input.on('pointermove', (p) => {
      const el = this.renderer.domElement
      const w = el.clientWidth, h = el.clientHeight
      this.pointerNDC.set((p.x / w) * 2 - 1, -(p.y / h) * 2 + 1)
    })

    this._tmp = new THREE.Vector3()
  }

  #seed(tex) {
    const data = tex.image.data
    for (let i = 0; i < data.length; i += 4) {
      data[i + 0] = 0 // height
      data[i + 1] = 0 // velocity
      data[i + 2] = 0
      data[i + 3] = 1
    }
  }

  _worldToLocalXY(worldPoint) {
    const p = worldPoint.clone()
    this.object3D.worldToLocal(p)
    // PlaneGeometry is XY; local z≈0. Use (x,y) directly as our local coords.
    return new THREE.Vector2(p.x, p.y)
  }

  /**
   * Splash API
   * @param {number} x
   * @param {number} z
   * @param {object} opts { size?: number, strength?: number, coords?: 'world'|'local' }
   */
  splash(x, z, opts = {}) {
    const { size = null, strength = 1.0, coords = 'world' } = opts
    const u = this.varHeight.material.uniforms
    if (coords === 'local') u.mousePos.value.set(x, z)
    else {
      const p = new THREE.Vector3(x, this.object3D.position.y, z)
      const v = this._worldToLocalXY(p)
      u.mousePos.value.copy(v)
    }
    if (size != null) u.mouseSize.value = size
    u.splashStrength.value = strength
  }

  splashAtObject(obj, size = null, strength = 1.0) {
    const p = obj.object3D?.getWorldPosition(this._tmp) || obj.getWorldPosition?.(this._tmp)
    if (p) this.splash(p.x, p.z, { size, strength })
  }

  update(dt) {
    // Pointer raycast → local splash (only when pressed; change as you like)
    this.raycaster.setFromCamera(this.pointerNDC, this.camera)
    const hit = this.raycaster.intersectObject(this.hitPlane, false)[0]
    if (hit && this.world.input.activePointer?.isDown) {
      const local = this._worldToLocalXY(hit.point)
      const u = this.varHeight.material.uniforms
      u.mousePos.value.copy(local)
      u.splashStrength.value = 1000
    }

    // Step sim
    this.varHeight.material.uniforms.delta.value = dt
    this.gpu.compute()

    // Bind sim outputs to PBR material
    const heightTex = this.gpu.getCurrentRenderTarget(this.varHeight).texture
    const normalTex = this.gpu.getCurrentRenderTarget(this.varNormal).texture

    const m = this.material
    m.displacementMap   = heightTex
    m.displacementScale = this.displacementScale
    m.normalMap         = normalTex
    m.normalScale.set(1, 1) // tweak to taste

    if (m.userData.shaderRef) {
      m.userData.shaderRef.uniforms.foamMap.value = normalTex
    }

    // One-frame impulse reset
    const u = this.varHeight.material.uniforms
    u.mousePos.value.set(9999, 9999)
    u.splashStrength.value = 0.0
  }
}
