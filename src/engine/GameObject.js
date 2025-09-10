// Unique ID generator for GameObjects
export let _GO_ID = 1

// Body types (for setting up physics body)
export let GO_RIGIDBODY_FLAGS = {
  DYNAMIC: 0,
  STATIC: 1,
  KINEMATIC: 2
}

// Base class for components that can be attached to GameObjects
export class GameObjectComponent {
  constructor(parent, name) {
    this.parent = parent
    this.name = name
  }
  
  compStart() { /* component init on first frame */ }
  compUpdate(dt) { /* component update per frame */ }

  compDestroy() {
    // cleanup when component is removed or parent destroyed
    this.parent = null
  }
}

// GameObject: has optional 3D object, physics body, components, groups
export class GameObject {
  constructor(world, { name = null, groups = [], components = []} = {}) {
    this.world = world
    this.scene = world.scene
    this.id = _GO_ID++
    this.name = name ?? `obj-${this.id}`
    this.alive = true
    this.visible = true
    this.groups = new Set()
    this.object3D = null     // optional: three/enable3d object (mesh/group)
    this.body = null         // optional: enable3d rigid body handle (obj.body)
    this.dirty = false    // set true to flag body for body.needUpdate
    this.components = {}  // optional: components by name
    for (const c of components) {
      this.addComponent(c)
    }

    // join groups up-front
    for (const g of groups) this.world.addToGroup(g, this)

    world.add(this)
  }

  // --- lifecycle -------------------------------------------------------------

  /* once, on first frame after add() */ 
  start() {
    this.components && Object.values(this.components).forEach(c => c.compStart?.())
  }

  /* every frame */
  update(dt) { 
    if (this.dirty && this.body) {
      this.body.needUpdate = true
      this.dirty = false
    }
    this.components && Object.values(this.components).forEach(c => c.compUpdate?.(dt))
  }

  destroy() {
    this.alive = false
    this.components && Object.values(this.components).forEach(c => c.compDestroy?.())
    this.components = {}
    this.world.remove(this) // schedule cleanup
  }

  // override for custom cleanup
  onDestroy() {}

  // Called by World during flush
  _destroyInternal() {
    try { this.onDestroy?.() } catch (e) { console.warn(e) }

    // 1) Physics body (enable3d supports physics.destroy(body)) 
    //    (works whether you kept body separately or on object3D)
    const physics = this.scene.physics
    const body = this.body ?? this.object3D?.body
    if (physics?.destroy && body) {
      physics.destroy(body) // destroys Ammo rigid body cleanly. :contentReference[oaicite:0]{index=0}
    }

    // 2) Remove from scene + dispose geometries/materials
    if (this.object3D) {
      this.object3D.parent?.remove(this.object3D)
      this._disposeDeep(this.object3D)
      this.object3D = null
    }
  }

  _disposeDeep(obj) {
    obj.traverse?.((child) => {
      if (child.geometry?.dispose) child.geometry.dispose()
      // dispose material(s)
      const m = child.material
      if (m) {
        if (Array.isArray(m)) m.forEach(mm => mm?.dispose?.())
        else m.dispose?.()
      }
    })
  }

  // convenience helpers
  addTo(...names) { for (const n of names) this.world.addToGroup(n, this) }
  removeFrom(...names) { for (const n of names) this.world.removeFromGroup(n, this) }

  playSound(track) {
    if (this.object3D && track) {
      this.world.scene.audio.playTrackAt(this.object3D, track)
    } else {
      track?.play()
    }
  }

  addComponent(component) {
    const comp = new component(this)
    this.components[comp.name] = comp
  }

  removeComponent(name) {
    const c = this.components[name]
    if (c?.destroy) c.destroy()
    delete this.components[name]
  }
}
