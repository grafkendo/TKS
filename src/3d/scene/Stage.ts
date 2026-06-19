// ============================================================================
// Stage — the root Three.js setup.
//
// Responsibilities:
//   - WebGLRenderer attached to <canvas id="stage">
//   - Scene graph root
//   - Lighting (hemisphere fill + directional key with shadows)
//   - Resize handling
//   - render loop with per-frame "tickers" (anything that needs updating)
//
// Designed to host THREE.Group children for: ground, units, FX, overlays.
// Effects systems and asset loaders plug in by being added to scene.
// ============================================================================

import * as THREE from 'three';

import { SKY_BACKDROP } from './miniaturePalette';

export type Ticker = (dtSec: number, totalSec: number) => void;

export class Stage {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;

  /** Camera is owned by IsoCamera but lives in this group so children inherit any future rig transforms. */
  readonly cameraRig = new THREE.Group();

  private tickers: Ticker[] = [];
  private prevTime = performance.now() / 1000;
  private startTime = this.prevTime;
  private rafId = 0;
  private running = false;
  private resizeObserver?: ResizeObserver;
  private currentCamera?: THREE.Camera;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Future texture work: switch to ACES tone mapping once we add HDR assets.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene.background = new THREE.Color(SKY_BACKDROP);
    this.scene.fog = new THREE.Fog(SKY_BACKDROP, 38, 88);

    this.scene.add(this.cameraRig);
    this.addLights();
    this.handleResize();
  }

  /** Register the active camera to render with. */
  setCamera(camera: THREE.Camera): void {
    this.currentCamera = camera;
  }

  addTicker(t: Ticker): () => void {
    this.tickers.push(t);
    return () => {
      const i = this.tickers.indexOf(t);
      if (i >= 0) this.tickers.splice(i, 1);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - this.prevTime); // clamp to avoid huge dt on tab return
      const total = now - this.startTime;
      this.prevTime = now;

      for (const t of this.tickers) t(dt, total);

      if (this.currentCamera) {
        this.renderer.render(this.scene, this.currentCamera);
      }
    };
    loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  /** Release the WebGL context (call on page unload / Vite HMR). */
  dispose(): void {
    this.stop();
    this.tickers.length = 0;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ---------------------------------------------------------------------------
  // Lighting — three-light setup tuned for low-poly flat-shaded geometry.
  // ---------------------------------------------------------------------------
  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xececf0, 0x8a8a92, 0.72);
    this.scene.add(hemi);

    // Overhead tabletop fill — soft light from above like a desk lamp.
    const overhead = new THREE.DirectionalLight(0xffffff, 0.55);
    overhead.position.set(0, 22, 0);
    this.scene.add(overhead);

    const key = new THREE.DirectionalLight(0xfffaf0, 1.25);
    key.position.set(5, 18, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 50;
    const s = 18;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xc8ccd8, 0.28);
    rim.position.set(-5, 6, -7);
    this.scene.add(rim);
  }

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------
  private handleResize(): void {
    const apply = () => {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      this.renderer.setSize(w, h, false);
    };
    apply();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(apply);
      this.resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener('resize', apply);
    }
  }
}
