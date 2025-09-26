// This component adds buoyancy behavior to a 3D object
import { THREE } from "@enable3d/phaser-extension";
import { GameObject, GameObjectComponent, ICompProps } from '../engine/GameObject';
import { CompWaterPBR } from './CompWaterPBR';

const _probeWorld = new THREE.Vector3()
const _gravityForce = new THREE.Vector3()
const _objectWorld = new THREE.Vector3()
const _forceVec = new THREE.Vector3()
const _leverArm = new THREE.Vector3()
const _torqueAccum = new THREE.Vector3()
const _torqueTemp = new THREE.Vector3()
const _angularAxis = new THREE.Vector3()
const _deltaQuat = new THREE.Quaternion()

export interface ICompBuoyancyProps extends ICompProps {
  water: CompWaterPBR; // Reference to the CompWaterPBR
  probes: THREE.Vector3[]; // Local-space points on the object to sample water height
  density?: number; // Density of the object (default: 1)
  volume?: number; // Volume of the object (default: 1)
  dragCoefficient?: number; // Drag coefficient (default: 1)
  angularDragCoefficient?: number; // Angular drag coefficient (default: 1)
  gravity?: THREE.Vector3; // Gravity vector (default: (0, -9.81, 0))
}

export class CompBuoyancy extends GameObjectComponent {
  water: CompWaterPBR;
  density: number;
  volume: number;
  dragCoefficient: number;
  angularDragCoefficient: number;
  gravity: THREE.Vector3;
  buoyancyForce: THREE.Vector3 = new THREE.Vector3();
  dragForce: THREE.Vector3 = new THREE.Vector3();
  private _velocity: THREE.Vector3 = new THREE.Vector3();
  private _angularVelocity: THREE.Vector3 = new THREE.Vector3();
  constructor(gameObject: GameObject, props: ICompBuoyancyProps) {
    super(gameObject, props);
    const p = this.props as ICompBuoyancyProps;
    this.water = p.water;
    this.density = p.density || 0.5;
    this.volume = p.volume || 1;
    this.dragCoefficient = p.dragCoefficient || 0.75;
    this.angularDragCoefficient = p.angularDragCoefficient || 0.75;
    this.gravity = p.gravity || new THREE.Vector3(0, -9.81, 0);
    if (!this.water) {
      console.warn('CompBuoyancy: water property is required', this.water);
    }
  }

  compStart(){  }

  compUpdate(dt: number) {
    const p = this.props as ICompBuoyancyProps;
    if (!p.probes || p.probes.length === 0 || !this.water) return;

    const object3D = this.parent.props.object3D;
    object3D.updateMatrixWorld(true);
    object3D.getWorldPosition(_objectWorld);
    const matrixWorld = object3D.matrixWorld;

    const probeCount = p.probes.length;
    const perProbeVolume = Math.max(this.volume / probeCount, 1e-3);

    let accumulatedHeight = 0;
    let validCount = 0;
    let totalBuoyancy = 0;
    _torqueAccum.set(0, 0, 0);

    for (let i = 0; i < probeCount; i++) {
      const probe = p.probes[i];
      _probeWorld.copy(probe).applyMatrix4(matrixWorld);

      const waterHeight = this.water.getHeightAtPoint(_probeWorld);
      if (!Number.isFinite(waterHeight)) continue;

      accumulatedHeight += waterHeight;
      validCount++;

      const depth = waterHeight - _probeWorld.y;
      if (depth <= 0) continue;

      const clampedDepth = Math.min(Math.max(depth, 0), perProbeVolume);
      const buoyancyForceY = clampedDepth * this.volume * 9.81;

      totalBuoyancy += buoyancyForceY;

      _forceVec.set(0, buoyancyForceY, 0);
      _leverArm.copy(_probeWorld).sub(_objectWorld);
      _torqueTemp.copy(_leverArm).cross(_forceVec);
      _torqueAccum.add(_torqueTemp);
    }

    if (validCount === 0) {
      this.buoyancyForce.set(0, 0, 0);
      return;
    }

    const avgWaterHeight = accumulatedHeight / validCount;
    this.buoyancyForce.set(0, totalBuoyancy, 0);

    this._applyForces(avgWaterHeight, totalBuoyancy, _torqueAccum, dt);
    _torqueAccum.set(0, 0, 0);

    // splash at center of buoyancy probes only if moving at a speed
    if (this._velocity.length() <= 0) return;
    const splashPos = _objectWorld;
    splashPos.y = avgWaterHeight;
    this.water.splash(splashPos.x, splashPos.z, 2, this._velocity.lengthSq() * 10, 'world');
  }

  private _applyForces(avgWaterHeight: number, buoyancyForceY: number, torque: THREE.Vector3, dt: number) {
    const object3D = this.parent.props.object3D;
    const position = object3D.position;
    const mass = Math.max(this.density * this.volume, 1e-3);

    const displacement = avgWaterHeight - position.y;
    const clampedDisplacement = Math.min(Math.max(displacement, 0), this.volume);
    const springForce = buoyancyForceY > 0 ? buoyancyForceY : clampedDisplacement * this.volume * 9.81;
    const damping = this.dragCoefficient * this._velocity.y;

    const gravityForce = _gravityForce.copy(this.gravity).multiplyScalar(mass);
    this.dragForce.set(0, -damping, 0);
    const netForceY = springForce - damping + gravityForce.y;
    const accelerationY = netForceY / mass;

    this._velocity.y += accelerationY * dt;
    this._velocity.y = THREE.MathUtils.clamp(this._velocity.y, -20, 20);
    position.y += this._velocity.y * dt;

    const inertia = Math.max(this.volume, 1e-3);
    this._angularVelocity.addScaledVector(torque, (dt / inertia));

    const angularDamping = Math.max(0, 1 - this.angularDragCoefficient * dt);
    this._angularVelocity.multiplyScalar(angularDamping);
    this._angularVelocity.clampLength(0, Math.PI * 4);

    const angularSpeed = this._angularVelocity.length();
    if (angularSpeed > 1e-5) {
      _angularAxis.copy(this._angularVelocity).multiplyScalar(1 / angularSpeed);
      const angle = angularSpeed * dt;
      _deltaQuat.setFromAxisAngle(_angularAxis, angle);
      object3D.quaternion.multiply(_deltaQuat);
      object3D.quaternion.normalize();
    }

    object3D.updateMatrixWorld(true);
  }

  compDestroy(){  }
}