import { Scene3D } from "@enable3d/phaser-extension";
import { AudioManager } from './AudioManager.js'
import { PostFXManager } from './PostFxManager.js'
import { World } from './World.js'

// Base scene class to extend from
export class GameScene extends Scene3D {
  constructor(sceneName) {
    super({ key: sceneName });
  }

  init() {
    this.accessThirdDimension();
  }

  async create() {
    this.world = new World(this);  // our custom world manager
    this.audio = new AudioManager(this);  // our custom audio manager
    this.fx = new PostFXManager(this);  // our custom postprocessing manager
  }

  update(time, delta) {
    const ts = time / 1000;
    const dt = delta / 1000;
    this.fx.update(ts, dt);
    this.audio.updateListener(this.third.camera);
    this.world.update(dt);
  }
}