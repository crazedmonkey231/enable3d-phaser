// Minimal object manager w/ groups + safe add/remove + dt handling
import * as THREE from 'three'

// iterate a group
// this.world.each('crates', (obj) => {
//   // e.g., highlight nearby props
//   obj.object3D?.material?.emissive?.set?.(0x222222)
// })

// body-wide
// c1.body.on.collision((collided, evt) => {
//   if (evt === 'start') {
//     // hit something that's not the ground
//     console.log('crates collided', collided);
//   }
// })

// pair-specific
// this.third.physics.add.collider(c1.object3D, c2.object3D, (event) => {
//   if (event === 'start'){
//     console.log('crate ↔ another started')
//   }
// })

/**
 * The World class manages game objects, groups, and collision detection within a 3D scene.
 * It provides methods for adding/removing objects, grouping, updating, and collision queries.
 * 
 * @class
 * @example
 * const world = new World(scene);
 * world.add(gameObject);
 * world.update();
 */
export class World {
  constructor(scene) {
    // Phaser scene handles
    this.scene3D = scene
    this.input = scene.input
    this.keyboard = scene.input.keyboard
    this.events = scene.events
    this.scale = scene.scale

    // enable3d handles
    const third = scene.third
    this.third = third
    this.composer = third.composer
    this.renderer = third.renderer
    this.scene = third.scene
    this.camera = third.camera
    this.physics = third.physics
    this.environment = third.environment

    // game object management
    this.objects = new Set()
    this.groups = new Map()    // name -> Set<GameObject>
    this.toAdd = []
    this.toRemove = new Set()
    this.clock = new THREE.Clock()
  }

  add(obj) {
    this.toAdd.push(obj)
  }

  remove(obj) {
    this.toRemove.add(obj)
  }

  getGroup(name) {
    if (!this.groups.has(name)) this.groups.set(name, new Set())
    return this.groups.get(name)
  }

  addToGroup(name, obj) {
    this.getGroup(name).add(obj)
    obj.groups.add(name)
  }

  removeFromGroup(name, obj) {
    const g = this.groups.get(name)
    if (g) g.delete(obj)
    obj.groups.delete(name)
  }

  each(name, fn) {
    const g = this.groups.get(name)
    if (!g) return
    for (const obj of g) if (obj.alive) fn(obj)
  }

  // dtSec is optional; if omitted we use an internal THREE.Clock
  update(dtSec) {
    const dt = (typeof dtSec === 'number') ? dtSec : this.clock.getDelta()

    // flush adds
    if (this.toAdd.length) {
      for (const obj of this.toAdd) {
        this.objects.add(obj)
        if (!obj._started) { obj._started = true; obj.start?.() }
      }
      this.toAdd.length = 0
    }

    // update all
    for (const obj of this.objects) {
      if (!obj.alive) { this.toRemove.add(obj); continue }
      obj.update?.(dt)
    }

    // flush removes
    if (this.toRemove.size) {
      for (const obj of this.toRemove) {
        obj._destroyInternal?.()
        this.objects.delete(obj)
        for (const name of obj.groups) this.removeFromGroup(name, obj)
      }
      this.toRemove.clear()
    }
  }

  clear() {
    for (const obj of this.objects) obj.destroy()
    this.update(0) // flush
  }

  _boxFor(obj, padding = 0) {
    const o = obj?.object3D
    if (!o) return null
    const box = new THREE.Box3().setFromObject(o)
    if (!box.isEmpty()) box.expandByScalar(padding)
    return box
  }

  _sphereFor(obj, padding = 0) {
    const o = obj?.object3D
    if (!o) return null
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return null
    const s = new THREE.Sphere()
    box.getBoundingSphere(s)
    s.radius += padding
    return s
  }

  _intersects(a, b, { mode = 'box', padding = 0, collided = null } = {}) {
    // Custom callback wins (like pygame.sprite.spritecollide(..., collided=...))
    if (typeof collided === 'function') return !!collided(a, b)

    if (mode === 'sphere') {
      const sa = this._sphereFor(a, padding)
      const sb = this._sphereFor(b, padding)
      return !!(sa && sb && sa.intersectsSphere(sb))
    } else {
      const ba = this._boxFor(a, padding)
      const bb = this._boxFor(b, padding)
      return !!(ba && bb && ba.intersectsBox(bb))
    }
  }

  /**
   * Like pygame.sprite.spritecollide
   * @param {GameObject} sprite
   * @param {string} groupName
   * @param {object} opts { dokill=false, mode='box'|'sphere', padding=0, collided?: (a,b)=>boolean }
   * @returns {GameObject[]} collided objects from the group
   */
  spriteCollide(sprite, groupName, opts = {}) {
    const g = this.groups.get(groupName)
    if (!g || !sprite?.alive) return []

    const results = []
    // Snapshot the group to avoid iterator invalidation if we destroy inside loop
    const candidates = Array.from(g)
    for (const other of candidates) {
      if (!other?.alive || other === sprite) continue
      if (this._intersects(sprite, other, opts)) {
        results.push(other)
        if (opts.dokill) other.destroy()
      }
    }
    return results
  }

  /**
   * Like pygame.sprite.groupcollide
   * @param {string} groupA
   * @param {string} groupB
   * @param {object} opts { dokillA=false, dokillB=false, mode='box'|'sphere', padding=0, collided?: (a,b)=>boolean }
   * @returns {Map<GameObject, GameObject[]>} map of A -> list of collided Bs
   */
  groupCollide(groupA, groupB, opts = {}) {
    const GA = this.groups.get(groupA)
    const GB = this.groups.get(groupB)
    const out = new Map()
    if (!GA || !GB) return out

    const as = Array.from(GA)
    const bs = Array.from(GB)

    for (const a of as) {
      if (!a?.alive) continue
      let list = null
      for (const b of bs) {
        if (!b?.alive || a === b) continue
        if (this._intersects(a, b, opts)) {
          if (!list) list = []
          list.push(b)
          if (opts.dokillB) b.destroy()
        }
      }
      if (list && list.length) {
        out.set(a, list)
        if (opts.dokillA) a.destroy()
      }
    }
    return out
  }

  /**
   * Convenience: return any single collide or null
   */
  spriteCollideAny(sprite, groupName, opts = {}) {
    const g = this.groups.get(groupName)
    if (!g || !sprite?.alive) return null
    for (const other of g) {
      if (!other?.alive || other === sprite) continue
      if (this._intersects(sprite, other, opts)) return other
    }
    return null
  }
}
