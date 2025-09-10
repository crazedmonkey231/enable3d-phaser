// Phaser + @enable3d/phaser-extension starter (itch-ready)
import Phaser from "phaser";
import {
  enable3d,
  Canvas,
  THREE,
} from "@enable3d/phaser-extension";

import { GameScene } from './engine/GameScene.js'
import { ThirdPersonCharacter } from "./objects/ThirdPersonCharacter.js";
import { Crate } from './objects/Crate.js'
import { SunSky } from "./objects/SunSky.js";
import { WaterVolume } from "./objects/WaterVolume.js";



class MainScene extends GameScene {
  constructor() {
    super("MainScene");
  }

  async create() {
    await super.create();

    const { lights } = await this.third.warpSpeed('-sky', '-orbitControls', '-ground')
    this.third.scene.background = new THREE.Color(0x000000);
    this.third.camera.position.set(15, 50, -15);
    this.third.camera.lookAt(this.third.scene.position);

    // postprocessing
    // this.fx.usePixelate('pixelator')
    this.fx.useFXAA('fxaa')
    this.fx.useOutline('outline')
    this.fx.useBokeh('bokeh', { focus: 30, aperture: 0.0001, maxblur: 0.01 })
    this.fx.useToon('toon', { levels: 100 })
    this.fx.useOutput('output')
    this.fx.forceResize()

    // world
    new Crate(this.world, { x: 0, y: -4, z: 0, size: 10, color: 'green' })
    const player = new ThirdPersonCharacter(this.world, { x: 1, y: 2, z: 0 })
    new SunSky(this.world, lights)
    new WaterVolume(this.world, { x: 0, y: 0, z: 0 })

    // this.fx.setOutlineSelection([player.object3D])

  }

  update(time, delta) {
    const ts = time / 1000
    const dt = delta / 1000
    this.fx.update(ts, dt)
    this.audio.updateListener(this.third.camera)
    this.world.update(dt)
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
  scene: [MainScene],
  ...Canvas(),
};

window.addEventListener("load", () => {
  enable3d(() => new Phaser.Game(config)).withPhysics('./lib');
});
