import * as THREE from 'three';
import { hashString, lerpAngle } from '@eternal-blocks/shared';
import type { PlayerRosterEntry } from '@eternal-blocks/shared';

/**
 * Remote player rendering: simple original voxel avatars with smoothed
 * position/rotation interpolation and a plain-text name sprite.
 */

const INTERP_RATE = 14;

interface RemoteState {
  group: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  current: THREE.Vector3;
  target: THREE.Vector3;
  yawCurrent: number;
  yawTarget: number;
  walkPhase: number;
  lastSpeed: number;
  hasPosition: boolean;
}

function colorFromId(id: string): { primary: string; secondary: string } {
  const h = hashString(id);
  const hue = (h % 360) / 360;
  const c1 = new THREE.Color().setHSL(hue, 0.62, 0.56);
  const c2 = new THREE.Color().setHSL((hue + 0.55) % 1, 0.45, 0.42);
  return { primary: `#${c1.getHexString()}`, secondary: `#${c2.getHexString()}` };
}

function makeNameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(8,13,22,0.62)';
  const r = 16;
  g.beginPath();
  g.roundRect(4, 4, 248, 56, r);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 2;
  g.stroke();
  // Plain text only - never innerHTML - so nicknames cannot inject markup.
  g.font = '600 28px system-ui, sans-serif';
  g.fillStyle = '#eef4fb';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name.slice(0, 20), 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.9, 0.48, 1);
  sprite.position.y = 2.2;
  return sprite;
}

function buildAvatar(primary: string, secondary: string): { group: THREE.Group; legL: THREE.Mesh; legR: THREE.Mesh } {
  const group = new THREE.Group();

  const matP = new THREE.MeshLambertMaterial({ color: primary });
  const matS = new THREE.MeshLambertMaterial({ color: secondary });

  // Legs pivot from the hip for a walk swing.
  const legGeo = new THREE.BoxGeometry(0.22, 0.52, 0.24);
  legGeo.translate(0, -0.26, 0);
  const legL = new THREE.Mesh(legGeo, matS);
  legL.position.set(-0.14, 1.02, 0);
  const legR = new THREE.Mesh(legGeo.clone(), matS);
  legR.position.set(0.14, 1.02, 0);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.34), matP);
  torso.position.y = 1.35;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.42), matP);
  head.position.y = 1.92;

  // Simple original face: two eyes + visor stripe on the front (+z) side.
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#101820' });
  const eyeGeo = new THREE.BoxGeometry(0.07, 0.09, 0.02);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 1.96, 0.215);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.1, 1.96, 0.215);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: '#7ce38b' }));
  visor.position.set(0, 1.84, 0.215);

  group.add(legL, legR, torso, head, eyeL, eyeR, visor);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  return { group, legL, legR };
}

export class RemotePlayers {
  readonly group = new THREE.Group();
  private players = new Map<string, RemoteState>();

  applyRoster(entries: PlayerRosterEntry[]): void {
    for (const e of entries) this.join(e.id, e.name);
  }

  join(id: string, name: string): void {
    if (this.players.has(id)) return;
    const colors = colorFromId(id);
    const { group, legL, legR } = buildAvatar(colors.primary, colors.secondary);
    group.add(makeNameSprite(name));
    group.visible = false; // hidden until first position arrives
    this.group.add(group);
    this.players.set(id, {
      group,
      legL,
      legR,
      current: new THREE.Vector3(),
      target: new THREE.Vector3(),
      yawCurrent: 0,
      yawTarget: 0,
      walkPhase: 0,
      lastSpeed: 0,
      hasPosition: false,
    });
  }

  leave(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.group.remove(p.group);
    p.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        o.geometry?.dispose?.();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      }
    });
    this.players.delete(id);
  }

  onState(id: string, x: number, y: number, z: number, yaw: number, pitch: number): void {
    const p = this.players.get(id);
    if (!p) return;
    if (!p.hasPosition) {
      p.current.set(x, y, z);
      p.yawCurrent = yaw;
      p.hasPosition = true;
      p.group.visible = true;
    }
    p.target.set(x, y, z);
    p.yawTarget = yaw;
    void pitch;
  }

  clear(): void {
    for (const id of [...this.players.keys()]) this.leave(id);
  }

  get count(): number {
    return this.players.size;
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-INTERP_RATE * dt);
    for (const p of this.players.values()) {
      if (!p.hasPosition) continue;
      const prevX = p.current.x;
      const prevZ = p.current.z;
      p.current.lerp(p.target, k);
      p.yawCurrent = lerpAngle(p.yawCurrent, p.yawTarget, k);
      p.group.position.copy(p.current);
      p.group.rotation.y = p.yawCurrent;

      const speed = Math.hypot(p.current.x - prevX, p.current.z - prevZ) / Math.max(dt, 1e-4);
      p.lastSpeed += (speed - p.lastSpeed) * Math.min(1, dt * 8);
      p.walkPhase += dt * Math.min(12, p.lastSpeed * 2.6);
      const swing = Math.sin(p.walkPhase) * Math.min(0.65, p.lastSpeed * 0.09);
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
    }
  }
}
