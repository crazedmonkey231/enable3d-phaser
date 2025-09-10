
# enable3d + Phaser (itch-ready)

- Phaser 3 + `@enable3d/phaser-extension`
- `base: './'` in Vite for itch

## Features

- **GameObject/Component System:**
	- Flexible, reusable base for all in-game entities, inspired by Pygame's Sprite and Unity's component model.
	- Attach custom components to game objects for modular behavior.
	- Built-in group and lifecycle management.

- **World & Audio Management:**
	- Central `World` class manages all game objects, updates, and physics.
	- `AudioManager` for spatial and ambient sound, with easy 3D audio playback.

- **Postprocessing:**
	- `PostFXManager` for dynamic Three.js post-processing (bloom, outline, pixelation, toon, etc).
	- Easily add, remove, or configure effects at runtime.

- **Starter Objects:**
	- `SunSky`: Dynamic day/night sky and lighting with weather presets.
	- `ThirdPersonCharacter`: Smooth, velocity-based third-person controller with over-the-shoulder camera.
	- `Crate`: Simple physics object for testing.
	- `Basic Water`: (see `Water.js`) Example of animated water surface (if present).

## Run
```bash
npm install
npm run dev
```

## Build & upload to itch
```bash
npm run build
# zip the CONTENTS of dist/ and upload as HTML
```
