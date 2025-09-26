// Movement Component, a simple first-person movement controller

// - WASD to move
// - space to jump
// - shift to toggle fly mode (no gravity, free vertical movement with E/Q keys)
import { THREE } from "@enable3d/phaser-extension";
import { GameObject, GameObjectComponent, ICompProps } from '../engine/GameObject';

export interface ICompMovementProps extends ICompProps {
  speed?: number;
  canJump?: boolean;
  jumpForce?: number;
  canFly?: boolean;
  isFlying?: boolean;
  flySpeed?: number;
  isFalling?: boolean;
  gravity?: number;
}

export class CompMovement extends GameObjectComponent {
  private speed: number;
  private canJump: boolean;
  private jumpForce: number;
  private flySpeed: number;
  private canFly: boolean;
  private isFlying: boolean;
  private isFalling: boolean;
  private gravity: number;
  private keys: Phaser.Input.Keyboard.KeyboardPlugin;
  private keyW: Phaser.Input.Keyboard.Key;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyS: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private keyE: Phaser.Input.Keyboard.Key;
  private keyQ: Phaser.Input.Keyboard.Key;
  private keyUp: Phaser.Input.Keyboard.Key;
  private keyDown: Phaser.Input.Keyboard.Key;
  private keyLeft: Phaser.Input.Keyboard.Key;
  private keyRight: Phaser.Input.Keyboard.Key;
  constructor(gameObject: GameObject, props: ICompMovementProps) {
    super(gameObject, props);
    this.speed = props.speed || 5;
    this.canJump = props.canJump || false;
    this.jumpForce = props.jumpForce || 10;
    this.canFly = props.canFly || false;
    this.flySpeed = props.flySpeed || 5;
    this.isFlying = props.isFlying || false;
    this.isFalling = props.isFalling || false;
    this.gravity = props.gravity || 9.81;
    this.keys = this.parent.props.gameScene.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    this.keyW = this.keys.addKey('W');
    this.keyA = this.keys.addKey('A');
    this.keyS = this.keys.addKey('S');
    this.keyD = this.keys.addKey('D');
    this.keyE = this.keys.addKey('E');
    this.keyQ = this.keys.addKey('Q');
    this.keyUp = this.keys.addKey('UP');
    this.keyDown = this.keys.addKey('DOWN');
    this.keyLeft = this.keys.addKey('LEFT');
    this.keyRight = this.keys.addKey('RIGHT');
  }

  compStart(): void {
    this.parent.props.gameScene.input.keyboard?.on('keydown-E', () => {
      this.parent.props.object3D.animation.play('Interact');
    });
    this.parent.props.gameScene.input.keyboard?.on('keydown-SPACE', () => {
      this.jump();
    });
    if (this.canFly) {
      this.parent.props.gameScene.input.keyboard?.on('keydown-SHIFT', () => {
        this.toggleFly();
      });
    }
  }

  compUpdate(dt: number): void {
    const keys = this.parent.props.gameScene.input.keyboard;
    if (this.isFlying) {
      if (this.keyE.isDown) {
        this.parent.props.object3D.position.y += this.flySpeed * dt;
      }
      if (this.keyQ.isDown) {
        this.parent.props.object3D.position.y -= this.flySpeed * dt;
      }
    }
    if (this.keyW.isDown || this.keyUp.isDown) {
      this.moveForward(dt);
    }
    if (this.keyS.isDown || this.keyDown.isDown) {
      this.moveBackward(dt);
    }
    if (this.keyA.isDown || this.keyLeft.isDown) {
      this.moveLeft(dt);
    }
    if (this.keyD.isDown || this.keyRight.isDown) {
      this.moveRight(dt);
    }
    // simple gravity
    if (!this.isFlying && this.isFalling) {
      this.parent.props.object3D.position.y -= this.gravity * dt; // gravity
    }
  }

  compSetProperties(props: ICompMovementProps): void {
      this.canJump = props.canJump ?? this.canJump;
      this.canFly = props.canFly ?? this.canFly;
      this.isFlying = props.isFlying ?? this.isFlying;
      this.speed = props.speed ?? this.speed;
      this.jumpForce = props.jumpForce ?? this.jumpForce;
      this.flySpeed = props.flySpeed ?? this.flySpeed;
      this.gravity = props.gravity ?? this.gravity;
      this.isFalling = props.isFalling ?? this.isFalling;
  }

  private moveForward(dt: number): void {
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(this.parent.props.object3D.quaternion);
    this.parent.props.object3D.position.add(direction.multiplyScalar(this.speed * dt));
  }

  private moveBackward(dt: number): void {
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyQuaternion(this.parent.props.object3D.quaternion);
    this.parent.props.object3D.position.add(direction.multiplyScalar(this.speed * dt));
  }

  private moveLeft(dt: number): void {
    const direction = new THREE.Vector3(-1, 0, 0);
    direction.applyQuaternion(this.parent.props.object3D.quaternion);
    this.parent.props.object3D.position.add(direction.multiplyScalar(this.speed * dt));
  }

  private moveRight(dt: number): void {
    const direction = new THREE.Vector3(1, 0, 0);
    direction.applyQuaternion(this.parent.props.object3D.quaternion);
    this.parent.props.object3D.position.add(direction.multiplyScalar(this.speed * dt));
  }

  private jump(): void {
    if (this.canJump) {
      this.parent.props.object3D.position.y += this.jumpForce;
      this.canJump = false;
      this.isFalling = true;
    }
  }

  private toggleFly(): void {
    this.isFlying = !this.isFlying;
  }
}