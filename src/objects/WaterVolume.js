// WaterVolume.js
import { GameObject } from '../engine/GameObject.js'
import { THREE } from '@enable3d/phaser-extension'
import { Water } from 'three/addons/objects/Water.js'
import { alphaT } from 'three/tsl'

const base = import.meta.env.BASE_URL || './'

// 1) Two slightly different normal maps (rotate/offset the 2nd)
const loader = new THREE.TextureLoader()
const n0 = loader.load(`${base}textures/waternormals.jpg`, t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping
})
const n1 = loader.load(`${base}textures/waternormals.jpg`, t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.center.set(0.5, 0.5)
  t.rotation = Math.PI / 2
  t.offset.set(0.5, 0.25)
})

export class WaterVolume extends GameObject {
  constructor(world, { x=0, y=0, z=0, color='#4aa3ff', size=2000 } = {}) {
    super(world, { groups: ['all', 'water'] })

    // water params
    const waterParams = {
      waterColor: color,
      scale: 1.5,
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: n0,
      distortionScale: 3.75,
      alpha: 0.75,
      eye: new THREE.Vector3(0, 0, 0)
    }

    // 2) Create Water2
    const geo = new THREE.PlaneGeometry(size, size)
    const water = new Water(geo, waterParams)

    // orient & place
    water.rotation.x = -Math.PI / 2
    water.position.set(x, y, z)

    world.scene.add(water)

    this.object3D = water
    this.body = null

    this.flowSpeed = 0.3
  }

  // Optional: micro-animation if you want a touch more life
  update(dt) {
    if(this.object3D) this.object3D.material.uniforms.time.value += dt * this.flowSpeed
  }
}