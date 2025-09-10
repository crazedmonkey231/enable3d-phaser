// PostFXManager: manage Three.js post-processing passes dynamically
import * as THREE from 'three'
import { PosterizeShader } from './fx/PosterizeShader.js'
import { EffectComposer, 
  RenderPass, 
  OutputPass,
  ShaderPass, 
  UnrealBloomPass,
  FilmPass, 
  RenderPixelatedPass, 
  OutlinePass,
  BokehPass,
  SAOPass,
  SSRPass,
  SMAAPass,
  SSAARenderPass,
  TAARenderPass,
  FXAAShader,
  DotScreenPass,
  LUTPass,
  HalftonePass,
  GlitchPass,
  AfterimagePass
} from 'three/examples/jsm/Addons.js'


/**
 * PostFXManager manages post-processing effects (post-processing passes) for a 3D scene using THREE.js and EffectComposer.
 * 
 * It provides a flexible API to add, remove, enable, disable, and configure a variety of post-processing passes such as Bloom, FXAA, Outline, SSR, SMAA, Pixelate, LUT, Halftone, Glitch, Afterimage, and more.
 * 
 * The manager ensures correct pass ordering, handles resizing, and offers convenience methods for common effects.
 * 
 * @class
 * @example
 * const fx = new PostFXManager(scene);
 * fx.useBloom();
 * fx.useFXAA();
 * fx.enable('bloom', false);
 * fx.set('bloom', 'strength', 2.0);
 * fx.tween('bloom', { strength: 1.0 }, 500);
 * 
 * @param {Phaser.Scene} scene - The Phaser scene containing the `third` property with THREE.js renderer, scene, and camera.
 * 
 * @property {THREE.Scene} scene - The THREE.js scene.
 * @property {THREE.Camera} camera - The THREE.js camera.
 * @property {THREE.WebGLRenderer} renderer - The THREE.js renderer.
 * @property {EffectComposer} composer - The EffectComposer instance managing the passes.
 * 
 * @method add(name, pass, options) - Add a custom pass.
 * @method remove(name) - Remove and dispose a pass by name.
 * @method enable(name, enabled) - Enable or disable a pass.
 * @method get(name) - Get the underlying pass by name.
 * @method set(name, path, value) - Set a deeply-nested property on a pass.
 * @method update(timeSec, dtSec) - Call update hooks on passes.
 * @method resize(width, height) - Resize renderer, composer, and passes.
 * @method forceResize() - Force a resize (e.g., after canvas size changes).
 * @method tween(name, props, duration, ease, yoyo, repeat) - Tween a numeric property on a pass.
 * 
 * @method useShader(name, shaderDef, options) - Add a custom ShaderPass.
 * @method useBloom(name, params, options) - Add a Bloom pass.
 * @method useFXAA(name, options) - Add an FXAA pass.
 * @method useOutline(name, params, options) - Add an Outline pass.
 * @method setOutlineSelection(objectsArray, name) - Set selected objects for Outline pass.
 * @method useOutput(name, options) - Add an Output pass.
 * @method useFilm(name, params, options) - Add a Film pass.
 * @method useToon(name, params, options) - Add a Toon (Posterize) pass.
 * @method useBokeh(name, params, options) - Add a Bokeh pass.
 * @method useSSR(name, params, options) - Add a SSR pass.
 * @method useSMAA(name, params, options) - Add a SMAA pass.
 * @method useSSAA(name, params, options) - Add a SSAA pass.
 * @method useSAO(name, params, options) - Add a SAO pass.
 * @method useTAA(name, params, options) - Add a TAA pass.
 * @method usePixelate(name, params, options) - Add a Pixelate pass (replaces base RenderPass).
 * @method restoreBaseRender() - Restore the normal RenderPass as the base.
 * @method useDotScreen(name, params, options) - Add a DotScreen pass.
 * @method useLUT(name, params, options) - Add a LUT pass.
 * @method useHalftone(name, params, options) - Add a Halftone pass.
 * @method useGlitch(name, params, options) - Add a Glitch pass.
 * @method useAfterImage(name, params, options) - Add an Afterimage pass.
 */
export class PostFXManager {
  constructor (scene) {
    if (!scene.third?.composer)
      scene.third.composer = new EffectComposer(scene.third.renderer)
    if (!scene.third?.renderer || !scene.third?.scene || !scene.third?.camera) throw new Error('Missing renderer/scene/camera')

    this.scene3d = scene
    const third = scene.third
    this.composer = third.composer
    this.renderer = third.renderer
    this.scene = third.scene
    this.camera = third.camera

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0); // the default

    // Ensure a RenderPass exists first
    if (!this.composer.passes.some(p => p instanceof RenderPass)) {
      this.composer.addPass(new RenderPass(this.scene, this.camera))
    }

    this._passes = new Map() // name -> { pass, onUpdate?, onResize? }
    this._order = []         // names after RenderPass in order

    // Resize hook
    // scene.scale.on('resize', (size) => this.resize(size.width, size.height))
    this.scene3d.scale.on('resize', (size) => {
      const W = Math.max(1, Math.floor(size.width))
      const H = Math.max(1, Math.floor(size.height))
      this.resize(W, H)
      this.camera.aspect = W / H
      this.camera.updateProjectionMatrix()
})
  }

  /** Insert a pass into composer after RenderPass, with optional relative position */
  _insertPass(pass, { after = null, before = null } = {}) {
    const rpIndex = this.composer.passes.findIndex(p => p instanceof RenderPass)
    let idx = rpIndex + 1 + this._order.length
    if (after && this._order.includes(after)) idx = rpIndex + 1 + (this._order.indexOf(after) + 1)
    if (before && this._order.includes(before)) idx = rpIndex + 1 + (this._order.indexOf(before))
    // Put into our logical order list too
    const name = (pass.__fxName ?? `pass-${this._order.length + 1}`)
    if (!this._order.includes(name)) {
      if (typeof before === 'string' && this._order.includes(before)) {
        this._order.splice(this._order.indexOf(before), 0, name)
      } else if (typeof after === 'string' && this._order.includes(after)) {
        this._order.splice(this._order.indexOf(after) + 1, 0, name)
      } else {
        this._order.push(name)
      }
    }
    // Insert in composer
    this.composer.passes.splice(idx, 0, pass)
    this.composer.readBuffer.setSize(this.renderer.domElement.width, this.renderer.domElement.height)
  }

  /** Add any pass */
  add(name, pass, { after = null, before = null, onUpdate = null, onResize = null } = {}) {
    if (this._passes.has(name)) this.remove(name)
    pass.__fxName = name
    this._insertPass(pass, { after, before })
    this._passes.set(name, { pass, onUpdate, onResize })
    return pass
  }

  /** Remove and dispose a pass */
  remove(name) {
    const rec = this._passes.get(name)
    if (!rec) return
    const { pass } = rec
    const idx = this.composer.passes.indexOf(pass)
    if (idx >= 0) this.composer.passes.splice(idx, 1)
    this._order = this._order.filter(n => n !== name)
    // best-effort dispose
    try {
      pass.dispose?.()
      pass.material?.dispose?.()
      pass.fsQuad?.dispose?.()
    } catch {}
    this._passes.delete(name)
  }

  /** Enable/disable a pass */
  enable(name, v = true) {
    const rec = this._passes.get(name); if (!rec) return
    rec.pass.enabled = !!v
  }

  /** Get the underlying pass */
  get(name) { return this._passes.get(name)?.pass || null }

  /** Set a deeply-nested property (e.g., "material.uniforms.uTime.value") */
  set(name, path, value) {
    const pass = this.get(name); if (!pass) return
    const parts = path.split('.'); let obj = pass
    for (let i = 0; i < parts.length - 1; i++) obj = obj?.[parts[i]]
    if (obj) obj[parts.at(-1)] = value
  }

  /** Update all passes that registered an updater */
  update(timeSec, dtSec) {
    for (const { pass, onUpdate } of this._passes.values()) {
      onUpdate?.(pass, timeSec, dtSec)
    }
  }

  /** Handle resize for composer + passes */
  resize(w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    for (const { pass, onResize } of this._passes.values()) {
      // Some passes expose setSize
      pass.setSize?.(w, h)
      onResize?.(pass, w, h)
    }
  }

  // ---------- Convenience builders ----------

  /** Add a custom ShaderPass from { uniforms, vertexShader, fragmentShader } */
  useShader(name, shaderDef, opts = {}) {
    const pass = new ShaderPass(shaderDef)
    return this.add(name, pass, opts)
  }

  /** Bloom */
  useBloom(name = 'bloom', { strength = 0.8, radius = 0.4, threshold = 0.85 } = {}, opts = {}) {
    const size = new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height)
    const pass = new UnrealBloomPass(size, strength, radius, threshold)
    return this.add(name, pass, {
      ...opts,
      onResize: (p, w, h) => p.setSize(w, h)
    })
  }

  /** FXAA */
  useFXAA(name = 'fxaa', opts = {}) {
    const pass = new ShaderPass(FXAAShader)
    const setRes = () => {
      const r = this.renderer.getDrawingBufferSize(new THREE.Vector2())
      pass.material.uniforms['resolution'].value.set(1 / r.x, 1 / r.y)
    }
    setRes()
    return this.add(name, pass, {
      ...opts,
      onResize: () => setRes()
    })
  }

  /** Outline (selection highlighting) */
  useOutline(name = 'outline', { edgeStrength = 5, edgeThickness = 1, visibleEdge = '#ffff00', hiddenEdge = '#ffff00' } = {}, opts = {}) {
    const size = new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height)
    const pass = new OutlinePass(size, this.scene, this.camera)
    pass.edgeStrength = edgeStrength
    pass.edgeThickness = edgeThickness
    pass.visibleEdgeColor.set(visibleEdge)
    pass.hiddenEdgeColor.set(hiddenEdge)
    return this.add(name, pass, {
      ...opts,
      onResize: (p, w, h) => p.setSize(w, h)
    })
  }

  /** Update Outline selection */
  setOutlineSelection(objectsArray, name = 'outline') {
    const pass = this.get(name); if (!pass) return
    pass.selectedObjects = objectsArray || []
  }

  /** Add a basic OutputPass (for tone mapping/color grading) */
  useOutput(name = 'output', opts = {}) {
    const pass = new OutputPass();
    return this.add(name, pass, opts)
  }

  /** Add a FilmPass */
  useFilm(name = 'film', { noiseIntensity = 0.5, grayscale = false } = {}, opts = {}) {
    const pass = new FilmPass(noiseIntensity, grayscale)
    return this.add(name, pass, opts)
  }

  useToon(name = 'toon', { levels = 150.0 } = {}, opts = {}) {
    const pass = new ShaderPass(PosterizeShader)
    pass.material.uniforms.levels = { value: levels }
    return this.add(name, pass, opts)
  }

  useBokeh(name = 'bokeh', { focus = 1.5, aperture = 0.0005, maxblur = 3.0 } = {}, opts = {}) {
    const pass = new BokehPass(this.scene, this.camera, {
      focus,
      aperture,
      maxblur
    })
    return this.add(name, pass, opts)
  }

  /** Add a SSR Pass (screen-space reflections) */
  useSSR(name = 'ssr', { output = 0, thickness = 0.1, maxDistance = 100, maxSteps = 100, jitter = 0.7, fade = 0.5, roughnessFade = 1, ior = 1.45, power = 1, intensity = 1, bias = 0.01 } = {}, opts = {}) {
    const pass = new SSRPass({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      output,
      thickness,
      maxDistance,
      maxSteps,
      jitter,
      fade,
      roughnessFade,
      ior,
      power,
      intensity,
      bias
    })
    return this.add(name, pass, {
      ...opts,
      onResize: (p, w, h) => p.setSize(w, h)
    })
  }

  /** Add a SMAA Pass (subpixel morphological anti-aliasing) */
  useSMAA(name = 'smaa', { width=400, height=400 } = {}, opts = {}) {
    const pass = new SMAAPass(width, height)
    return this.add(name, pass, { ...opts })
  }

  /** Add a SSAA Pass (supersample anti-aliasing) */
  useSSAA(name = 'ssaa', { clearColor = "#ffffff", clearAlpha = 1 } = {}, opts = {}) {
    const pass = new SSAARenderPass(this.scene, this.camera, clearColor, clearAlpha)
    return this.add(name, pass, { ...opts })
  }

  /** Add a SAO Pass (screen-space ambient occlusion) */
  useSAO(name = 'sao', { saoBias = 0.5, saoIntensity = 0.02, saoScale = 100, saoKernelRadius = 100, saoMinResolution = 0 } = {}, opts = {}) {
    const pass = new SAOPass(this.scene, this.camera)
    pass.params.saoBias = saoBias
    pass.params.saoIntensity = saoIntensity
    pass.params.saoScale = saoScale
    pass.params.saoKernelRadius = saoKernelRadius
    pass.params.saoMinResolution = saoMinResolution
    return this.add(name, pass, opts)
  }

  /** Add a TAA Pass (temporal anti-aliasing) */
  useTAA(name = 'taa', { clearColor = "#ffffff", clearAlpha = 1 } = {}, opts = {}) {
    const pass = new TAARenderPass(this.scene, this.camera, clearColor, clearAlpha)
    return this.add(name, pass, opts)
  }

  /** Add a Pixelated Pass 
   * Note: this replaces the base RenderPass since it does its own rendering
  */
  usePixelate(name = 'pixelate', {
    pixelSize = 6,
    normalEdgeStrength = 0.3,
    depthEdgeStrength  = 0.4,
    pixelAlignedPanning = true
  } = {}, opts = {}) {
    // 1) remove the default RenderPass (RenderPixelatedPass renders the scene itself)
    const rpIndex = this.composer.passes.findIndex(p => p instanceof RenderPass)
    if (rpIndex !== -1) this.composer.passes.splice(rpIndex, 1)

    // 2) create pixelated base pass and insert at the start
    const pass = new RenderPixelatedPass(pixelSize, this.scene, this.camera, {
      normalEdgeStrength, depthEdgeStrength, pixelAlignedPanning
    })
    pass.__fxName = name
    this.composer.passes.splice(0, 0, pass)
    this._passes.set(name, { pass, onResize: (p, w, h) => p.setSize(w, h) })
    if (!this._order.includes(name)) this._order.unshift(name)

    // 3) ensure an OutputPass at the very end (color/tone mapping when using composer)
    if (!this.composer.passes.some(p => p instanceof OutputPass)) {
      this.composer.addPass(new OutputPass())
    }
    return pass
  }

  /** Restore a normal RenderPass as the base (remove pixelate if present) */
  restoreBaseRender() {
    // remove any pixelated base we added
    for (const [name, rec] of this._passes) {
      if (rec.pass instanceof RenderPixelatedPass) {
        this.remove(name)
      }
    }
    // put a normal RenderPass back at the front if missing
    if (!this.composer.passes.some(p => p instanceof RenderPass)) {
      this.composer.passes.splice(0, 0, new RenderPass(this.scene, this.camera))
    }
  }

  /** Add a DotScreen Pass */
  useDotScreen(name = 'dotscreen', { center = { x: 0, y: 0 }, scale = 0.8, angle = 0 } = {}, opts = {}) {
    const pass = new DotScreenPass(center, angle, scale)
    return this.add(name, pass, opts)
  }

  /** Add a LUT Pass */
  useLUT(name = 'lut', { lut, intensity } = {}, opts = {}) {
    const pass = new LUTPass({  lut, intensity })
    return this.add(name, pass, opts)
  }

  /** Add a Halftone Pass */
  useHalftone(name = 'halftone', { width = 800, height = 800, shape = 1, radius = 2, rotateR = 0, rotateG = Math.PI / 4, rotateB = Math.PI / 2, scatter = 0, blending = THREE.NormalBlending, greyscale = false, disable = false } = {}, opts = {}) {
    const pass = new HalftonePass(width, height, {
      shape,
      radius,
      rotateR,
      rotateG,
      rotateB,
      scatter,
      blending,
      greyscale,
      disable
    })
    return this.add(name, pass, opts)
  }

  /** Add a Glitch Pass */
  useGlitch(name = 'glitch', { dtSize = 5, goWild = false, curF = 5, randX = 5 } = {}, opts = {}) {
    const pass = new GlitchPass(dtSize)
    pass.goWild = goWild
    pass.curF = curF
    pass.randX = randX
    return this.add(name, pass, opts)
  }

  /** Add an Afterimage Pass */
  useAfterImage(name = 'afterimage', { damp = 0.96 } = {}, opts = {}) {
    const pass = new AfterimagePass(damp)
    return this.add(name, pass, opts)
  }

  /**
   * Tween any numeric property on a pass (requires Phaser tween manager).
   * Example: fx.tween('bloom', { strength: 2.0 }, 250, 'Sine.easeOut', true)
   */
  tween(name, props, duration = 300, ease = 'Linear', yoyo = false, repeat = 0) {
    const pass = this.get(name); if (!pass || !this.scene3d.tweens) return null
    return this.scene3d.tweens.add({ targets: pass, ...props, duration, ease, yoyo, repeat })
  }

  // Force resize for cases where the canvas size may have changed but no resize event was fired (e.g. window reload)
  forceResize() {
    const { width, height } = this.scene3d.scale.gameSize
    // Ensure non-zero:
    const W = Math.max(1, Math.floor(width))
    const H = Math.max(1, Math.floor(height))

    // Update renderer, composer, and camera immediately
    this.resize(W, H)
    this.camera.aspect = W / H
    this.camera.updateProjectionMatrix()

    this.scene3d.time.delayedCall(0, () => {
      this.resize(W, H)
      this.camera.aspect = W / H
      this.camera.updateProjectionMatrix()
    })
  }
}
