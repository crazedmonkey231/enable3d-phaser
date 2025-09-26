import { Howl, Howler } from 'howler'
import * as THREE from 'three'

/**
 * Manages 3D spatial audio for a THREE.js scene using Howler.js.
 * 
 * Handles attaching and updating the audio listener to follow a camera,
 * playing spatialized audio tracks at 3D object positions, and managing
 * master volume and mute state. Also ensures audio unlocks on first user gesture.
 */

const base = import.meta.env.BASE_URL || './'
const A = (file) => `${base}audio/${file}`

// --- Listener ----------------------------------------------------------------

let _tmpPos = new THREE.Vector3()
let _tmpFwd = new THREE.Vector3(0, 0, -1)
let _tmpUp  = new THREE.Vector3(0, 1, 0)

export function unlockOnFirstGesture(dom = window) {
  const once = () => {
    // Howler auto-unlocks, but nudge it by starting/stopping a silent play if needed
    tracks.gesture.play(); tracks.gesture.pause();
    dom.removeEventListener('pointerdown', once)
    dom.removeEventListener('keydown', once)
  }
  dom.addEventListener('pointerdown', once, { once: true })
  dom.addEventListener('keydown', once, { once: true })
}

export function updateListener(camera) {
  // Howler listener position/orientation (WebAudio 3D)
  if (Howler && Howler.ctx) {
    camera.getWorldPosition(_tmpPos)
    const f = _tmpFwd.clone().applyQuaternion(camera.quaternion).normalize()
    const u = _tmpUp.clone().applyQuaternion(camera.quaternion).normalize()
    // Listener position
    Howler.pos(_tmpPos.x, _tmpPos.y, _tmpPos.z)
    // Forward + Up vectors
    Howler.orientation(f.x, f.y, f.z, u.x, u.y, u.z)
  }
}

// --- Music & SFX handles ----------------------------------------------------

export const tracks = {
  gesture: new Howl({
    src: [A('song1.wav')],
    loop: true,
    volume: 0.35
  }),
  boom: new Howl({
    src: [A('pop.ogg')],
    volume: 0.9
  })
}

export function setMasterVolume(v) { 
  Howler.volume(v) 
}

export function mute(v = true) { 
  Howler.mute(v) 
}

export function playTrackAt(trackName, object3D) {
  const track = tracks[trackName]
  if (!track) return

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
  return track.play()
}

export function playTrackAtPosition(trackName, position) {
  const track = tracks[trackName]
  if (!track) return
  if (track.pos) {
    track.pos(position.x, position.y, position.z)
    track.pannerAttr({
      refDistance: 3,        // distance at which volume is ~1.0
      rolloffFactor: 1.0,    // how fast it fades with distance
      distanceModel: 'inverse'
    })
  } else {
    // Fallback: narrow stereo pan based on X (non-WebAudio environments)
    const x = position.x
    const pan = Math.max(-1, Math.min(1, x / 20))
    track.stereo?.(pan)
  }
  return track.play()
}

export function stopTrack(trackName) {
  const track = tracks[trackName]
  if (track) track.stop()
}