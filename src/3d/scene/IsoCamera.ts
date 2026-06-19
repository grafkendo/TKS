// ============================================================================
// IsoCamera — locked three-quarter orthographic camera rig.
//
// Features:
//   - Smooth pan/zoom toward focus targets
//   - Fixed ~42° pitch (three-quarter view)
//   - Q / E hold: ±30° peek rotation; release eases back to map default yaw
//   - Wheel zoom within a narrow band around the map default
// ============================================================================

import * as THREE from 'three';

export interface IsoCameraOptions {
  target?: THREE.Vector3;
  zoom?: number;
  pitchDeg?: number;
  yawDeg?: number;
}

const PEEK_DEG = 30;
const LOCKED_PITCH_DEG = 42;
const ZOOM_MIN_FACTOR = 0.45;
const ZOOM_MAX_FACTOR = 1.15;

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;

  private target = new THREE.Vector3();
  private targetGoal = new THREE.Vector3();
  private zoom = 8;
  private pitchDeg = LOCKED_PITCH_DEG;
  private yawDeg = 45;
  private targetYawDeg = 45;
  private defaultYawDeg = 45;
  private defaultZoom = 8;
  private targetZoom = 8;
  private peekOffsetDeg = 0;
  private targetPeekOffsetDeg = 0;
  private keysHeld = { q: false, e: false };
  private canvas: HTMLCanvasElement;
  private removeListeners: () => void;

  constructor(canvas: HTMLCanvasElement, opts: IsoCameraOptions = {}) {
    this.canvas = canvas;
    this.target.copy(opts.target ?? new THREE.Vector3(0, 0.5, 0));
    this.targetGoal.copy(this.target);
    this.defaultZoom = opts.zoom ?? 8;
    this.zoom = this.defaultZoom;
    this.targetZoom = this.defaultZoom;
    this.pitchDeg = LOCKED_PITCH_DEG;
    this.defaultYawDeg = opts.yawDeg ?? 45;
    this.yawDeg = this.defaultYawDeg;
    this.targetYawDeg = this.defaultYawDeg;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.removeListeners = this.attachInput();
    this.updateProjection();
    this.updateCameraTransform();
  }

  tick(dt: number): void {
    const posLerp = 1 - Math.exp(-dt * 9);
    const rotLerp = 1 - Math.exp(-dt * 11);
    const zoomLerp = 1 - Math.exp(-dt * 10);

    this.target.lerp(this.targetGoal, posLerp);
    this.peekOffsetDeg += (this.targetPeekOffsetDeg - this.peekOffsetDeg) * rotLerp;
    this.targetYawDeg = this.defaultYawDeg + this.peekOffsetDeg;
    this.yawDeg += (this.targetYawDeg - this.yawDeg) * rotLerp;
    this.zoom += (this.targetZoom - this.zoom) * zoomLerp;
    this.updateCameraTransform();
  }

  /** Smoothly pan toward a world focus point. */
  setTarget(t: THREE.Vector3): void {
    this.targetGoal.copy(t);
  }

  setTargetImmediate(t: THREE.Vector3): void {
    this.target.copy(t);
    this.targetGoal.copy(t);
    this.updateCameraTransform();
  }

  setDefaultYaw(degrees: number): void {
    this.defaultYawDeg = degrees;
    this.yawDeg = degrees;
    this.targetYawDeg = degrees + this.peekOffsetDeg;
    this.updateCameraTransform();
  }

  setDefaultZoom(z: number): void {
    this.defaultZoom = z;
    this.zoom = z;
    this.targetZoom = z;
    this.updateProjection();
    this.updateCameraTransform();
  }

  setZoom(z: number): void {
    const min = this.defaultZoom * ZOOM_MIN_FACTOR;
    const max = this.defaultZoom * ZOOM_MAX_FACTOR;
    this.targetZoom = Math.max(min, Math.min(max, z));
  }

  getDefaultZoom(): number {
    return this.defaultZoom;
  }

  /** @deprecated View is locked to three-quarter; no-op for compatibility. */
  setView(_view: 'iso' | 'top'): void {
    this.pitchDeg = LOCKED_PITCH_DEG;
  }

  toggleView(): 'iso' {
    return 'iso';
  }

  dispose(): void {
    this.removeListeners();
  }

  private updateProjection(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const aspect = w / h;
    const v = this.zoom;
    this.camera.left = -v * aspect;
    this.camera.right = v * aspect;
    this.camera.top = v;
    this.camera.bottom = -v;
    this.camera.updateProjectionMatrix();
  }

  private updateCameraTransform(): void {
    this.updateProjection();
    const yaw = THREE.MathUtils.degToRad(this.yawDeg);
    const pitch = THREE.MathUtils.degToRad(this.pitchDeg);
    const r = 30;
    const x = this.target.x + r * Math.cos(pitch) * Math.cos(yaw);
    const y = this.target.y + r * Math.sin(pitch);
    const z = this.target.z + r * Math.cos(pitch) * Math.sin(yaw);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  private syncPeekOffset(): void {
    if (this.keysHeld.q && !this.keysHeld.e) this.targetPeekOffsetDeg = -PEEK_DEG;
    else if (this.keysHeld.e && !this.keysHeld.q) this.targetPeekOffsetDeg = PEEK_DEG;
    else this.targetPeekOffsetDeg = 0;
  }

  private attachInput(): () => void {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.setZoom(this.targetZoom + Math.sign(e.deltaY) * 0.35);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'q' || e.key === 'Q') {
        if (!this.keysHeld.q) {
          this.keysHeld.q = true;
          this.syncPeekOffset();
        }
        e.preventDefault();
      } else if (e.key === 'e' || e.key === 'E') {
        if (!this.keysHeld.e) {
          this.keysHeld.e = true;
          this.syncPeekOffset();
        }
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') this.keysHeld.q = false;
      else if (e.key === 'e' || e.key === 'E') this.keysHeld.e = false;
      this.syncPeekOffset();
    };
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      this.canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }
}
