// src/audio.js
import { Howl, Howler } from 'howler'
import * as THREE from 'three'

// Assets helper works in dev + build (itch.io) thanks to Vite's BASE_URL.
const base = import.meta.env.BASE_URL || './'
const A = (file) => `${base}audio/${file}`

// --- Music & SFX handles ----------------------------------------------------

export const tracks = {
  music: new Howl({
    src: [A('song1.wav')],
    loop: true,
    volume: 0.35
  }),
  boom: new Howl({
    src: [A('pop.ogg')],
    volume: 0.9
  })
}

// AudioManager --------------------------------------------------------------

/**
 * Manages 3D spatial audio for a THREE.js scene using Howler.js.
 * 
 * Handles attaching and updating the audio listener to follow a camera,
 * playing spatialized audio tracks at 3D object positions, and managing
 * master volume and mute state. Also ensures audio unlocks on first user gesture.
 *
 * @class
 * @example
 * const audioManager = new AudioManager(scene);
 * audioManager.playTrackAt(mesh, soundTrack);
 */
export class AudioManager {
  constructor(scene){
    this.scene = scene
    this._tmpPos = new THREE.Vector3()
    this._tmpFwd = new THREE.Vector3(0, 0, -1)
    this._tmpUp  = new THREE.Vector3(0, 1, 0)

    this.attachListener(this.scene.third.camera)
    this.unlockOnFirstGesture(this.scene.game.canvas)
  }

  // Call once on scene create; pass a THREE.PerspectiveCamera
  attachListener(camera) {
    // optional: initial position/orientation
    this.updateListener(camera)
  }

  // Call each frame (or every few frames) to keep spatial audio aligned
  updateListener(camera) {
    camera.getWorldPosition(this._tmpPos)
    const f = this._tmpFwd.clone().applyQuaternion(camera.quaternion).normalize()
    const u = this._tmpUp.clone().applyQuaternion(camera.quaternion).normalize()

    // Howler listener position/orientation (WebAudio 3D)
    if (Howler && Howler.ctx) {
      // Listener position
      Howler.pos(this._tmpPos.x, this._tmpPos.y, this._tmpPos.z)
      // Forward + Up vectors
      Howler.orientation(f.x, f.y, f.z, u.x, u.y, u.z)
    }
  }

  playTrackAt(object3D, track) {
    const id = track.play()
    if (track.pos) {
      const p = object3D.getWorldPosition(new THREE.Vector3())
      track.pos(p.x, p.y, p.z, id)
      track.pannerAttr({
        refDistance: 3,        // distance at which volume is ~1.0
        rolloffFactor: 1.0,    // how fast it fades with distance
        distanceModel: 'inverse'
      }, id)
    } else {
      // Fallback: narrow stereo pan based on X (non-WebAudio environments)
      const x = object3D.position.x
      const pan = Math.max(-1, Math.min(1, x / 20))
      track.stereo?.(pan, id)
    }
  }

  setMasterVolume(v) { 
    Howler.volume(v) 
  }

  mute(v = true) { 
    Howler.mute(v) 
  }

  // Some browsers need a user gesture before audio can start
  unlockOnFirstGesture(dom = window) {
    const once = () => {
      // Howler auto-unlocks, but nudge it by starting/stopping a silent play if needed
      tracks.music.play(); tracks.music.pause();
      dom.removeEventListener('pointerdown', once)
      dom.removeEventListener('keydown', once)
    }
    dom.addEventListener('pointerdown', once, { once: true })
    dom.addEventListener('keydown', once, { once: true })
  }
}