// The ferrofluid avatar renderer (ported from prototype/ferrofluid/index.html).
// A sphere is pushed outward by cone-shaped spikes in a vertex shader; each spike's
// height is a damped spring, and a "magnet" that follows the pointer raises the
// spikes facing it.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MAX_SPIKES, spikeDirections, type Shape } from "./params";

export type FerrofluidOptions = {
  interactive?: boolean; // drag to spin, pointer moves the magnet
  /** Shift the blob within the canvas: x in px (positive = right), y as a fraction of height (positive = up). */
  offset?: () => { x: number; y: number };
  /** Camera distance multiplier for small or busy layouts. */
  distance?: number;
};

export class Ferrofluid {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private controls: OrbitControls | null = null;
  private material: THREE.MeshPhysicalMaterial;
  private blob: THREE.Mesh;
  private uniforms = {
    uSpikes: { value: Array.from({ length: MAX_SPIKES }, () => new THREE.Vector4()) },
    uCount: { value: 0 },
    uSharp: { value: 2 },
    uCosR: { value: 0.8 },
    uTime: { value: 0 },
    uWobble: { value: 0 },
  };
  private shape: Shape | null = null;
  private dirs: THREE.Vector3[] = [];
  private heights: number[] = [];
  private velocities: number[] = [];
  private magnetOn = false;
  private magnetDir = new THREE.Vector3(0, 1, 0);
  private pointer = new THREE.Vector2(0, 0.5);
  private clock = new THREE.Clock();
  private ray = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private frameId = 0;
  private resizeObserver: ResizeObserver;

  constructor(private container: HTMLElement, private opts: FerrofluidOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = opts.interactive ? "none" : "auto";
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.camera.position.set(0, 0, 6.5);

    if (opts.interactive) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.enablePan = false;
      this.controls.enableZoom = false;
      const onPointer = (e: PointerEvent) => {
        const r = this.renderer.domElement.getBoundingClientRect();
        this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      };
      this.renderer.domElement.addEventListener("pointermove", onPointer);
      this.renderer.domElement.addEventListener("pointerdown", onPointer);
    }

    this.material = new THREE.MeshPhysicalMaterial({ metalness: 0.85, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          uniform vec4 uSpikes[${MAX_SPIKES}];
          uniform int uCount;
          uniform float uSharp, uCosR, uTime, uWobble;
          float disp(vec3 d) {
            float r = 1.0 + uWobble * 0.03 * sin(5.0 * d.x + uTime * 1.3) * sin(4.0 * d.y + uTime * 1.1) * sin(6.0 * d.z + uTime * 0.9);
            for (int i = 0; i < ${MAX_SPIKES}; i++) {
              if (i >= uCount) break;
              float t = max(0.0, (dot(d, uSpikes[i].xyz) - uCosR) / (1.0 - uCosR));
              r += uSpikes[i].w * pow(t, uSharp);
            }
            return r;
          }`)
        .replace("#include <beginnormal_vertex>", `
          vec3 sd = normalize(position);
          vec3 st1 = normalize(cross(sd, abs(sd.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 st2 = cross(sd, st1);
          vec3 sp0 = sd * disp(sd);
          vec3 sa = normalize(sd + st1 * 0.003); vec3 sp1 = sa * disp(sa);
          vec3 sb = normalize(sd + st2 * 0.003); vec3 sp2 = sb * disp(sb);
          vec3 objectNormal = normalize(cross(sp1 - sp0, sp2 - sp0));`)
        .replace("#include <begin_vertex>", "vec3 transformed = sp0;");
    };
    this.blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 96), this.material);
    this.scene.add(this.blob);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);
    this.fit();
    this.loop();
  }

  setShape(shape: Shape): void {
    const layoutChanged = !this.shape || this.shape.seed !== shape.seed || this.shape.count !== shape.count;
    this.shape = shape;
    if (layoutChanged) {
      const old = this.heights;
      this.dirs = spikeDirections(shape.count, shape.seed).map(([x, y, z]) => new THREE.Vector3(x, y, z));
      this.heights = this.dirs.map((_, i) => old[i] ?? 0);
      this.velocities = this.dirs.map(() => 0);
    }
    this.material.color.set(shape.color);
    this.uniforms.uSharp.value = 0.6 + shape.sharp * 3.4;
    this.uniforms.uCosR.value = Math.cos(0.12 + shape.width * 0.5);
  }

  setMagnet(on: boolean): void {
    this.magnetOn = on;
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.controls?.dispose();
    this.blob.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private fit(): void {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.position.setLength(Math.max(6.5, 5.5 / aspect) * (this.opts.distance ?? 1));
    const off = this.opts.offset?.() ?? { x: 0, y: 0 };
    this.camera.setViewOffset(w, h, -off.x, off.y * h, w, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + "px";
    this.renderer.domElement.style.height = h + "px";
  }

  private targetHeight(dir: THREE.Vector3): number {
    const s = this.shape!;
    const base = s.length * 0.9;
    if (!this.magnetOn) return base * 0.15;
    const facing = Math.max(0, dir.dot(this.magnetDir));
    return base * (0.2 + 0.8 * Math.pow(facing, 0.5 + s.focus * 8)) * 1.6;
  }

  /** Advance the physics by dt seconds. */
  step(dt: number): void {
    this.uniforms.uTime.value += dt;
    if (!this.shape) return;
    if (!this.controls) this.blob.rotation.y += dt * 0.25;

    // Magnet sits where the pointer ray passes closest to the blob, in the blob's own frame.
    this.ray.setFromCamera(this.pointer, this.camera);
    this.ray.ray.closestPointToPoint(new THREE.Vector3(), this.tmp);
    if (this.tmp.lengthSq() < 1e-6) this.tmp.copy(this.ray.ray.direction).negate();
    this.blob.worldToLocal(this.tmp);
    this.magnetDir.lerp(this.tmp.normalize(), 0.15).normalize();

    // Thick fluid = heavy damping, slow and smooth. Thin fluid = springy and wobbly.
    const stiffness = 60;
    const damping = 2 + this.shape.visc * 22;
    let motion = 0;
    for (let i = 0; i < this.dirs.length; i++) {
      const a = stiffness * (this.targetHeight(this.dirs[i]) - this.heights[i]) - damping * this.velocities[i];
      this.velocities[i] += a * dt;
      this.heights[i] += this.velocities[i] * dt;
      motion += Math.abs(this.velocities[i]);
      const d = this.dirs[i];
      this.uniforms.uSpikes.value[i].set(d.x, d.y, d.z, Math.max(0, this.heights[i]));
    }
    this.uniforms.uCount.value = this.dirs.length;
    this.uniforms.uWobble.value = 0.4 + Math.min(motion / Math.max(this.dirs.length, 1), 2);
  }

  private loop = (): void => {
    this.step(Math.min(this.clock.getDelta(), 1 / 30));
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.loop);
  };
}
