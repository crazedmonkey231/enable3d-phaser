import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { GameObject } from '../engine/GameObject.js'

// Example usage (in your scene setup):
// crate.body.on.collision((other, evt) => {
//   if (evt === 'start') {
//     const v = crate.body.velocity.length()    // Ammo velocity magnitude
//     water.splashAtObject({ object3D: crate }, THREE.MathUtils.clamp(v * 0.2, 1.2, 4.0))
//   }
// })

/**
 * Reactive water plane using GPGPU heightmap simulation.
 * - Sim resolution: SIM_W x SIM_H texels
 * - Plane segments match sim so each vertex samples 1 texel
 */
export class GPGPUWater extends GameObject {
  constructor(world, {
    x = 0, y = 0, z = 0,
    sizeX = 20, sizeY = 20,           // world size (X=width, Y=depth in XZ)
    simW = 128, simH = 128,           // simulation resolution
    mouseSize = 8.0,                  // splash radius
    viscosity = 0.08,                 // damping
    color = '#1fa6d7'                 // base tint
  } = {}) {
    super(world, { groups: ['all', 'water'] })

    this.renderer = world.renderer
    this.scene = world.scene
    this.camera = world.camera

    // ---- GPU computation setup ------------------------------------------------
    // WebGL2 strongly preferred; Three’s example assumes FloatType in WebGL2.
    // (It still works on WebGL1 on many GPUs, but YMMV.)  :contentReference[oaicite:1]{index=1}
    this.gpu = new GPUComputationRenderer(simW, simH, this.renderer)
    this.gpu.setDataType(THREE.FloatType)

    // Initial height/velocity texture
    const heightTex = this.gpu.createTexture()
    this.#seed(heightTex)

    // Heightmap compute shader (height in .x, velocity in .y)
    const HEIGHTMAP_FS = /* glsl */`
      #include <common>
      uniform vec2 mousePos;     // world coords (X,Z) centered at 0,0
      uniform float mouseSize;   // radius in world units
      uniform float viscosity;   // damping factor
      uniform float delta;       // dt (sec)
      uniform vec2 bounds;       // half-size in world units (X,Y)
      const vec2 ONE = vec2(1.0);

      void main() {
        vec2 cell = 1.0 / resolution.xy;
        vec2 uv = gl_FragCoord.xy * cell;

        // r=height, g=velocity
        vec4 h = texture2D(heightmap, uv);
        float hC = h.x;

        // 4-neighbor laplacian
        float hL = texture2D(heightmap, uv + vec2(-cell.x, 0.0)).x;
        float hR = texture2D(heightmap, uv + vec2( cell.x, 0.0)).x;
        float hD = texture2D(heightmap, uv + vec2(0.0, -cell.y)).x;
        float hU = texture2D(heightmap, uv + vec2(0.0,  cell.y)).x;
        float sump = (hL + hR + hD + hU - 4.0 * hC);

        // simple wave dynamics
        // GRAVITY proportional to resolution (like the example)
        float GRAVITY = resolution.x * 3.0;
        float accel = sump * GRAVITY;

        float vel = h.y + accel * delta;
        float height = hC + vel * delta;

        // viscosity (damping)
        height += sump * viscosity;

        // splash: mouse in world units -> map to [-bounds..+bounds] against uv
        // convert uv->world: (uv-0.5)*2*bounds
        vec2 world = (uv - 0.5) * 2.0 * bounds;
        float d = length(world - vec2(mousePos.x, mousePos.y));
        float k = clamp(1.0 - smoothstep(0.0, mouseSize, d), 0.0, 1.0);
        // cosine ripple like the example
        height += (cos(k * 3.14159265) + 1.0) * 0.28 * k;

        float impulse = (cos(k * 3.14159265) + 1.0) * 0.28 * k;
        vel += impulse * 0.85;      // inject into velocity
        vel *= 0.995;               // tiny global decay (or use your viscosity)
        height = hC + vel * delta;  // integrate

        float fx = min(uv.x, 1.0 - uv.x);
        float fy = min(uv.y, 1.0 - uv.y);
        float border = smoothstep(0.0, 0.04, min(fx, fy)); // 4% border
        vel *= mix(0.95, 1.0, border);

        gl_FragColor = vec4(height, vel, 0.0, 1.0);
      }
    `

    this.varHeight = this.gpu.addVariable('heightmap', HEIGHTMAP_FS, heightTex)
    this.gpu.setVariableDependencies(this.varHeight, [this.varHeight])

    // Uniforms for the compute shader
    const hmU = this.varHeight.material.uniforms
    hmU.mousePos   = { value: new THREE.Vector2(9999, 9999) } // offscreen
    hmU.mouseSize  = { value: mouseSize }
    hmU.viscosity  = { value: viscosity }
    hmU.delta      = { value: 1 / 60 }
    hmU.bounds     = { value: new THREE.Vector2(sizeX * 0.5, sizeY * 0.5) }

    // Required define for the helper (matches the official example idea) :contentReference[oaicite:2]{index=2}
    this.varHeight.material.defines = { ...(this.varHeight.material.defines || {}), BOUNDS: '1' }

    const e = this.gpu.init()
    if (e) console.error(e)

    // ---- Display mesh (displaced plane) --------------------------------------
    // segments = sim resolution - 1 so vertices map 1:1 texels
    const geo = new THREE.PlaneGeometry(sizeX, sizeY, simW - 1, simH - 1)
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHeightMap: { value: null },
        uCell:      { value: new THREE.Vector2(1 / simW, 1 / simH) },
        uColor:     { value: new THREE.Color(color) },
        uEnvStr:    { value: 0.35 }, // cheap env reflection amount
        uFoamParams: { value: new THREE.Vector2(0.02, 0.04) }
      },
      vertexShader: /* glsl */`
        uniform sampler2D uHeightMap;
        uniform vec2 uCell;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        varying vec2 vUv;
        varying float vFoam;

        void main() {
          vUv = uv;
          // sample height
          float h = texture2D(uHeightMap, uv).x;

          vec3 pos = position;
          pos.z += h; // plane is X (right), Y (forward in Three is Z); our plane is X by Y but rotated, see below

          // finite difference normals from heightmap
          float hx1 = texture2D(uHeightMap, uv + vec2(uCell.x, 0.0)).x;
          float hx0 = texture2D(uHeightMap, uv - vec2(uCell.x, 0.0)).x;
          float hy1 = texture2D(uHeightMap, uv + vec2(0.0, uCell.y)).x;
          float hy0 = texture2D(uHeightMap, uv - vec2(0.0, uCell.y)).x;

          vFoam = length(vec2(hx1 - hx0, hy1 - hy0)); // slope magnitude

          vec3 dx = vec3(1.0, 0.0, hx1 - hx0);
          vec3 dy = vec3(0.0, 1.0, hy1 - hy0);
          vec3 n = normalize(cross(dy, dx));

          // output
          vNormalW = normalize(normalMatrix * n);
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vPosW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uEnvStr;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        uniform vec3 uFoamColor;   // vec3(1.0) works great
        uniform vec2 uFoamParams;  // x=threshold, y=sharpness
        varying float vFoam;

        // very cheap spec/reflection using scene.environment (PMREM) if present
        vec3 envSample(vec3 N, vec3 V) {
          // reflect view around normal
          vec3 R = reflect(normalize(V), normalize(N));
          // sample environment via builtin function (requires scene.environment)
          // Three injects getEnvMap() etc for MeshPhysical, but here we fake:
          // We’ll just tint by N•L style if no env.
          return vec3(1.0);
        }

        void main() {
          vec3 N = normalize(vNormalW);
          vec3 V = cameraPosition - vPosW;
          float ndv = max(dot(normalize(N), normalize(V)), 0.0);

          // simple lambert-ish with view factor
          vec3 base = uColor * (0.35 + 0.65 * ndv);

          // fake spec pop
          float gloss = pow(ndv, 64.0);
          vec3 spec = vec3(gloss);

          float foam = smoothstep(uFoamParams.x, uFoamParams.x + uFoamParams.y, vFoam);
          vec3 col = base + spec * 0.25;
          col = mix(col, uFoamColor, clamp(foam, 0.0, 1.0));
          gl_FragColor = vec4(col, 0.95);
        }
      `,
      transparent: true
    })

    const mesh = new THREE.Mesh(geo, mat)
    // Lay flat on XZ (like your Water2)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, y, z)
    this.world.scene.add(mesh)

    this.object3D = mesh
    this.material = mat

    // ---- Pointer → splash -----------------------------------------------------
    // Use Phaser input + Three raycaster to map pointer onto this plane
    this.raycaster = new THREE.Raycaster()
    this.pointerNDC = new THREE.Vector2()
    this.hitPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(sizeX, sizeY),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    this.hitPlane.rotation.x = -Math.PI / 2
    this.hitPlane.position.copy(mesh.position)
    this.world.scene.add(this.hitPlane)

    // Phaser pointer move
    this.world.input.on('pointermove', (p) => {
      // NDC
    const el = this.renderer.domElement
    const w = el.clientWidth, h = el.clientHeight
    this.pointerNDC.set((p.x / w) * 2 - 1, -(p.y / h) * 2 + 1)
    })
  }

  // Fill the initial height texture with small noise (r=height, g=velocity)
  #seed(tex) {
    const data = tex.image.data
    let p = 0
    for (let j = 0; j < tex.image.height; j++) {
      for (let i = 0; i < tex.image.width; i++) {
        data[p + 0] = 0 // height
        data[p + 1] = 0 // velocity
        data[p + 2] = 0
        data[p + 3] = 1
        p += 4
      }
    }
  }

  _worldToLocalXY(worldPoint) {
    const p = worldPoint.clone()
    this.object3D.worldToLocal(p)   // now in the plane's local space
    // PlaneGeometry is in XY, so use (x,y) and ignore local z (≈ 0)
    return new THREE.Vector2(p.x, p.y)
  }

  // Add a splash at world (x,z), optional size/strength override
  splash(x, z, size = null, {coords='world'} = {}) {
    const u = this.varHeight.material.uniforms
    if (coords === 'local') {
      u.mousePos.value.set(x, z) // here z means localY for convenience
    } else {
      // convert a world (x,z) to local XY
      const p = new THREE.Vector3(x, this.object3D.position.y, z)
      const v = this._worldToLocalXY(p)
      u.mousePos.value.copy(v)
    }
    if (size != null) u.mouseSize.value = size
  }

  // convenience: splash at an object’s position
  splashAtObject(obj, size = null) {
    const p = obj.object3D?.getWorldPosition(new THREE.Vector3()) || obj.getWorldPosition?.(new THREE.Vector3())
    if (p) this.splash(p.x, p.z, size)
  }

  update(dt) {
    // pointer → raycast → splash position (one frame pulse)
    this.raycaster.setFromCamera(this.pointerNDC, this.camera)
    const hit = this.raycaster.intersectObject(this.hitPlane, false)[0]
    if (hit) {
      const localXY = this._worldToLocalXY(hit.point)
      // write local coords directly into the compute uniform
      const u = this.varHeight.material.uniforms
      u.mousePos.value.copy(localXY)
    }

    // compute step
    this.varHeight.material.uniforms.delta.value = dt
    this.gpu.compute()

    // bind latest heightmap to draw material
    const tex = this.gpu.getCurrentRenderTarget(this.varHeight).texture
    this.material.uniforms.uHeightMap.value = tex

    // reset mouse offscreen so splash is a pulse
    this.varHeight.material.uniforms.mousePos.value.set(9999, 9999)
  }
}
