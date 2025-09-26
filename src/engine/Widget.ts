// Simple widget wrapper for images, buttons, etc.
import { GameScene } from './GameScene';

export interface IWidgetProps {
  texture: string;
  x: number;
  y: number;
  scale?: number[];
  origin?: number[];
  onHover?: () => void;
  onOut?: () => void;
  onClick?: () => void;
}

export class Widget {
  scene: GameScene;
  props: IWidgetProps;
  image: Phaser.GameObjects.Image;
  constructor(scene: GameScene, props: IWidgetProps) {
    this.scene = scene;
    this.props = props;
    const { x, y, texture, origin, scale } = this.props;
    this.image = this.scene.add.image(x, y, texture);
    this.image.setScrollFactor(0);
    this.image.setOrigin(...(origin || [0.5, 0.5]));
    if (scale) {
      this.image.setScale(...(scale || [1, 1]));
    }
    this.image.setInteractive();
    if (this.props.onHover) {
      this.image.on('pointerover', () => this.props.onHover?.());
    }
    if (this.props.onOut) {
      this.image.on('pointerout', () => this.props.onOut?.());
    }
    if (this.props.onClick) {
      this.image.on('pointerdown', () => this.props.onClick?.());
    }
  }

  setImage(texture: string) {
    this.image.setTexture(texture);
  }

  setOrigin(origin: number[]) {
    this.image.setOrigin(...(origin || [0.5, 0.5]));
  }

  setPosition(x: number, y: number) {
    this.image.setPosition(x, y);
  }

  setScale(scale: number[]) {
    this.image.setScale(...(scale || [1, 1]));
  }

  destroy() {
    this.image.destroy();
  }
}