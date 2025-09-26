// A component for managing a voxel-based 3D world, using marching cubes from Three.js.
import { THREE } from "@enable3d/phaser-extension";
import { GameObject, GameObjectComponent, ICompProps } from '../engine/GameObject';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export interface ICompVoxelWorldProps extends ICompProps {
  size?: THREE.Vector3; // Size of the world in 3D (default: (100,100,100))
  resolution?: number; // Resolution of the marching cubes grid (default: 28)
  material?: THREE.Material; // Material for the voxel world
  isolation?: number; // Isolation level for the marching cubes (default: 80)
}

export class CompVoxelWorld extends GameObjectComponent {  
  marchingCubes: MarchingCubes;
  resolution: number;
  isolation: number;
  center: THREE.Vector3;
  raycaster: THREE.Raycaster;
  constructor(gameObject: GameObject, props: ICompVoxelWorldProps) {
    super(gameObject, props);
    const p = this.props as ICompVoxelWorldProps;
    this.resolution = p.resolution || 32; // Default resolution
    this.isolation = p.isolation || 32; // Default isolation level
    this.marchingCubes = new MarchingCubes(this.resolution, p.material || new THREE.MeshStandardMaterial({ color: 0x00ff00 }), true, false);
    this.marchingCubes.isolation = this.isolation;
    this.marchingCubes.position.set(0, 0, 0);
    this.marchingCubes.scale.set(p.size?.x || 100, p.size?.y || 100, p.size?.z || 100); // Scale the marching cubes to fit the scene
    this.marchingCubes.enableUvs = false;
    this.marchingCubes.enableColors = false;

    const resolutionHalf = Math.floor(this.resolution / 2);
    this.center = new THREE.Vector3(resolutionHalf, resolutionHalf, resolutionHalf);

    this.raycaster = new THREE.Raycaster();

    // Example: Create some initial voxel data (a sphere)
    // this.updateFieldWithSphere(this.center.x, this.center.y, this.center.z, 10);
    this.createWorld();

    // on mouse down, raycast and add a sphere of voxels
    this.parent.props.gameScene.input.on('pointerdown', (event: any) => {
      const mouse = new THREE.Vector2();
      mouse.x = (event.x / this.parent.props.gameScene.scale.width) * 2 - 1;
      mouse.y = -(event.y / this.parent.props.gameScene.scale.height) * 2 + 1;
      this.raycaster.setFromCamera(mouse, this.parent.props.gameScene.third.camera);
      const intersects = this.raycaster.intersectObject(this.marchingCubes);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        // Toggle voxel at this position
        this.addSphere(point, 3);
      }
    });
  }

  worldToField(point: THREE.Vector3): THREE.Vector3 {
    // Convert point to local space of marching cubes
    const localPoint = this.marchingCubes.worldToLocal(point.clone());

    // Convert localPoint to field coordinates
    const toFieldIndex = (value: number) => {
      const normalized = THREE.MathUtils.clamp((value + 1) * 0.5, 0, 1);
      return Math.round(normalized * (this.resolution - 1));
    };

    const fieldX = toFieldIndex(localPoint.x);
    const fieldY = toFieldIndex(localPoint.y);
    const fieldZ = toFieldIndex(localPoint.z);

    return new THREE.Vector3(fieldX, fieldY, fieldZ);
  }

  compStart(): void {
    const scene = this.parent.props.gameScene.third.scene;
    scene.add(this.marchingCubes);
  }

  createTerrain(): void {
    const field = this.marchingCubes.field;
    const res = this.resolution;
    // Simple terrain generation using Perlin noise
    const noise = new ImprovedNoise();
    const scale = 0.05;
    for (let z = 0; z < res; z++) {
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const index = x + y * res + z * res * res;
          const value = noise.noise(x * scale, y * scale, z * scale);
          field[index] = value < 0 ? this.isolation : 0;
        }
      }
    }
    this.marchingCubes.update();
  }

  createWorld(): void {
    // Similar to createTerrain but creates a flat world with rolling hills
    const field = this.marchingCubes.field;
    const res = this.resolution;
    const noise = new ImprovedNoise();
    const scale = 0.1;
    for (let z = 0; z < res; z++) {
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const index = x + y * res + z * res * res;
          const height = Math.floor((noise.noise(x * scale, z * scale, 0) + 1) * (res / 4)); // Height based on noise
          if (y < height) field[index] = this.isolation; // Solid voxel
          else field[index] = 0; // Empty voxel
        }
      }
    }
    this.marchingCubes.update();
  }

  addSphere(center: THREE.Vector3, radius: number): void {
    center = this.worldToField(center);
    const field = this.marchingCubes.field;
    const res = this.resolution;
    for (let z = 0; z < res; z++) {
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const dx = x - center.x;
          const dy = y - center.y;
          const dz = z - center.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const index = x + y * res + z * res * res;
          if (dist < radius) 
            field[index] = this.isolation;
        }
      }
    }
    this.marchingCubes.update();
  }

  toggleVoxelAt(x: number, y: number, z: number, radius: number): void {
    const field = this.marchingCubes.field;
    const res = this.resolution;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist <= radius) {
            const fx = x + dx;
            const fy = y + dy;
            const fz = z + dz;
            const index = fx + fy * res + fz * res * res;
            // any field above isolation is solid, below is empty
            if (fx < 0 || fx >= res || fy < 0 || fy >= res || fz < 0 || fz >= res) continue;
            // Toggle the voxel
            if (field[index] >= this.isolation) field[index] = 0;
            else field[index] = this.isolation;
          }
        }
      }
    }
  }

  compUpdate(): void {
  }

  compDestroy(): void {
    this.parent.props.gameScene.third.scene.remove(this.marchingCubes);
    this.marchingCubes.geometry.dispose();
    if (Array.isArray(this.marchingCubes.material)) {
      this.marchingCubes.material.forEach(mat => mat.dispose());
    } else {
      this.marchingCubes.material.dispose();
    }
  }
}