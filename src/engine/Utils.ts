// Utility functions for the game engine
import { THREE } from '@enable3d/phaser-extension'
import { GameScene } from './GameScene';

// Phaser tween easings references
export const tweensEasing = {
  sineEaseInOut: 'Sine.easeInOut',
  expoEaseInOut: 'Expo.easeInOut',
  circEaseInOut: 'Circ.easeInOut',
  quadEaseInOut: 'Quad.easeInOut',
  cubicEaseInOut: 'Cubic.easeInOut',
  quartEaseInOut: 'Quart.easeInOut',
  quintEaseInOut: 'Quint.easeInOut',
  backEaseInOut: 'Back.easeInOut',
  elasticEaseInOut: 'Elastic.easeInOut',
  bounceEaseInOut: 'Bounce.easeInOut'
}

// Utils

export function getBox(size: number, color: any) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshStandardMaterial({ color });
  return new THREE.Mesh(geometry, material);
}

export function loadImages(scene: GameScene, images: string[]) {
  const getImagePath = (file: string) => `./textures/${file}`
  for (const path of images) {
    const key = path.split('/').pop()?.split('.')[0] || path;
    scene.load.image(key, getImagePath(path));
  }
}