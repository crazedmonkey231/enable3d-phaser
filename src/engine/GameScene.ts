import { Scene3D, THREE } from "@enable3d/phaser-extension";
import { PostFXManager } from './PostFxManager.js'
import { GameObject, ICompProps, GameObjectComponent, GameObjectFactory } from "./GameObject.js";
import { updateListener } from './AudioManager.js';
import { tweensEasing } from "./Utils.js";

/**
 * Represents the main game scene, extending Scene3D to provide 3D capabilities.
 * Manages the world, audio, and post-processing effects. Also handles game objects and their lifecycle within the scene.
 *
 * @extends Scene3D
 */
export class GameScene extends Scene3D {
  fx: PostFXManager = null as any;
  gameObjects: Set<any> = new Set();
  pendingAdd: Set<any> = new Set();
  pendingRemove: Set<any> = new Set();
  groupManager: Map<string, Set<GameObject>> = new Map();
  tweensEasing: any;
  active: boolean = false;
  private thirdSnapshot: Scene3D["third"] | null = null;
  constructor(sceneName: string) {
    super({ key: sceneName });
  }

  init() {
    this.accessThirdDimension();
    this.thirdSnapshot = this.third;
    this.fx = new PostFXManager(this);  // our custom postprocessing manager
    this.tweensEasing = tweensEasing;
    this.active = true;
    
    // on click pointer lock
    // this.input.on('pointerdown', () => {
    //   if (!this.input.mouse?.locked) {
    //     this.input.mouse?.requestPointerLock();
    //   }
    // }, false);
  }
  
  /* override */
  async create() { }

  addGameObject(gameObject: GameObject) {
    this.pendingAdd.add(gameObject);
  }

  removeGameObject(gameObject: GameObject) {
    this.pendingRemove.add(gameObject);
  }

  removeAllGameObjects() {
    this.gameObjects.forEach((obj: GameObject) => obj.kill());
  }

  removeAllFromGroup(group: string) {
    this.groupManager.get(group)?.forEach((obj: GameObject) => obj.kill());
  }

  update(time: number, delta: number) {
    if (!this.active) return;
    const ts = time;
    const dt = delta / 1000;
    this.fx.update(ts, dt);
    updateListener(this.third.camera);
    this.preUpdate(ts, dt);
    this.cleanupPendingAdd();
    for (const obj of this.gameObjects) {
      obj.update(ts, dt);
      if (obj.props.object3D.hasBody) obj.props.object3D.body.needUpdate = true;
      if (obj.components) obj.components.forEach((v: ICompProps, k: GameObjectComponent) => k.compUpdate?.(dt));
      if (!obj.alive) this.pendingRemove.add(obj);
    }
    this.cleanupPendingRemove();
    this.postUpdate(ts, dt);
  }

  cleanupPendingAdd() {
        while (this.pendingAdd.size) {
      const obj: GameObject = Array.from(this.pendingAdd)[0];
      obj.preAdd();
      this.gameObjects.add(obj);
      obj.props.groups.forEach((group: string) => {
        if (!this.groupManager.has(group)) {
          this.groupManager.set(group, new Set());
        }
        this.groupManager.get(group)?.add(obj);
      });
      this.third.add.existing(obj.props.object3D);
      if (obj.props.physicsConfig)
        this.third.physics.add.existing(obj.props.object3D, obj.props.physicsConfig);
      obj.start()
      if (obj.components) obj.components.forEach((v: ICompProps, k: GameObjectComponent) => k.compStart?.());
      this.pendingAdd.delete(obj);
      obj.postAdd();
    }
  }

  cleanupPendingRemove() {
    while (this.pendingRemove.size) {
      const obj: GameObject = Array.from(this.pendingRemove)[0];
      obj.preRemove();
      obj.props.groups.forEach((group: string) => {
        this.groupManager.get(group)?.delete(obj);
      });
      if (obj.components) obj.components.forEach((v: ICompProps, k: GameObjectComponent) => k.compDestroy?.());
      obj.components.clear();
      this.pendingRemove.delete(obj);
      this.gameObjects.delete(obj);
      this.third.destroy(obj.props.object3D);
      obj.props = null as any;
      obj.postRemove();
    }
  }

  // update hooks
  preUpdate(time: number, delta: number) { }
  postUpdate(time: number, delta: number) { }

  // scene shutdown
  shutdown() {
    this.active = false;
    this.removeAllGameObjects();
    this.cleanupPendingRemove();
    this.gameObjects.clear();
    this.pendingAdd.clear();
    this.pendingRemove.clear();
    this.groupManager.clear();
    this.fx?.destroy?.();
    this.fx = null as any;
    this.disposeThirdDimension();
  }

  private disposeThirdDimension() {
    const third = this.thirdSnapshot ?? this.third;
    if (!third) return;

    this.fx?.destroy?.();
    this.fx = null as any;

    third.physics?.debug?.disable?.();

    const physicsObjects: any[] = [];
    third.scene?.traverse?.((obj: any) => {
      if (obj?.body) physicsObjects.push(obj);
    });
    physicsObjects.forEach(obj => third.physics?.destroy?.(obj));

    if (third.scene) {
      this.disposeSceneGraph(third.scene);
      third.scene.clear();
    }

    if (third.composer) {
      third.composer.dispose?.();
      (third as any).composer = undefined;
    }

    if (third.cache?.clear) {
      third.cache.clear();
    }

    const renderer: any = third.renderer;
    if (renderer) {
      renderer.dispose?.();
      renderer.forceContextLoss?.();
      const dom = renderer.domElement;
      if (dom?.parentElement) {
        dom.parentElement.removeChild(dom);
      }
    }

    this.thirdSnapshot = null;
  }

  private disposeSceneGraph(root: THREE.Object3D) {
    const materials = new Set<any>();
    const geometries = new Set<any>();

    root.traverse((obj: any) => {
      if (obj?.geometry) {
        geometries.add(obj.geometry);
      }
      const material = obj?.material;
      if (!material) return;
      if (Array.isArray(material)) {
        material.forEach(mat => materials.add(mat));
      } else {
        materials.add(material);
      }
    });

    geometries.forEach(geo => geo?.dispose?.());
    materials.forEach(mat => this.disposeMaterial(mat));
  }

  private disposeMaterial(material: any) {
    if (!material) return;
    const disposeTexture = (texture: any) => {
      if (!texture) return;
      if (Array.isArray(texture)) {
        texture.forEach(disposeTexture);
        return;
      }
      if (texture.isTexture && texture.dispose) texture.dispose();
    };

    const textureProps = [
      'map','lightMap','aoMap','emissiveMap','bumpMap','normalMap','displacementMap',
      'roughnessMap','metalnessMap','alphaMap','envMap','gradientMap','depthTexture'
    ];
    textureProps.forEach(key => disposeTexture(material[key]));

    if (material.uniforms) {
      Object.values(material.uniforms).forEach((uniform: any) => {
        if (uniform?.value?.isTexture) uniform.value.dispose?.();
      });
    }

    material.dispose?.();
  }
}

