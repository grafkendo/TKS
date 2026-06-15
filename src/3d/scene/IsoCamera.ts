// ============================================================================
// IsoCamera — three-quarter view orthographic camera rig.
//
// Standard "true isometric" (35.264° pitch) is one option; we default to a
// slightly steeper 40° pitch which reads as 3/4-view and looks more dramatic
// for mech combat (you see torsos and weapons rather than tops of heads).
//
// Features:
//   - Smooth zoom via mouse wheel
//   - Q/E to rotate around the target (snap to 90° increments by default,
//     or hold Shift for free continuous rotation)
//   - Right-click drag to pan
//
// All driven from a (target, distance, yaw, pitch) state so any future
// "camera shake" / "fly to" / "zoom in for shot" effects just animate those
// fields.
// ============================================================================

import * as THREE from 'three';

export interface IsoCameraOptions {
  /** Logical target world position the camera looks at. */
  target?: THREE.Vector3;
  /** Initial zoom distance (orthographic frustum half-height in world units). */
  zoom?: number;
  /** Pitch in degrees (above horizon). 35 = true iso. 40 = slightly steeper 3/4. */
  pitchDeg?: number;
  /** Initial yaw in degrees (around world Y axis). */
  yawDeg?: number;
}

const SNAP_DEG = 90;

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;

  private target: THREE.Vector3;
  private zoom: number;
  private pitchDeg: number;
  private yawDeg: number;
  private targetYawDeg: number; // for smooth snap rotation
  private targetZoom: number;
  private canvas: HTMLCanvasElement;
  private removeListeners: () => void;

  constructor(canvas: HTMLCanvasElement, opts: IsoCameraOptions = {}) {
    this.canvas = canvas;
    this.target = (opts.target ?? new THREE.Vector3(0, 0, 0)).clone();
    this.zoom = opts.zoom ?? 8;
    this.targetZoom = this.zoom;
    this.pitchDeg = opts.pitchDeg ?? 40;
    this.yawDeg = opts.yawDeg ?? 45;
    this.targetYawDeg = this.yawDeg;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.removeListeners = this.attachInput();
    this.updateProjection();
    this.updateCameraTransform();
  }

  /** Frame-update — smooth interpolation toward target yaw / zoom. */
  tick(dt: number): void {
    const lerpRate = 1 - Math.exp(-dt * 10);
    this.yawDeg += (this.targetYawDeg - this.yawDeg) * lerpRate;
    this.zoom += (this.targetZoom - this.zoom) * lerpRate;
    this.updateCameraTransform();
  }

  /** Sets the world position the camera focuses on. */
  setTarget(t: THREE.Vector3): void {
    this.target.copy(t);
    this.updateCameraTransform();
  }

  /** Increment yaw to next snap. */
  rotate(degrees: number): void {
    this.targetYawDeg += degrees;
  }

  setZoom(z: number): void {
    this.targetZoom = Math.max(2, Math.min(40, z));
  }

  dispose(): void {
    this.removeListeners();
  }

  // ---------------------------------------------------------------------------

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

    // Spherical-ish: distance is large so orthographic stays "outside" the scene.
    const r = 30;
    const x = this.target.x + r * Math.cos(pitch) * Math.cos(yaw);
    const y = this.target.y + r * Math.sin(pitch);
    const z = this.target.z + r * Math.cos(pitch) * Math.sin(yaw);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  // ---------------------------------------------------------------------------

  private attachInput(): () => void {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.setZoom(this.targetZoom + Math.sign(e.deltaY) * 1.2);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') this.rotate(-SNAP_DEG);
      else if (e.key === 'e' || e.key === 'E') this.rotate(SNAP_DEG);
    };
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);

    return () => {
      this.canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }
}
