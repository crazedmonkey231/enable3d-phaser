import { Sky } from 'three/addons/objects/Sky.js';
import { GameObject } from '../engine/GameObject.js'
import { THREE } from "@enable3d/phaser-extension";

// helpers
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// pick two endpoints for CLEAR days
const CLEAR_GOLDEN = {   // sunrise/sunset: warmer, hazier
  turbidity: 10.0, 
  rayleigh: 3.0, 
  mieCoefficient: 0.02, 
  mieDirectionalG: 0.90, 
  exposure: 0.3
}
const CLEAR_NOON = {     // noon: crisp blue
  turbidity:  3.0, 
  rayleigh: 0.5, 
  mieCoefficient: 0.002, 
  mieDirectionalG: 0.80, 
  exposure: 0.8
}

// returns a blended sky config for the given sun elevation (deg)
function skyForClear(elevationDeg) {
  // normalize: 0 at horizon-ish, 1 near zenith
  const eN = clamp01((elevationDeg - 0) / 80)
  // soften the blend so it stays warm longer near the horizon
  const k = smoothstep(0.25, 0.65, eN)

  return {
    turbidity:        lerp(CLEAR_GOLDEN.turbidity,        CLEAR_NOON.turbidity,        k),
    rayleigh:         lerp(CLEAR_GOLDEN.rayleigh,         CLEAR_NOON.rayleigh,         k),
    mieCoefficient:   lerp(CLEAR_GOLDEN.mieCoefficient,   CLEAR_NOON.mieCoefficient,   k),
    mieDirectionalG:  lerp(CLEAR_GOLDEN.mieDirectionalG,  CLEAR_NOON.mieDirectionalG,  k),
    exposure:         lerp(CLEAR_GOLDEN.exposure,         CLEAR_NOON.exposure,         k),
    // you can also derive ambient/sun intensities here if you like
  }
}

// SunSky: dynamic sky with sun movement and weather effects
export class SunSky extends GameObject {
  constructor(world, lights, {
    dayLength = 60, // seconds for a full day cycle
    weather = 'clear', // 'clear' or 'cloudy'
    startTime = 0.2, // 0 = midnight, 0.5 = noon
    active = true
  } = {}) {
    super(world, { groups: ['all', 'sky'] })

    this.lights = lights
    this.object3D = new Sky();
    this.object3D.scale.setScalar(10000);
    this.world.scene.third.scene.add(this.object3D)
    this.body = null
    this.sun = new THREE.Vector3();
    this.time = startTime * dayLength; // seconds
    this.dayLength = dayLength;
    this.weather = weather;
    this.dirty = true;
    this.active = active;

    const r = this.world.scene.third.renderer
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.outputColorSpace = THREE.SRGBColorSpace

    // PMREM generator + throttle so we don't rebuild every frame
    this.pmrem = new THREE.PMREMGenerator(r)
    this._pmremRT = null
    this._envCooldown = 0 // seconds until next PMREM update is allowed
    this._envSky = new Sky()
    this._envSky.scale.setScalar(10000)

    // Weather presets
    this.weatherPresets = {
      clear: {
        turbidity: 10,
        rayleigh: 3,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
        exposure: 0.7,
        ambient: 0.1,
        sunIntensity: 1.0,
        sunColor: 0xffffff,
        ambientColor: 0xffffff
      },
      cloudy: {
        turbidity: 20,
        rayleigh: 1.5,
        mieCoefficient: 0.02,
        mieDirectionalG: 0.9,
        exposure: 0.5,
        ambient: 0.3,
        sunIntensity: 0.5,
        sunColor: 0xe0e0e0,
        ambientColor: 0xd0d0ff
      }
    }

    this.setWeather(this.weather);
    this.updateSky(0);
  }

  setWeather(weather) {
    this.weather = weather;
    this.preset = this.weatherPresets[weather] || this.weatherPresets.clear;
    this.dirty = true;
  }

  // t: 0..1 (0 = midnight, 0.5 = noon)
  setTimeOfDay(t) {
    this.time = t * this.dayLength;
    this.dirty = true;
  }

  update(dt) {
    super.update(dt);
    if (!this.active) return;

    // update sky
    this.updateSky(dt);
  }

  updateSky(dt) {
    this.time = (this.time + dt) % this.dayLength;
    // Calculate time of day (0..1)
    const t = this.time / this.dayLength;

    // Sun elevation: 0 at midnight, 90 at noon
    // Map t=0.0 (midnight) -> -5 deg, t=0.25 (sunrise) -> 10 deg, t=0.5 (noon) -> 80 deg, t=0.75 (sunset) -> 10 deg, t=1.0 (midnight) -> -5 deg
    let elevation;
    if (t < 0.25) {
      elevation = -5 + 60 * (t / 0.25); // -5 to 55
    } else if (t < 0.5) {
      elevation = 55 + 25 * ((t - 0.25) / 0.25); // 55 to 80
    } else if (t < 0.75) {
      elevation = 80 - 70 * ((t - 0.5) / 0.25); // 80 to 10
    } else {
      elevation = 10 - 15 * ((t - 0.75) / 0.25); // 10 to -5
    }

    // Azimuth: 180 at noon, 0 at midnight
    const azimuth = 180 + 180 * Math.sin(Math.PI * t);

    // Fade sun/ambient at night
    const night = elevation < 0;
    const sunIntensity = night ? 0 : this.preset.sunIntensity * (elevation / 80);

    // Update sky uniforms
    let cfg = this.preset
    if (this.weather === 'clear') {
      cfg = skyForClear(elevation)   // <- use the dynamic noon blend
    }

    const uniforms = this.object3D.material.uniforms
    uniforms.turbidity.value        = cfg.turbidity
    uniforms.rayleigh.value         = cfg.rayleigh
    uniforms.mieCoefficient.value   = cfg.mieCoefficient
    uniforms.mieDirectionalG.value  = cfg.mieDirectionalG

    // renderer exposure tracks the sky look
    this.world.scene.third.renderer.toneMappingExposure = cfg.exposure

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(this.sun);

    // Update lights
    if (this.lights.directionalLight) {
      this.lights.directionalLight.position.set(
        100 * Math.sin(theta) * Math.cos(phi),
        100 * Math.cos(theta),
        100 * Math.sin(theta) * Math.sin(phi)
      );
      this.lights.directionalLight.intensity = sunIntensity;
      this.lights.directionalLight.color.set(this.preset.sunColor);
      this.lights.directionalLight.castShadow = !night;
    }
    if (this.lights.ambientLight) {
      const ambientAtSunrise = this.preset.ambient * 2
      const ambientAtNoon    = 0.08
      const eN = clamp01((elevation - 0) / 80)
      const k  = smoothstep(0.25, 0.65, eN)
      this.lights.ambientLight.intensity = lerp(ambientAtSunrise, ambientAtNoon, k);
      this.lights.ambientLight.color.set(this.preset.ambientColor);
    }
    if (this.lights.hemisphereLight) {
      this.lights.hemisphereLight.position.set(
        100 * Math.sin(theta) * Math.cos(phi),
        100 * Math.cos(theta),
        100 * Math.sin(theta) * Math.sin(phi)
      );
      this.lights.hemisphereLight.intensity = sunIntensity;
      this.lights.hemisphereLight.color.set(this.preset.sunColor);
      this.lights.hemisphereLight.groundColor.set(this.preset.ambientColor);
    }

    // --- rebuild PMREM environment on a short cooldown (e.g., every 1s) ---
    this._envCooldown -= dt
    if (this.dirty || this._envCooldown <= 0) {
      
      const ue = this._envSky.material.uniforms
      ue.turbidity.value       = Math.max(2.5, uniforms.turbidity.value * 0.6)
      ue.rayleigh.value        = uniforms.rayleigh.value * 1.05
      ue.mieCoefficient.value  = uniforms.mieCoefficient.value * 0.5
      ue.mieDirectionalG.value = lerp(0.8, uniforms.mieDirectionalG.value, 0.5)
      ue.sunPosition.value.copy(uniforms.sunPosition.value)

      this._pmremRT?.dispose()
      this._pmremRT = this.pmrem.fromScene(this._envSky)
      this.world.scene.third.scene.environment = this._pmremRT.texture
      this._envCooldown = 1
    }

    // Broadcast sun direction so water (and others) can react immediately
    this.world.scene.events.emit('sun-changed', this.sun.clone())

    // Optional: if you’re using the World groups, push sun to any water objects:
    const g = this.world.getGroup?.('water')
    if (g) {
      for (const obj of g) {
        const u = obj?.object3D?.material?.uniforms?.sunDirection
        if (u) u.value.copy(this.sun).normalize()
      }
    }

    this.dirty = false;
  }

  // Optionally, allow manual weather change
  setClear() { this.setWeather('clear'); }
  setCloudy() { this.setWeather('cloudy'); }
}