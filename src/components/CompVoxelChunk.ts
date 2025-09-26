// This component creates an instanced mesh for rendering voxel chunks in a 3D scene using Three.js.
import { THREE } from "@enable3d/phaser-extension";
import { GameObject, GameObjectComponent, ICompProps } from '../engine/GameObject';

export interface ICompVoxelChunkProps extends ICompProps {
  chunkSize?: number; // Size of each chunk (default: 16)
  chunkCount?: number; // Number of chunks along each axis (default: 4)
  voxelSize?: number; // Size of each voxel (default: 1)
  material?: THREE.Material; // Material for the voxels
}

export class CompVoxelChunk extends GameObjectComponent {  
  instancedMesh: THREE.InstancedMesh;
  chunkSize: number;
  chunkCount: number;
  voxelSize: number;
  constructor(gameObject: GameObject, props: ICompVoxelChunkProps) {
    super(gameObject, props);
    const p = this.props as ICompVoxelChunkProps;
    this.chunkSize = p.chunkSize || 16;
    this.chunkCount = p.chunkCount || 4;
    this.voxelSize = p.voxelSize || 1;
    const totalVoxels = this.chunkSize * this.chunkSize * this.chunkSize * this.chunkCount * this.chunkCount * this.chunkCount;
    const geometry = new THREE.BoxGeometry(this.voxelSize, this.voxelSize, this.voxelSize);
    this.instancedMesh = new THREE.InstancedMesh(geometry, p.material || new THREE.MeshStandardMaterial({ color: 0xffffff }), totalVoxels);

    const root = this.parent.props.object3D;
    root.add(this.instancedMesh);

    // Example: Position voxels in a grid pattern
    let index = 0;
    const offset = this.getOffset();
    for (let x = 0; x < this.chunkCount * this.chunkSize; x++) {
      for (let y = 0; y < this.chunkCount * this.chunkSize; y++) {
        for (let z = 0; z < this.chunkCount * this.chunkSize; z++) {
          const matrix = new THREE.Matrix4().makeTranslation(
            x * this.voxelSize - offset.x,
            y * this.voxelSize - offset.y,
            z * this.voxelSize - offset.z
          );
          this.instancedMesh.setMatrixAt(index++, matrix);
        }
      }
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    // on mouse down, raycast and remove a voxel
    this.parent.props.gameScene.input.on('pointerdown', (event: any) => {
      // this.raycastVoxel(this.removeVoxelAt.bind(this), []);
      // this.raycastVoxel(this.setColorAt.bind(this), [new THREE.Color(0xff0000)]);
      this.raycastVoxel(this.removeVoxelAtShapeCircle.bind(this), [10]);
    });
  }

  raycastVoxel(callback: any, callbackParams: any): void {
    const mouse = new THREE.Vector2();
    const event = this.parent.props.gameScene.input.activePointer;
    mouse.x = (event.x / this.parent.props.gameScene.scale.width) * 2 - 1;
    mouse.y = -(event.y / this.parent.props.gameScene.scale.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.parent.props.gameScene.third.camera);
    const intersects = raycaster.intersectObject(this.instancedMesh);
    if (intersects.length > 0) {
      const index = intersects[0].instanceId;
      if (index === undefined) return;
      callback(index, ...callbackParams);
    }
  }

  setColorAt(index: number, color: THREE.Color): void {
    if (index < 0 || index >= this.instancedMesh.count) return;
    this.instancedMesh.setColorAt(index, color);
    this.instancedMesh.instanceColor!.needsUpdate = true;
  }

  getVoxelAt(index: number): THREE.Matrix4 | null {
    if (index < 0 || index >= this.instancedMesh.count) return null;
    const outMatrix = new THREE.Matrix4();
    this.instancedMesh.getMatrixAt(index, outMatrix);
    return outMatrix;
  }

  removeVoxelAt(index: number): void {
    if (index < 0 || index >= this.instancedMesh.count) return;
    this.instancedMesh.setMatrixAt(index, new THREE.Matrix4());
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  removeVoxelShapeAt(index: number, shape: THREE.Vector3[]): void {
    shape.forEach(offset => {
      const targetIndex = index + offset.x + offset.y * this.chunkSize * this.chunkCount + offset.z * this.chunkSize * this.chunkCount * this.chunkSize * this.chunkCount;
      this.removeVoxelAt(targetIndex);
    });
  }

  removeVoxelAtShapeCircle(index: number, radius: number): void {
    const radiusSquared = radius * radius;
    // Convert index to (vx, vy, vz)
    const chunkDim = this.chunkSize * this.chunkCount;
    const vz = Math.floor(index / (chunkDim * chunkDim));
    const vy = Math.floor((index % (chunkDim * chunkDim)) / chunkDim);
    const vx = index % chunkDim;

    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        for (let z = -radius; z <= radius; z++) {
          if (x * x + y * y + z * z <= radiusSquared) {
            const tx = vx + x;
            const ty = vy + y;
            const tz = vz + z;
            // Only remove if within bounds
            if (
              tx >= 0 && tx < chunkDim &&
              ty >= 0 && ty < chunkDim &&
              tz >= 0 && tz < chunkDim
            ) {
              const targetIndex = tx + ty * chunkDim + tz * chunkDim * chunkDim;
              this.removeVoxelAt(targetIndex);
            }
          }
        }
      }
    }
  }

  getOffset(): THREE.Vector3 {
    return new THREE.Vector3(
      (this.chunkSize * this.voxelSize * this.chunkCount) / 2,
      (this.chunkSize * this.voxelSize * this.chunkCount) / 2,
      (this.chunkSize * this.voxelSize * this.chunkCount) / 2
    );
  }

  isEmpty(): boolean {
    const dummyMatrix = new THREE.Matrix4();
    const emptyMatrix = new THREE.Matrix4();
    for (let i = 0; i < this.instancedMesh.count; i++) {
      this.instancedMesh.getMatrixAt(i, dummyMatrix)
      if (!dummyMatrix) continue;
      if (!dummyMatrix.equals(emptyMatrix)) return false;
    }
    return true;
  }

  compUpdate(dt: number): void {

  } 

  compDestroy(): void {
    if (this.instancedMesh) {
      this.instancedMesh.geometry.dispose();
      if (this.instancedMesh.material instanceof Array) {
        this.instancedMesh.material.forEach(mat => mat.dispose());
      } else {
        this.instancedMesh.material.dispose();
      }
    }
    this.parent.props.gameScene.third.scene.remove(this.instancedMesh);
    this.instancedMesh = null as any;
    super.compDestroy();
  } 
}
