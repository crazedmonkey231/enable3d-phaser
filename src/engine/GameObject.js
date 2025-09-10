// Unique ID generator for GameObjects
export let _GO_ID = 1


/**
 * Enum for Rigidbody flags.
 * @readonly
 * @enum {number}
 * @property {number} DYNAMIC - Indicates a dynamic rigidbody that is affected by physics and can move.
 * @property {number} STATIC - Indicates a static rigidbody that does not move and is not affected by physics.
 * @property {number} KINEMATIC - Indicates a kinematic rigidbody that is moved by code but not affected by physics forces.
 */
export let GO_RIGIDBODY_FLAGS = {
  DYNAMIC: 0,
  STATIC: 1,
  KINEMATIC: 2
}

/**
 * Represents a component that can be attached to a game object.
 * Components encapsulate logic and behavior that can be added to game objects.
 *
 * @class
 * @param {Object} parent - The parent game object to which this component is attached.
 * @param {string} name - The name of the component.
 */
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

/**
 * Represents a game object within the world, supporting components, groups, and optional 3D/physics integration.
 *
 * @class
 * @param {object} world - The world instance this object belongs to.
 * @param {object} [options] - Optional parameters.
 * @param {string|null} [options.name=null] - Name of the object. If not provided, a unique name is generated.
 * @param {Array<string>} [options.groups=[]] - Initial group names to add this object to.
 * @param {Array<Function>} [options.components=[]] - Component constructors to attach to this object.
 *
 * @property {object} world - Reference to the world instance.
 * @property {object} scene - Reference to the scene (from world).
 * @property {number} id - Unique identifier for the object.
 * @property {string} name - Name of the object.
 * @property {boolean} alive - Whether the object is alive.
 * @property {boolean} visible - Whether the object is visible.
 * @property {Set<string>} groups - Set of group names this object belongs to.
 * @property {object|null} object3D - Optional 3D object (e.g., THREE.Object3D).
 * @property {object|null} body - Optional physics body.
 * @property {boolean} dirty - Flag indicating if the physics body needs an update.
 * @property {object} components - Map of component instances by name.
 *
 * @method start - Called once on the first frame after being added to the world.
 * @method update - Called every frame; updates components and physics state.
 * @method destroy - Marks the object as dead and schedules cleanup.
 * @method onDestroy - Override for custom cleanup logic.
 * @method _destroyInternal - Internal cleanup called by the world.
 * @method _disposeDeep - Recursively disposes geometries and materials.
 * @method addTo - Adds the object to one or more groups.
 * @method removeFrom - Removes the object from one or more groups.
 * @method playSound - Plays a sound at the object's position or directly.
 * @method addComponent - Adds a component to the object.
 * @method removeComponent - Removes a component from the object by name.
 */
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
