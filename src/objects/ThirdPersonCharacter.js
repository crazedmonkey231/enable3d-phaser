// src/objects/Crate.js
import { GameObject, GO_RIGIDBODY_FLAGS} from '../engine/GameObject.js'
import { THREE } from "@enable3d/phaser-extension";
import { HealthComponent } from '../components/HealthComponent.js'

export class ThirdPersonCharacter extends GameObject {
  constructor(world, { x=0, y=0, z=0, height=1, color='blue'} = {}) {
    super(world, { groups: ['all', 'players'], components: [ HealthComponent ]})
    this.camera = world.scene.third.camera

    // create with physics
    const mesh = world.scene.third.physics.add.capsule(
      { x, y, z, radius: height / 2, height, mass: 1, collisionFlags: GO_RIGIDBODY_FLAGS.KINEMATIC },
      { lambert: { color: color, emissive: 0xaaaaff, emissiveIntensity: 0} }
    )
    this.object3D = mesh
    this.body = mesh.body

    this.keys = {
      a: this.world.scene.input.keyboard.addKey('a'),
      w: this.world.scene.input.keyboard.addKey('w'),
      d: this.world.scene.input.keyboard.addKey('d'),
      s: this.world.scene.input.keyboard.addKey('s'),
      space: this.world.scene.input.keyboard.addKey(32)
    }

    // Over-the-shoulder camera offset (right-handed, z forward)
    this.cameraOffset = new THREE.Vector3(-3, 2, -10) // (x: right, y: up, z: back)
    this.cameraTarget = new THREE.Vector3()
    this.cameraLerpSpeed = 0.05

    this.speed = 10
    this.acceleration = 40
    this.deceleration = 15
    this.velocity = new THREE.Vector3(0, 0, 0)
    this.isJumping = false
    this.canJump = true
    this.jumpSpeed = 5
    this.moveDir = 0
  }

  jump() {
    if (!this.object3D) return
    this.canJump = false
    this.isJumping = true
    this.velocity.y = this.jumpSpeed
  }

  update(dt) {
    super.update(dt)

    // --- Character jumping ---
    // Raycast down to check if on ground
    const raycaster = new THREE.Raycaster()
    raycaster.set(this.object3D.position, new THREE.Vector3(0, -1, 0))
    const gameObjects = Array.from(this.world.objects).map(obj => obj.object3D).filter(obj => obj !== this.object3D)
    const intersects = raycaster.intersectObjects(gameObjects, true)
    if (intersects.length > 0 && intersects[0].distance < 1) {
      const groundY = intersects[0].point.y
      if (this.object3D.position.y > groundY) {
        this.object3D.position.y = groundY + 1 // Adjust for character height
        this.isJumping = false
        this.velocity.y = 0
        this.canJump = true
      }
    } else {
      // Only apply gravity to y velocity
      this.velocity.y += -9.8 * dt // gravity
      this.isJumping = true
    }

    // --- Character movement (velocity-based, only x/z) ---
    // Apply friction
    if (this.isJumping) this.moveDir *= 0.975
    else this.moveDir *= 0.925

    // Handle input
    if (this.keys.w.isDown) this.moveDir = 1
    if (this.keys.s.isDown) this.moveDir = -1
    const moveDir = this.moveDir

    // Turn left/right
    if (this.keys.a.isDown) this.object3D.rotation.y += 0.035
    else if (this.keys.d.isDown) this.object3D.rotation.y -= 0.035

    // Calculate desired velocity (x/z only)
    let desiredVel = new THREE.Vector3(0, 0, 0)
    if (moveDir !== 0) {
      desiredVel.set(0, 0, moveDir * this.speed)
      desiredVel.applyEuler(this.object3D.rotation)
    }

    // Smooth velocity (acceleration/deceleration) for x/z only
    const toDesired = desiredVel.clone().setY(0).sub(this.velocity.clone().setY(0))
    const accel = (moveDir !== 0 ? this.acceleration : this.deceleration) * dt
    if (toDesired.length() > accel) {
      toDesired.setLength(accel)
    }
    this.velocity.x += toDesired.x
    this.velocity.z += toDesired.z

    // Apply velocity to position
    this.object3D.position.addScaledVector(this.velocity, dt)

    // Dampen velocity if not moving (x/z only)
    if (moveDir === 0 && (this.velocity.x !== 0 || this.velocity.z !== 0)) {
      const velXZ = new THREE.Vector2(this.velocity.x, this.velocity.z)
      const damp = Math.max(velXZ.length() - this.deceleration * dt, 0)
      if (velXZ.length() > 0) {
        velXZ.setLength(damp)
        this.velocity.x = velXZ.x
        this.velocity.z = velXZ.y
      }
    }

    // Jump
    if (this.keys.space.isDown && this.canJump) this.jump()

    // --- Camera follow (over-the-shoulder) ---
    // Camera target: upper back/shoulder, not above head
    this.cameraTarget.copy(this.object3D.position)
    this.cameraTarget.y -= 0.2 // lower than before, closer to shoulder/upper back
    this.cameraTarget.x += 3 * Math.sin(this.object3D.rotation.y) // slight right offset
    this.cameraTarget.z += 3 * Math.cos(this.object3D.rotation.y) // slight forward offset

    // Optionally, shift slightly forward for a more cinematic angle
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(this.object3D.rotation).multiplyScalar(0.3)
    this.cameraTarget.add(forward)

    // Offset: behind and to the right of character, relative to facing direction
    const offset = this.cameraOffset.clone().applyEuler(this.object3D.rotation)
    const desiredCamPos = this.cameraTarget.clone().add(offset)

    // Smooth camera movement
    this.camera.position.lerp(desiredCamPos, this.cameraLerpSpeed)

    // look at forward and slightly above character
    const lookAt = new THREE.Vector3().copy(this.cameraTarget)
    lookAt.x += 0.5 // look slightly forward
    lookAt.y += 2 // look slightly above
    lookAt.z += 0.5 // look slightly to the right
    this.camera.lookAt(lookAt)

    this.dirty = true  // mark body for update

    
  }

  onDestroy() {
    // any extra cleanup or particle/sound trigger
  }
}