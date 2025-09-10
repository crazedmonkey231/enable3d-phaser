// src/objects/Crate.js
import { GameObject, _GO_BODY_FLAGS} from '../engine/GameObject.js'
import { THREE } from "@enable3d/phaser-extension";

export class Player extends GameObject {
  constructor(world, { x=0, y=0, z=0, size=1, color='blue'} = {}) {
    super(world, { groups: ['all', 'players'] })
    this.camera = world.scene.third.camera
    // create with physics
    const mesh = world.scene.third.physics.add.box(
      { x, y, z, width: size, height: size, depth: size, mass: 1, collisionFlags: _GO_BODY_FLAGS.KINEMATIC},
      { lambert: { color: color, emissive: 0xaaaaff, emissiveIntensity: 0.5} }
    )
    this.object3D = mesh
    this.body = mesh.body
    this.keys = {
      a: this.world.keyboard.addKey('a'),
      w: this.world.keyboard.addKey('w'),
      d: this.world.keyboard.addKey('d'),
      s: this.world.keyboard.addKey('s'),
      space: this.world.keyboard.addKey(32)
    }
    this.speed = 10
  }

  update(dt) {
    super.update(dt)
    this.camera.position.lerp(new THREE.Vector3(
      this.object3D.position.x,
      this.object3D.position.y + 15,
      this.object3D.position.z - 15
    ), 0.01)
    this.camera.lookAt(this.object3D.position)

    if (this.keys.w.isDown) {
      const rotation = this.object3D.getWorldDirection(
        new THREE.Vector3()?.setFromEuler?.(this.object3D.rotation) || this.object3D.rotation.toVector3()
      )
        const theta = Math.atan2(rotation.x, rotation.z)

        const x = Math.sin(theta) * this.speed,
          y = this.body.velocity.y,
          z = Math.cos(theta) * this.speed
        this.object3D.position.x += x * dt
        this.object3D.position.y += y * dt
        this.object3D.position.z += z * dt
      }

    if (this.keys.a.isDown) this.object3D.rotation.y += 0.03
    else if (this.keys.d.isDown) this.object3D.rotation.y -= 0.03

    this.dirty = true  // mark body for update

    const g = this.world.spriteCollide(this, 'crates', {
      dokill: false
    })
    if (g.length) {
      for (const go of g) {
        if (go.components.HealthComponent) {
          go.components.HealthComponent.damage(999)
        }
      }
    }
  }

  onDestroy() {
    // any extra cleanup or particle/sound trigger
  }
}