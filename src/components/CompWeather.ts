// Weather component for managing weather effects in the game
import { THREE } from "@enable3d/phaser-extension";
import { GameObject, GameObjectComponent, ICompProps } from '../engine/GameObject';
import { Sky } from 'three/addons/objects/Sky.js';

// helpers
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const CLEAR_GOLDEN = {   // sunrise/sunset: warmer, hazier
  turbidity: 10.0, 
  rayleigh: 3.0, 
  mieCoefficient: 0.02, 
  mieDirectionalG: 0.90, 
  exposure: 0.1,
  ambient: 0.05,
  sunIntensity: 0.1,
  sunColor: 0x0000ff, // dark blue
  ambientColor: 0xffa500 // orange
}

const CLEAR_NOON = {     // noon: crisp blue
  turbidity:  3.0, 
  rayleigh: 0.5, 
  mieCoefficient: 0.002, 
  mieDirectionalG: 0.80, 
  exposure: 0.7,
  ambient: 0.3,
  sunIntensity: 0.8,
  sunColor: 0xffffff, // white
  ambientColor: 0x87ceeb // light blue
}

// returns a blended sky config for the given sun elevation (deg)
function blendSky(elevationDeg: number, s1:IWeatherState, s2:IWeatherState) {
  // normalize: 0 at horizon-ish, 1 near zenith
  const eN = clamp01((elevationDeg - 0) / 80)
  // soften the blend so it stays warm longer near the horizon
  const k = smoothstep(0.25, 0.65, eN)

  return {
    turbidity:        lerp(s1.turbidity, s2.turbidity, k),
    rayleigh:         lerp(s1.rayleigh, s2.rayleigh, k),
    mieCoefficient:   lerp(s1.mieCoefficient, s2.mieCoefficient, k),
    mieDirectionalG:  lerp(s1.mieDirectionalG, s2.mieDirectionalG, k),
    exposure:         lerp(s1.exposure, s2.exposure, k),
    ambient:          lerp(s1.ambient, s2.ambient, k),
    sunIntensity:     lerp(s1.sunIntensity, s2.sunIntensity, k),
    sunColor:         new THREE.Color(s1.sunColor).lerp(new THREE.Color(s2.sunColor), k),
    ambientColor:     new THREE.Color(s1.ambientColor).lerp(new THREE.Color(s2.ambientColor), k),
    // you can also derive ambient/sun intensities here if you like
  }
}

export enum WeatherType {
  CLEAR = 'clear',
  RAIN = 'rain',
  SNOW = 'snow',
}

export interface IWeatherState {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  exposure: number;
  ambient: number;
  sunIntensity: number;
  sunColor: number;
  ambientColor: number;
}

export interface ICompWeatherProps extends ICompProps {
  lights: any;
  dayLength?: number;
  nightLength?: number;
  weatherType?: WeatherType;
  startTime?: number;
  active?: boolean;
}

export class CompWeather extends GameObjectComponent {
  sky: Sky;
  sun: THREE.Vector3;
  time: number;
  lights: any;
  pmrem: THREE.PMREMGenerator;
  private _envCooldown: number;
  private _envSky: any;
  constructor(gameObject: GameObject, props: ICompWeatherProps) {
    super(gameObject, props);
    const p = this.props as ICompWeatherProps;
    p.weatherType = props.weatherType ?? WeatherType.CLEAR;
    p.dayLength = props.dayLength ?? 120; // seconds
    p.nightLength = props.nightLength ?? 60; // seconds
    p.startTime = props.startTime ?? 0.25; // 0 to 1 (0 = midnight, 0.5 = noon)
    p.active = props.active !== undefined ? props.active : true; // default to true

    const r = this.parent.props.gameScene.third.renderer
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.outputColorSpace = THREE.SRGBColorSpace

    const scalar = 450000;

    this.sky = new Sky();
    this.sky.scale.setScalar(scalar);
    this.sun = new THREE.Vector3();
    this.time = p.startTime * p.dayLength; // seconds
    this.lights = p.lights;

    // PMREM generator + throttle so we don't rebuild every frame
    this.pmrem = new THREE.PMREMGenerator(r)
    this._envCooldown = 0 // seconds until next PMREM update is allowed
    this._envSky = new Sky()
    this._envSky.scale.setScalar(scalar);

    this.updateWeatherEffects();
    if (!p.active){
      this.updateSky(0);
    }
  }

  // t: 0..1 (0 = midnight, 0.5 = noon)
  public setTimeOfDay(t: number): void {
    const p = this.props as ICompWeatherProps;
    this.time = t * p.dayLength!;
  }

  public setWeather(type: WeatherType): void {
      const p = this.props as ICompWeatherProps;
      p.weatherType = type;
      this.updateWeatherEffects();
  }

  private updateWeatherEffects(): void {
      // Update the game environment based on the current weather type
      const p = this.props as ICompWeatherProps;
      switch (p.weatherType) {
          case WeatherType.CLEAR:
              this.clearWeather(CLEAR_NOON, CLEAR_GOLDEN);
              break;
          case WeatherType.RAIN:
              this.startRain();
              break;
          case WeatherType.SNOW:
              this.startSnow();
              break;
      }
  }

  private clearWeather(day:IWeatherState, night:IWeatherState): void {

  }

  private startRain(): void {
      // Logic for starting rain
  }

  private startSnow(): void {
      // Logic for starting snow
  }

  private updateSky(dt: number): void {
    const p = this.props as ICompWeatherProps;

    // Update the time of day
    this.time += dt;
    if (this.time > p.dayLength! + p.nightLength!) {
      this.time = 0;
    }
    let t;
    if (this.time < p.dayLength!) {
      // Daytime
      t = this.time / p.dayLength!;
    } else {
      // Nighttime
      t = 1 - ((this.time - p.dayLength!) / p.nightLength!);
    }
    const theta = Math.PI * (t - 0.5);
    const phi = 2 * Math.PI * (0.25);
    
    this.sun.setFromSphericalCoords(1, Math.PI / 2 - theta, phi);
    // const elevation = THREE.MathUtils.radToDeg(Math.PI / 2 - theta);

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

    const night = elevation <= -5;
    const sunIntensity = night ? 0 : Math.max(0.1, this.sun.y);

    // Get sky configuration based on time of day
    let sunConfig = night ? CLEAR_GOLDEN : blendSky(elevation, CLEAR_NOON, CLEAR_GOLDEN);
    
    const uniforms = this.sky.material.uniforms
    uniforms.turbidity.value        = sunConfig.turbidity
    uniforms.rayleigh.value         = sunConfig.rayleigh
    uniforms.mieCoefficient.value   = sunConfig.mieCoefficient
    uniforms.mieDirectionalG.value  = sunConfig.mieDirectionalG

    this.parent.props.gameScene.third.renderer.toneMappingExposure = sunConfig.exposure
    
    // Update sky shader and lighting
    this.sky.material.uniforms['sunPosition'].value.copy(this.sun);

    // Update lights
    if (this.lights.directionalLight) {
      this.lights.directionalLight.position.set(
        100 * Math.sin(theta) * Math.cos(phi),
        100 * Math.cos(theta),
        100 * Math.sin(theta) * Math.sin(phi)
      );
      this.lights.directionalLight.intensity = sunIntensity;
      this.lights.directionalLight.color.set(sunConfig.sunColor);
      this.lights.directionalLight.castShadow = !night;
    }
    if (this.lights.ambientLight) {
      const ambientAtSunrise = sunConfig.ambient * 2
      const ambientAtNoon    = 0.08
      const eN = clamp01((elevation - 0) / 80)
      const k  = smoothstep(0.25, 0.65, eN)
      this.lights.ambientLight.intensity = lerp(ambientAtSunrise, ambientAtNoon, k);
      this.lights.ambientLight.color.set(sunConfig.ambientColor);
    }
    if (this.lights.hemisphereLight) {
      this.lights.hemisphereLight.position.set(
        100 * Math.sin(theta) * Math.cos(phi),
        100 * Math.cos(theta),
        100 * Math.sin(theta) * Math.sin(phi)
      );
      this.lights.hemisphereLight.intensity = sunIntensity;
      this.lights.hemisphereLight.color.set(sunConfig.sunColor);
      this.lights.hemisphereLight.groundColor.set(sunConfig.ambientColor);
    }

    // Update PMREM environment map every 2 seconds
    this._envCooldown -= dt;
    if (this._envCooldown <= 0) {
      this._envCooldown = 1;
      this.updatePMREM();
    }
    
  }

  private updatePMREM(): void {
    // Update the PMREM environment map based on the current sky
    const uniforms = this.sky.material.uniforms
    const ue = this._envSky.material.uniforms
    ue.turbidity.value       = Math.max(2.5, uniforms.turbidity.value * 0.5)
    ue.rayleigh.value        = uniforms.rayleigh.value * 1.05
    ue.mieCoefficient.value  = uniforms.mieCoefficient.value * 0.5
    ue.mieDirectionalG.value = lerp(0.8, uniforms.mieDirectionalG.value, 0.5)
    ue.sunPosition.value.copy(uniforms.sunPosition.value)

    this._envSky.material.uniforms['sunPosition'].value.copy(this.sun);
    
    const envMap = this.pmrem.fromScene(this._envSky).texture;
    this.parent.props.gameScene.third.scene.environment = envMap;

    this.parent.props.gameScene.events.emit('sun-changed', this.sun.clone());
  }

  compStart(): void {
    this.parent.props.gameScene.third.scene.add(this.sky);
  }

  compUpdate(dt: number): void {
    const p = this.props as ICompWeatherProps;
    if (!p.active) return;
    this.updateSky(dt);
  }

  compDestroy(): void {
    this.parent.props.gameScene.third.scene.remove(this.sky);
    this.pmrem.dispose();
  }

  compSetProperties(props: ICompWeatherProps): void {
      const p = this.props as ICompWeatherProps;
      p.dayLength = props.dayLength ?? p.dayLength;
      p.nightLength = props.nightLength ?? p.nightLength;
      p.startTime = props.startTime ?? p.startTime;
      p.active = props.active !== undefined ? props.active : p.active;
      p.weatherType = props.weatherType ?? p.weatherType;
  } 
}
