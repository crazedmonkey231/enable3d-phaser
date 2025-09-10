// src/objects/Crate.js
import { HealthComponent } from '../components/HealthComponent.js'
import { GameObject, GO_RIGIDBODY_FLAGS} from '../engine/GameObject.js'
import { ToonMaterial1 } from '../engine/material/ToonMaterial.js'
import { BillboardParticles } from './BillboardParticles.js'

export class Crate extends GameObject {
  constructor(world, { x=0, y=2, z=0, size=1, color='blue'} = {}) {
    super(world, { groups: ['all', 'crates'], components: [ HealthComponent ]})
    // create with physics
    const mesh = world.scene.third.physics.add.box(
      { x, y, z, width: size, height: size, depth: size, mass: 1, collisionFlags: GO_RIGIDBODY_FLAGS.KINEMATIC, castShadow: true },
      { lambert: { color: color, emissive: 0xaaaaff, emissiveIntensity: 0 } }
    )
    this.y = y
    this.object3D = mesh
    this.body = mesh.body
  }

  update(dt) {
    super.update(dt)
    // idle animation (purely visual)
    // this.object3D.rotation.y += 0.02
    // this.object3D.position.y = this.y + Math.sin(Date.now() * 0.006) * 0.25
    this.dirty = true  // mark body for update
  }

  onDestroy() {
    // any extra cleanup or particle/sound trigger
    new BillboardParticles(this.world, { x: this.object3D.position.x, y: this.object3D.position.y, z: this.object3D.position.z })
  }
}
