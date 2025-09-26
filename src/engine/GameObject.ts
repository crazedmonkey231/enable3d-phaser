// --- Game Object System -----------------------------------------------------
import { THREE } from "@enable3d/phaser-extension";
import { GameScene } from "./GameScene"
import * as Types from '@enable3d/common/dist/types.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { playTrackAt, stopTrack } from "./AudioManager";

export let GO_RIGIDBODY_FLAGS = {
  DYNAMIC: 0,
  STATIC: 1,
  KINEMATIC: 2,
  GHOST: 4
}

// --- Damage props ---------------------------------------------------

export const DAMAGE_TYPES = {
  GENERIC: 'generic',
  PHYSICAL: 'physical',
  FIRE: 'fire',
  ICE: 'ice',
  POISON: 'poison',
  LIGHTNING: 'lightning',
  HEAL: 'heal'
}

export interface IDamageProps {
  amount: number;
  type: string;
  source: GameObject | null;
}

// --- Component Properties ---------------------------------------------------

export interface ICompProps { 
  tags?: Set<string>;
}

export interface ICompPropsMesh extends ICompProps { 
  mesh?: THREE.Object3D;
}

// --- Game Object Component --------------------------------------------------

export class GameObjectComponent {
  parent: GameObject
  name: string
  props: ICompProps
  constructor(parent: GameObject, props: ICompProps) {
    this.parent = parent
    this.props = props
    this.name = "Component"
  }
  
  compStart() { /* component init on first frame */ }
  compUpdate(dt: number) { /* component update per frame */ }
  compDestroy() { /* component destroy */ }
  compOnDamage(damageProps: IDamageProps) { return damageProps.amount /* modify damage if needed */ }
  compSetProperties(props: ICompProps) { /* set component properties dynamically */ }
}

// --- Game Object Properties -------------------------------------------------

export interface IGameObjectProperties {
  gameScene: GameScene;
  name: string;
  objectType: string;
  position: Types.XYZ;
  groups: Set<string>;
  tags: Set<string>;
  anims: Set<string>;
  object3D: any;
  components: Map<typeof GameObjectComponent, ICompProps>;
  physicsConfig: Types.AddExistingConfig;
  health: number;
  maxHealth: number;
}

// --- Game Object ------------------------------------------------------------

export class GameObject {
  props: IGameObjectProperties
  components = new Map<GameObjectComponent, ICompProps>()
  alive: boolean
  constructor(gameObjectProperties: IGameObjectProperties) {
    this.props = gameObjectProperties
    this.props.object3D.position.set(gameObjectProperties.position.x, gameObjectProperties.position.y, gameObjectProperties.position.z)
    // for (const [comp, compProps] of this.props.components) this.addComponent(comp, compProps)
    this.props.components.forEach((v: ICompProps, k: typeof GameObjectComponent) => {
      this.addComponent(k, v)
    });
    this.alive = true
  }

  // --- Lifecycle -------------------------------------------------------------

  start() { /* first frame */ }

  /* every frame */
  update(time: number, dt: number) { }

  /* kill the game object (remove from scene and disable) */
  kill() {
    this.alive = false
    this.props.object3D.visible = false
    if (this.props.object3D.hasBody) this.props.object3D.body.enable = false
    this.props?.gameScene?.removeGameObject(this)
  }

  /* apply damage or healing to the game object, returns the modified amount */
  damage(damageProps: IDamageProps) {
    if (!this.alive) return 0
    let modifiedAmount = damageProps.amount
    if (damageProps.type === DAMAGE_TYPES.HEAL) {
      modifiedAmount = -modifiedAmount
    } else {
      modifiedAmount = Math.min(this.props.health, modifiedAmount)
    }
    // comp system to handle damage modifications
    this.components.forEach((v: ICompProps, k: GameObjectComponent) => {
      modifiedAmount = k.compOnDamage({ ...damageProps, amount: modifiedAmount })
    });
    this.props.health -= modifiedAmount
    if (this.props.health <= 0) this.kill()
    return modifiedAmount
   }

  // -- Components -----------------------------------------------------------

  addComponent(component: typeof GameObjectComponent, props: ICompProps = {}) {
    const comp = new component(this, props)
    this.components.set(comp, props)
  }

  removeComponentByName(name: string) {
    this.components.forEach((v: ICompProps, k: GameObjectComponent) => {
      if (k.name === name) {
        k.compDestroy?.()
        this.components.delete(k)
      }
    });
  }

  // --- Optional Hooks ------------------------------------------------------

  preAdd() { /* before adding to scene */ }
  postAdd() { /* after adding to scene */ }
  preRemove() { /* before removing from scene */ }
  postRemove() { /* after removing from scene */ }

  // --- Tags ----------------------------------------------------------------

  hasTag(tag: string) {
    return this.props.tags.has(tag)
  }

  addTag(tag: string) {
    this.props.tags.add(tag)
  }

  removeTag(tag: string) {
    this.props.tags.delete(tag)
  }

  // --- Groups --------------------------------------------------------------

  inGroup(group: string) {
    return this.props.groups.has(group)
  }

  addToGroup(group: string) {
    this.props.groups.add(group)
    this.props.gameScene.groupManager.get(group)?.add(this)
  }

  removeFromGroup(group: string) {
    this.props.groups.delete(group)
    this.props.gameScene.groupManager.get(group)?.delete(this)
  }

  // --- Audio ---------------------------------------------------------------

  playSound(name: string, position=null) {
    if (position) playTrackAt(name, position)
    else playTrackAt(name, this.props.object3D.position)
  }

  stopSound(name: string) {
    stopTrack(name);
  }

  // --- Debug ---------------------------------------------------------------

  log() {
    console.log(this)
  }

}

// --- Factory ----------------------------------------------------------------

export interface ICreateFromModelProps {
  model: string;
  scale?: number;
}

export class GameObjectFactory {
  static gltfLoader = new GLTFLoader();
  static modelCache = new Map<string, any>();

  static create(gameScene: GameScene, props: Partial<IGameObjectProperties>) {
    const defaultProps: IGameObjectProperties = {
      gameScene: gameScene,
      name: "GameObject",
      tags: new Set(),
      groups: new Set(),
      anims: new Set(),
      object3D: new THREE.Object3D(),
      components: new Map<typeof GameObjectComponent, ICompProps>(),
      physicsConfig: null as any,
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      maxHealth: 100,
      objectType: 'none'
    };
    const newGameObject = new GameObject({ ...defaultProps, ...props });
    gameScene.addGameObject(newGameObject);
    return newGameObject;
  }

  static createFromModel(gameScene: GameScene, loaderProps: ICreateFromModelProps, props: Partial<IGameObjectProperties>) {
    const { model } = loaderProps;
    if (this.modelCache.has(model)) {
      const cached = this.modelCache.get(model);
      this.create(gameScene, { ...props, object3D: cached.clone() });
    } else {
      this.gltfLoader.load(`./models/${model}.glb`, gltf => {
      const child = gltf.scene.children[0]
      child.traverse((node: any) => { 
        if (node.isMesh) { 
          node.castShadow = true; 
          node.receiveShadow = true; 
        } 
      });
      child.scale.setScalar(loaderProps.scale || 1);
      child.name = model;
      // cache the model
      this.modelCache.set(model, child);
      this.create(gameScene, { ...props, object3D: child });
    });  
    }
  }

  static createFromModelVrm(gameScene: GameScene, loaderProps: ICreateFromModelProps, props: Partial<IGameObjectProperties>, ) {
    const { model } = loaderProps;
    const scale = loaderProps.scale || 1;
    if (this.modelCache.has(model)) {
      if (this.modelCache.get(model).userData.baseScale !== scale) {
        // if the scale has changed, we need to re-create the model
        this.modelCache.delete(model);
        this.createFromModelVrm(gameScene, loaderProps, props);
      }
      const cached = this.modelCache.get(model);
      this.create(gameScene, { ...props, object3D: cached.clone() });
    } else {
      this.gltfLoader.load(
        `./models/${model}.vrm`,
        (gltf) => {
            const m: any = gltf.scene;
            m.traverse((node: any) => { 
              if (node.isMesh) { 
                if (node.name === 'Body') {
                  node.castShadow = true; 
                  node.receiveShadow = true;
                  console.log('body mat:', node);
                }
                node.frustumCulled = false;
              }
            });
            
            if (props.anims){
              gameScene.third.animationMixers.add(m.animation.mixer);
              gltf.animations.forEach(animation => {
                if (animation.name) {
                  // add a new animation to the model
                  m.animation.add(animation.name, animation)
                }
              })
            }

            // --- 1) Measure model bounds (world AABB) ---
            const bbox = new THREE.Box3().setFromObject(m);
            const size = bbox.getSize(new THREE.Vector3());
            
            // Full model height:
            const modelHeight = Math.max(0.01, size.y);

            // Horizontal extents (X and Z). We’ll use the smaller as a proxy for shoulder width.
            const widthX = size.x;
            const widthZ = size.z;
            const horizMin = Math.max(0.01, Math.min(widthX, widthZ));

            // --- 2) Choose capsule radius & length (auto-fit) ---
            // Heuristic: radius ~ 25% of smaller horizontal extent, clamped to sane character values.
            let radius = THREE.MathUtils.clamp(horizMin * 0.25 * scale, 0.12 * scale, 0.45 * scale);

            // Straight section length: modelHeight - the two hemispheres
            let length = Math.max((modelHeight * scale) - 2 * radius, 0.2 * scale); // ensure > 0

            // Optional: round to nice steps to avoid micro re-creations due to tiny variances
            const roundTo = (v: number, step = 0.01) => Math.round(v / step) * step;
            radius = roundTo(radius, 0.01);
            length = roundTo(length, 0.01);

            // create character capsule
            const root = new THREE.CapsuleGeometry(radius, length, 8, 16);
            const mat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0 });
            const capsule = new THREE.Mesh(root, mat);
            capsule.name = model + '_capsule';
            capsule.userData.baseScale = scale; // store base scale for future reference
            capsule.attach(gltf.scene);
            
            // parent VRM under capsule and set VRM scale:
            gltf.scene.scale.setScalar(scale);

            // --- 5) Vertically align: put avatar feet at capsule bottom ---
            // Capsule is centered at y=0; its bottom is at -(length/2 + radius)
            const capsuleBottomY = -(length * 0.5 + radius);

            // We measured bbox before reparenting; its min.y is the avatar "feet" in world.
            // Because the capsule is currently identity at (0,0,0), using that min is fine.
            const currentFeetY = bbox.min.y;

            // Shift the whole VRM so that its feet touch the capsule bottom:
            gltf.scene.position.y += (capsuleBottomY - currentFeetY);

            // ensure physics props are correct
            props.physicsConfig = { ...props.physicsConfig, 
              shape: 'capsule', 
              radius: radius,           // Enable3D expects straight section height + radius fields
              height: length,           // (height here is the straight cylinder section)
              addChildren: false }

             // cache the model
            this.modelCache.set(model, capsule);

            // create the game object
            this.create(gameScene, { ...props, object3D: capsule });
        },
        (progress) => {
            console.log('Loading progress:', progress.loaded / progress.total);
        },
        (error) => {
            console.error('Error loading VRM:', error);
        }
      );
    }
  }
}
