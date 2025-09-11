// src/objects/GPGPUWaterPBR.js
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { GameObject } from '../engine/GameObject.js'

const MIN_OMEGA = 0.5; // rad/s (~12.6s period); tune to taste

/**
 * GPGPUWaterPBR simulates and renders physically-based water using GPGPU techniques in Three.js.
 * 
 * This class creates a water surface mesh with real-time wave simulation and foam effects, using
 * fragment shaders for height and normal computation. Supports interactive splashes, plane and radial
 * wave sources, and PBR rendering with foam blending.
 * 
 * @class
 * @extends GameObject
 * 
 * @param {object} world - The world/context object containing renderer, scene, camera, and input.
 * @param {object} [options] - Configuration options.
 * @param {number} [options.x=0] - X position in world space.
 * @param {number} [options.y=0] - Y position in world space.
 * @param {number} [options.z=0] - Z position in world space.
 * @param {number} [options.sizeX=20] - Width of the water plane in world units.
 * @param {number} [options.sizeY=20] - Depth of the water plane in world units.
 * @param {number} [options.simW=128] - Simulation texture width (resolution).
 * @param {number} [options.simH=128] - Simulation texture height (resolution).
 * @param {number} [options.mouseSize=10.0] - Splash radius in world units.
 * @param {number} [options.viscosity=0.01] - Damping/viscosity factor.
 * @param {number} [options.displacementScale=0.35] - Vertical amplitude of water displacement.
 * @param {string|number} [options.color='#1fa6d7'] - Water albedo tint (color).
 * @param {number} [options.roughness=0.25] - Base roughness for PBR material.
 * @param {number} [options.metalness=0.0] - Metalness for PBR material.
 * @param {number} [options.foamThreshold=0.010] - Slope magnitude where foam starts.
 * @param {number} [options.foamSharpness=0.040] - Softness of foam edge.
 * @param {number} [options.foamIntensity=1.3] - Intensity of foam blending.
 * @param {boolean} [options.splashAtMouseDemo=true] - If true, splashes at mouse on move.
 * 
 * @property {THREE.Mesh} object3D - The water mesh object.
 * @property {THREE.MeshStandardMaterial} material - The PBR material used for rendering.
 * @property {GPUComputationRenderer} gpu - The GPGPU computation renderer instance.
 * @property {number} displacementScale - The vertical amplitude of the water surface.
 * @property {boolean} splashAtMouseDemo - Whether to splash at mouse pointer automatically.
 * 
 * @example
 * const water = new GPGPUWaterPBR(world, { sizeX: 30, sizeY: 30 });
 * scene.add(water.object3D);
 * 
 * // In your animation loop:
 * water.update(deltaTime);
 * 
 * // To add a plane wave:
 * water.addPlaneWave({ dir: new THREE.Vector2(1, 0), wavelength: 10, amplitude: 0.5 });
 * 
 * // To splash at a specific world position:
 * water.splash(x, z, { strength: 2.0 });
 * 
 * // To add a radial wave:
 * water.addRadialWave({ center: new THREE.Vector2(0, 0), wavelength: 8, amplitude: 1.0 });
 * 
 */
export class GPGPUWaterPBR extends GameObject {
  constructor(world, {
    x = 0, y = 0, z = 0,
    sizeX = 20, sizeY = 20,        // plane size in world units (X = width, Y = depth mapped to local Y)
    simW = 128, simH = 128,        // simulation resolution
    mouseSize = 10.0,               // splash radius (world units)
    viscosity = 0.01,              // damping
    displacementScale = 0.35,      // vertical amplitude (world units)
    color = '#1fa6d7',             // water albedo tint
    roughness = 0.25,              // base roughness (foam pushes toward 1.0)
    metalness = 0.0,
    foamThreshold = 0.010,         // where foam starts (slope magnitude)
    foamSharpness = 0.040,         // softness of foam edge
    foamIntensity = 1.3,           // how white foam mixes (0.6–1.3 typical)
    splashAtMouseDemo = true       // if true, splashes at mouse on move
  } = {}) {
    super(world, { groups: ['all','water'] })
    this.splashAtMouseDemo = splashAtMouseDemo

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

      #define MAX_PW 4
      #define MAX_RW 4
      uniform float simTime;

      uniform vec2  pw_dir[MAX_PW];
      uniform float pw_k[MAX_PW];
      uniform float pw_omega[MAX_PW];
      uniform float pw_amp[MAX_PW];
      uniform float pw_phase[MAX_PW];

      uniform vec2  rw_center[MAX_RW];
      uniform float rw_k[MAX_RW];
      uniform float rw_omega[MAX_RW];
      uniform float rw_amp[MAX_RW];
      uniform float rw_decay[MAX_RW];
      uniform float rw_phase[MAX_RW];

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
        float g   = exp(-100.0 * r2);          // bell core
        float impulse = (1.0 - 50.0 * r2) * g * splashStrength;
        // positive center, negative ring ⇒ net ≈ 0
        vel += impulse;

        // --- continuous wave forcing (plane + radial) --------------------
        float forcing = 0.0;

        // Plane waves (no break—guard inside loop)
        for (int i = 0; i < MAX_PW; ++i) {
          float amp = pw_amp[i];
          if (amp != 0.0) {
            float theta = pw_k[i] * dot(pw_dir[i], local) - pw_omega[i] * simTime + pw_phase[i];
            forcing += pw_amp[i] * sin(theta);
          }
        }

        // Radial waves (zero-mean envelope)
        for (int i = 0; i < MAX_RW; ++i) {
          float amp = rw_amp[i];
          if (amp != 0.0) {
            vec2  d = local - rw_center[i];
            float r = length(d);

            // derive a stable sigma from decay (decay ~ 1/sigma). guard against 0.
            float sigma = max(1e-3, 1.0 / rw_decay[i]);
            float q = r / sigma;

            // zero-mean "Mexican hat": positive center, negative ring, integrates ~0
            float env = exp(-q*q);
            float hat = (1.0 - 2.0*q*q) * env;

            float om = max(rw_omega[i], 1e-3);
            float theta = rw_k[i] * r - om * simTime + rw_phase[i];
            float wave  = sin(theta);

            // zero-mean forcing
            float f = amp * hat * wave;

            forcing += f;
          }
        }

        // Inject into velocity
        vel += forcing * delta;

        // (optional) safety clamp against numeric blowups
        vel    = clamp(vel,   -20.0, 20.0);
        height = hC + vel * delta;
        height = clamp(height, -5.0, 5.0);

        // slight global decay & integrate
        vel   *= 0.995;
        height = hC + vel * delta;

        // baseline return (prevents drift)
        height -= height * baselineReturn * delta;

        // edge damping
        float fx = min(uv.x, 1.0 - uv.x);
        float fy = min(uv.y, 1.0 - uv.y);
        float border = smoothstep(0.0, 0.04, min(fx, fy));
        vel *= mix(0.99, 1.0, border);

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
    hmU.baselineReturn = { value: 0.08 }  // return to zero height at this rate

    // time
    this.simTime = 0
    hmU.simTime = { value: 0 }

    // plane waves (typed arrays for numeric uniforms)
    const MAX_PW = 4
    hmU.numPW    = { value: 0 }
    hmU.pw_dir   = { value: Array.from({ length: MAX_PW }, () => new THREE.Vector2(1, 0)) }
    hmU.pw_k     = { value: new Float32Array(MAX_PW) }
    hmU.pw_omega = { value: new Float32Array(MAX_PW) }
    hmU.pw_amp   = { value: new Float32Array(MAX_PW) }
    hmU.pw_phase = { value: new Float32Array(MAX_PW) }

    this._MAX_PW = MAX_PW
    this._pwWrite = 0

    // radial waves
    // Radial waves (MAX = 4); keep these arrays the same object forever
    const MAX_RW = 4
    hmU.rw_center = { value: Array.from({ length: MAX_RW }, () => new THREE.Vector2()) }
    hmU.rw_k      = { value: new Float32Array(MAX_RW) }
    hmU.rw_omega  = { value: new Float32Array(MAX_RW) }
    hmU.rw_amp    = { value: new Float32Array(MAX_RW) }   // gate
    hmU.rw_decay  = { value: new Float32Array(MAX_RW) }
    hmU.rw_phase  = { value: new Float32Array(MAX_RW) }

    // book-keeping
    this._MAX_RW = MAX_RW
    this._rwWrite = 0

    // Make GLSL loop bounds explicit
    this.varHeight.material.defines = {
      ...(this.varHeight.material.defines || {}),
    }

    // Bookkeeping arrays (friendly JS shape)
    this._planeWaves = []  // {dir:THREE.Vector2, k, omega, amp, phase}
    this._radialWaves = [] // {center:THREE.Vector2, k, omega, amp, decay, phase}

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

    // world.input.on('pointerdown', (p) => {
    //   // raycast → hit → local
    //   this.raycaster.setFromCamera(this.pointerNDC, this.camera)
    //   const hit = this.raycaster.intersectObject(this.hitPlane, false)[0]
    //   if (!hit) return
    //   const local = this._worldToLocalXY(hit.point)

    //   // add a new radial wave at the clicked place
    //   this.addRadialWave({
    //     center: local,
    //     wavelength: 7,
    //     amplitude: 500,
    //     decay: 0.01,
    //     speed: 1.0
    //   })
    // })

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

  _addPWToUniforms() {
    const u = this.varHeight.material.uniforms
    const n = Math.min(this._planeWaves.length, 4)
    u.numPW.value = n
    for (let i = 0; i < n; i++) {
      const w = this._planeWaves[i]
      u.pw_dir.value[i].copy(w.dir)
      u.pw_k.value[i]     = w.k
      u.pw_omega.value[i] = w.omega
      u.pw_amp.value[i]   = w.amp
      u.pw_phase.value[i] = w.phase
    }
    // zero the rest
    for (let i = n; i < 4; i++) u.pw_amp.value[i] = 0
  }

  _addRWToUniforms() {
    const u = this.varHeight.material.uniforms
    const n = Math.min(this._radialWaves.length, 4)
    u.numRW.value = n
    for (let i = 0; i < n; i++) {
      const w = this._radialWaves[i]
      u.rw_center.value[i].copy(w.center)
      u.rw_k.value[i]      = w.k
      u.rw_omega.value[i]  = w.omega
      u.rw_amp.value[i]    = w.amp
      u.rw_decay.value[i]  = w.decay
      u.rw_phase.value[i]  = w.phase
    }
    for (let i = n; i < 4; i++) u.rw_amp.value[i] = 0
  }

  /** Utility: compute k & omega */
  _calcDispersion({ wavelength, speed, omega }) {
    const k = (wavelength && wavelength > 0) ? (2 * Math.PI / wavelength) : 0
    // Use your compute shader's "gravity" scale (GRAVITY = res.x * 3.0)
    const g_sim = this.gpu.width * 3.0
    const om = (typeof omega === 'number')
      ? omega
      : (typeof speed === 'number')
        ? (k * speed)
        : Math.sqrt(Math.max(0, g_sim * k)) // deep-water-ish
    return { k, omega: om }
  }

  _calcOmega(k, { speed, omega, periodSec } = {}) {
    if (Number.isFinite(omega) && omega > 0) return omega
    if (Number.isFinite(periodSec) && periodSec > 0) return 2*Math.PI / periodSec
    if (Number.isFinite(speed) && speed !== 0) return Math.abs(k * speed)
    // fallback: deep-water-ish or just a constant
    const g_sim = this.gpu.width * 3.0
    const om = (k > 0) ? Math.sqrt(Math.max(0, g_sim * k)) : 0
    return Math.max(om, MIN_OMEGA)
  }

  /** Public: add a directional plane wave */
  addPlaneWave({ dir = new THREE.Vector2(1, 0), wavelength = 10, amplitude = 0.6, phase = 0, speed = undefined, omega = undefined } = {}) {
    const d = dir.clone().normalize()
    const { k, omega: om } = this._calcDispersion({ wavelength, speed, omega })
    this._planeWaves.push({ dir: d, k, omega: om, amp: amplitude, phase })
    this._addPWToUniforms()
    return this._planeWaves.length - 1 // id
  }

  /** Public: add a radial wave source */
  addRadialWave({
    center = new THREE.Vector2(0, 0),
    wavelength = 8,
    amplitude = 0.5,
    decay = 0.08,
    phase = 0,
    speed = undefined,
    omega = undefined,
    periodSec = undefined
  } = {}) {
    const u = this.varHeight.material.uniforms

    // derive k/omega
    const k = (wavelength && wavelength > 0) ? (2*Math.PI / wavelength) : 0
    const om = this._calcOmega(k, { speed, omega, periodSec })

    // pick slot (ring)
    const i = this._rwWrite % this._MAX_RW
    this._rwWrite++

    // write in-place
    if (k === 0 || !Number.isFinite(om) || om <= 0) amplitude = 0 // gate off bad waves
    u.rw_center.value[i].copy(center)
    u.rw_k.value[i]      = k
    u.rw_omega.value[i]  = om
    u.rw_amp.value[i]    = amplitude   // <-- gate: nonzero = active
    u.rw_decay.value[i]  = decay
    u.rw_phase.value[i]  = phase

    return i
  }

  disableRadialWave(i) {
    const u = this.varHeight.material.uniforms
    if (i >= 0 && i < this._MAX_RW) u.rw_amp.value[i] = 0
  }

  clearWaves() {
    this._planeWaves.length = 0
    this._radialWaves.length = 0
    this._addPWToUniforms()
    this._addRWToUniforms()
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

  splashAtMouse(strength = 50.0) {
    this.raycaster.setFromCamera(this.pointerNDC, this.camera)
    const hit = this.raycaster.intersectObject(this.hitPlane, false)[0]
    if (hit) {
      const local = this._worldToLocalXY(hit.point)
      const u = this.varHeight.material.uniforms
      u.mousePos.value.copy(local)
      u.splashStrength.value = 100.0
    }
  }

  update(dt) {
    // Pointer raycast → local splash, change as you like
    if (this.splashAtMouseDemo) this.splashAtMouse(100.0)

    // Step sim
    this.varHeight.material.uniforms.delta.value =  dt
    this.simTime += dt
    this.varHeight.material.uniforms.simTime.value = this.simTime
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
