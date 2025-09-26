// Camera Component, a simple camera controller
import { THREE } from "@enable3d/phaser-extension";
import { GameObject, GameObjectComponent, ICompProps } from '../engine/GameObject';

export interface ICompCameraProps extends ICompProps {
  offset?: { x: number; y: number; z: number };
  sensitivity?: number;
  slerpSpeed?: number;
  lerpSpeed?: number;
  fov?: number;
}

export class CompCamera extends GameObjectComponent {  
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  constructor(gameObject: GameObject, props: ICompCameraProps) {
    super(gameObject, props);
    this.camera = this.parent.props.gameScene.third.camera;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.fov = props.fov || 75;
      this.camera.updateProjectionMatrix();
    }
  }
  compStart(): void {
    // on mouse move, move camera
    this.parent.props.gameScene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.parent.alive) return;
      const p = this.props as ICompCameraProps;
      const cam = this.camera;
      const mouse = this.parent.props.gameScene.input.mousePointer;
      const moveEvent: any = mouse.event;
      // look direction
      const sensitivity = p.sensitivity || 0.002;
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(cam.quaternion);
      euler.y -= moveEvent.movementX * sensitivity;
      euler.x -= moveEvent.movementY * sensitivity;
      euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
      //smoothly interpolate to new rotation
      const targetQuat = new THREE.Quaternion().setFromEuler(euler);
      const slerpSpeed = p.slerpSpeed || 0.9;
      cam.quaternion.slerp(targetQuat, slerpSpeed);
      const root = this.parent.props.object3D;
      root.rotation.y = euler.y;  // rotate the player body (y axis only
    });
  }

  compUpdate(dt: number): void {
    if (!this.parent.alive) return;
    const p = this.props as ICompCameraProps;
    const root = this.parent.props.object3D;
    const cam = this.camera;
    const lerpSpeed = p.lerpSpeed || 0.9;
    if (!cam) return;
    // offset, lerp to position
    if (p.offset) {
      const targetPos = new THREE.Vector3(p.offset.x, p.offset.y, p.offset.z);
      targetPos.applyQuaternion(root.quaternion);
      targetPos.add(root.position);
      cam.position.lerp(targetPos, lerpSpeed);
    } else {
      cam.position.lerp(root.position, lerpSpeed);
    }
  }
}