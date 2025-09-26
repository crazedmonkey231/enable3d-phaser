// Phaser + @enable3d/phaser-extension starter (itch-ready)
import Phaser from "phaser";
import {
  enable3d,
  Canvas,
  THREE,
} from "@enable3d/phaser-extension";
import { GameScene } from './engine/GameScene.js'
import { GameObjectFactory } from './engine/GameObject.js'
import { CompWeather } from "./components/CompWeather.js";
import { loadImages, getBox } from "./engine/Utils.js";
import { Widget } from "./engine/Widget.js";

class MainScene extends GameScene {
  constructor() {
    super("MainScene");
  }

  preload() {
    loadImages(this, ['ball.png']);
  }

  async create() {
    const { lights } = await this.third.warpSpeed('-sky');
    this.third.scene.background = new THREE.Color(0x000000);
    this.third.camera.position.set(10, 10, 10);
    this.third.camera.lookAt(this.third.scene.position);

    // postprocessing
    // this.fx.usePixelate('pixelator')
    this.fx.useFXAA('fxaa')
    // this.fx.useOutline('outline')
    // this.fx.useBokeh('bokeh', { focus: 30, aperture: 0.0001, maxblur: 0.01 })
    this.fx.useToon('toon', { levels: 10 })
    this.fx.useOutput('output')
    this.fx.forceResize()

    this.third.physics.debug.enable()

    const ball = new Widget(this, { 
      texture: 'ball', 
      x: 100, 
      y: 100, 
      scale: [0.1, 0.1], 
      onHover: () => this.tweens.add({ targets: ball.image, scaleX: 0.12, scaleY: 0.12, duration: 100, ease: this.tweensEasing.sineEaseInOut }),
      onOut: () => this.tweens.add({ targets: ball.image, scaleX: 0.1, scaleY: 0.1, duration: 100, ease: this.tweensEasing.sineEaseInOut }),
      onClick: () => this.tweens.add({ 
        targets: ball.image, 
        rotation: Math.PI * 2, 
        duration: 500, 
        ease: this.tweensEasing.sineEaseInOut, 
        onStart: () => console.log('click!'),
        onComplete: () => {
          this.shutdown();
          this.scene.transition({ 
            target: 'SecondScene', 
            duration: 1,
            onStart: () => {
            },
          })
        }
      }),
    });

    // this.water = GameObjectFactory.create(this, { 
    //   name: 'Water',
    //   position: { x: 0, y: 0, z: 0 },
    //   groups: ['water'],
    //   components: new Map([[CompWaterPBR, {
    //     position: { x: 0, y: 3, z: 0 },
    //     sizeX: 128,
    //     sizeY: 128,
    //     simW: 256,
    //     simH: 256,
    //     rotationX: -Math.PI/2,
    //     displacementScale: 1,
    //     mouseSize: 20,
    //     viscosity: 0.01,
    //     color: 'skyblue',
    //     roughness: 0.3,
    //     metalness: 0,   
    //     foamTint: new THREE.Color('white'),
    //     foamGlow: 5,  
    //     foamThreshold: 0.1,
    //     foamSharpness: 5,
    //     foamIntensity: 5,
    //     splashAtMouseDemo: true,
    //     waveAtMouseDemo: false,
    //   }]])
    // });
  
    GameObjectFactory.create(this, {
      name: 'Sky',
      position: { x: 0, y: 0, z: 0 },
      groups: ['sky'], 
      components: new Map([
        [CompWeather, { lights, dayLength: 30, nightLength: 10, weatherType: 'clear', startTime: .65, active: false }]
      ])
    });

    // GameObjectFactory.create(this, { 
    //   object3D: getBox(2, 0x000000), 
    //   position: { x: 2, y: 8, z: 0 },
    //   groups: ['cubes'], 
    //   components: new Map([
    //     [CompBuoyancy, { water: this.water.components.entries().next().value[0], probes: [new THREE.Vector3(0, 0, 5), new THREE.Vector3(5, 0, 0), new THREE.Vector3(-5, 0, 0), new THREE.Vector3(0, 0, -5)] }]
    //   ]),
    //   physicsConfig: { 
    //     mass: 1, 
    //     collisionFlags: 2,
    //     breakable: false,
    //   } 
    // });

    // GameObjectFactory.create(this, { 
    //   object3D: getBox(2, 0x000000), 
    //   position: { x: 0, y: 0, z: 0 },
    //   groups: ['cubes'], 
    //   components: new Map([
    //     [CompVoxelChunk, {chunkSize: 16, chunkCount: 4, voxelSize: 1, material: new THREE.MeshStandardMaterial({ color: 0xffffff })}]
    //   ]),
    //   physicsConfig: { 
    //     mass: 1, 
    //     collisionFlags: 1,
    //     breakable: false,
    //   } 
    // });

    // GameObjectFactory.create(this, { 
    //   object3D: getBox(2, 0x000000), 
    //   position: { x: 0, y: 0, z: 0 },
    //   groups: ['cubes'], 
    //   components: new Map([
    //     [CompVoxelWorld, { size: new THREE.Vector3(24, 24, 24) }]
    //   ]),
    //   physicsConfig: { 
    //     mass: 1, 
    //     collisionFlags: 1,
    //     breakable: false,
    //   } 
    // });

    // const demoCube =GameObjectFactory.create(this, { 
    //   object3D: getBox(2, 0xffff00), 
    //   position: { x: 3, y: 25, z: 0 },
    //   groups: ['cubes'], 
    //   physicsConfig: { 
    //     mass: 1, 
    //     collisionFlags: 0, 
    //     breakable: true, 
    //     fractureImpulse: 1
        
    //   } 
    // });

    GameObjectFactory.create(this, { 
      object3D: getBox(2, 0xffff00), 
      position: { x: 0, y: 35, z: 0 },
      groups: ['cubes'], 
      physicsConfig: { 
        mass: 10, 
        collisionFlags: 0, 
        breakable: true, 
        fractureImpulse: 10 
      } 
    });

    // GameObjectFactory.createFromModelVrm(this, { model: 'character1', scale: 2 }, {
    //   name: 'Player',
    //   position: { x: 3, y: 2, z: 0 },
    //   groups: ['characters', 'player'],
    //   physicsConfig: { 
    //     mass: 1, 
    //     collisionFlags: 2
    //   },
    //   components: new Map([
    //     // [CompCamera, { offset: { x: 0, y: 1.3, z: -0.3 }, sensitivity: 0.002 }],
    //     [CompMovement, { speed: 5, jumpForce: 6, flySpeed: 10 }],
    //   ])
    // });
  }
}

class SecondScene extends GameScene {
  constructor() {
    super("SecondScene");
  }

  preload() {
    // loadImages(this, ['ball.png']);
  }

  async create() {
    const { lights } = await this.third.warpSpeed();
    this.third.scene.background = new THREE.Color(0x000000);
    this.third.camera.position.set(10, 10, 10);
    this.third.camera.lookAt(this.third.scene.position);

    // postprocessing
    // this.fx.usePixelate('pixelator')
    this.fx.useFXAA('fxaa')
    // this.fx.useOutline('outline')
    this.fx.useBokeh('bokeh', { focus: 30, aperture: 0.0001, maxblur: 0.01 })
    this.fx.useToon('toon', { levels: 100 })
    this.fx.useOutput('output')
    this.fx.forceResize()

    this.third.physics.debug.enable()

    const ball = new Widget(this, { 
      texture: 'ball', 
      x: 100, 
      y: 100, 
      scale: [0.1, 0.1], 
      onHover: () => this.tweens.add({ targets: ball.image, scaleX: 0.12, scaleY: 0.12, duration: 100, ease: this.tweensEasing.sineEaseInOut }),
      onOut: () => this.tweens.add({ targets: ball.image, scaleX: 0.1, scaleY: 0.1, duration: 100, ease: this.tweensEasing.sineEaseInOut }),
      onClick: () => this.tweens.add({ 
        targets: ball.image, 
        rotation: Math.PI * 2, 
        duration: 500, 
        ease: this.tweensEasing.sineEaseInOut, 
        onComplete: () => {
          this.shutdown();
          this.scene.transition({ 
          target: 'MainScene', 
          duration: 1 
          })
        }
      }),
    });
  }
}

const config = {
  type: Phaser.WEBGL,
  transparent: true,
  parent: "app",
  version: '0.0.1',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth * Math.max(1, window.devicePixelRatio / 2),
    height: window.innerHeight * Math.max(1, window.devicePixelRatio / 2),
  },
  fps: {
    min: 60, 
    target: 75, 
    forceSetTimeOut: true,
    smoothstep: true
  },
  render: { 
    antialias: true, 
    antialiasGL: true,
  },
  scene: [MainScene, SecondScene],
  ...Canvas(),
};

window.addEventListener("load", () => {
  enable3d(() => new Phaser.Game(config)).withPhysics('./lib');
});




