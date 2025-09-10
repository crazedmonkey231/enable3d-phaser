# enable3d + Phaser (itch-ready)

- Phaser 3 + `@enable3d/phaser-extension`
- `base: './'` in Vite for itch
- Ammo from `${import.meta.env.BASE_URL}lib`
- `postinstall` copies `ammo.js` builds into `public/lib`

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
