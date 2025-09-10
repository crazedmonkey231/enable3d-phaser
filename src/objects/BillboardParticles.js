import { GameObject, GO_RIGIDBODY_FLAGS} from '../engine/GameObject.js'
import { THREE } from "@enable3d/phaser-extension";

export class BillboardParticles extends GameObject {
  constructor(world, { x=0, y=2, z=0, size=0.5, color='yellow', amount=10} = {}) {
    super(world, { groups: ['all', 'particles'] })

    const geometry = new THREE.BufferGeometry();
    const vertices = [];

    const sprite = new THREE.TextureLoader().load( './textures/sprites/disc.png' );
    sprite.colorSpace = THREE.SRGBColorSpace;

    for ( let i = 0; i < amount; i ++ ) {

      const dx = ( Math.random() * 2 - 1 );
      const dy = ( Math.random() * 2 - 1 );
      const dz = ( Math.random() * 2 - 1 );

      vertices.push( dx, dy, dz );
    }

    geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );

    const material = new THREE.PointsMaterial( { size: size, sizeAttenuation: true, map: sprite, alphaTest: 0.5, transparent: true } );
    material.color.setColorName( color );

    const particles = new THREE.Points( geometry, material );

    this.object3D = particles
    this.object3D.position.set(x, y, z)
    this.body = null
    world.scene.third.scene.add(this.object3D)
  }

  update(dt) {
    super.update(dt)
    this.object3D.scale.multiplyScalar(1.02)
    if (this.object3D.scale.x > 5) this.destroy()
    this.object3D.material.opacity *= 0.99
    if (this.object3D.material.opacity < 0.01) this.destroy()
    this.object3D.position.y += 0.01
  }
}