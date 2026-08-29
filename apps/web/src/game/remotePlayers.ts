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
  armL: THREE.Group;
  armR: THREE.Group;
  current: THREE.Vector3;
  target: THREE.Vector3;
  yawCurrent: number;
  yawTarget: number;
  walkPhase: number;
  lastSpeed: number;
  hasPosition: boolean;
}

interface AvatarPalette {
  primary: string;
  secondary: string;
  skin: string;
}

function colorFromId(id: string): AvatarPalette {
  const h = hashString(id);
  const hue = (h % 360) / 360;
  const c1 = new THREE.Color().setHSL(hue, 0.62, 0.56);
  const c2 = new THREE.Color().setHSL((hue + 0.55) % 1, 0.45, 0.42);
  const skinTones = ['#f2c6a5', '#ddb08c', '#bd835f', '#8f5f43', '#623f2f'];
  return {
    primary: `#${c1.getHexString()}`,
    secondary: `#${c2.getHexString()}`,
    skin: skinTones[(h >>> 9) % skinTones.length]!,
  };
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

export interface AvatarParts {
  group: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
}

/** Build an original blocky humanoid facing local -Z (the camera's yaw-zero direction). */
export function buildAvatar(primary: string, secondary: string, skin: string): AvatarParts {
  const group = new THREE.Group();

  const matP = new THREE.MeshLambertMaterial({ color: primary });
  const matS = new THREE.MeshLambertMaterial({ color: secondary });
  const matSkin = new THREE.MeshLambertMaterial({ color: skin });
  const matBoot = new THREE.MeshLambertMaterial({ color: '#202733' });
  const matHair = new THREE.MeshLambertMaterial({ color: '#30251f' });

  // Legs pivot from the hip for a walk swing.
  const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.26);
  legGeo.translate(0, -0.36, 0);
  const legL = new THREE.Mesh(legGeo, matS);
  legL.name = 'leg-left';
  legL.position.set(-0.15, 0.72, 0);
  const legR = new THREE.Mesh(legGeo.clone(), matS);
  legR.name = 'leg-right';
  legR.position.set(0.15, 0.72, 0);

  const bootGeo = new THREE.BoxGeometry(0.245, 0.16, 0.3);
  const bootL = new THREE.Mesh(bootGeo, matBoot);
  bootL.position.set(0, -0.64, -0.02);
  const bootR = new THREE.Mesh(bootGeo.clone(), matBoot);
  bootR.position.copy(bootL.position);
  legL.add(bootL);
  legR.add(bootR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), matP);
  torso.name = 'torso';
  torso.position.y = 1.08;
  const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.025), matS);
  shirtPanel.position.set(0, 1.13, -0.192);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.38), matS);
  belt.position.y = 0.76;

  const makeArm = (name: string, x: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.name = name;
    arm.position.set(x, 1.42, 0);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.23), matP);
    sleeve.position.y = -0.25;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.22), matSkin);
    hand.position.y = -0.59;
    arm.add(sleeve, hand);
    return arm;
  };
  const armL = makeArm('arm-left', -0.42);
  const armR = makeArm('arm-right', 0.42);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.44), matSkin);
  head.name = 'head';
  head.position.y = 1.69;
  const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.11, 0.46), matHair);
  hairCap.name = 'hair-cap';
  hairCap.position.y = 1.91;
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.08), matHair);
  hairBack.name = 'hair-back';
  hairBack.position.set(0, 1.74, 0.22);

  // Face details sit on -Z, matching LocalPlayer yaw=0 looking toward -Z.
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: '#f7fbff' });
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#17202a' });
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.08, 0.018);
  const pupilGeo = new THREE.BoxGeometry(0.038, 0.055, 0.012);
  const eyeL = new THREE.Mesh(eyeGeo, eyeWhiteMat);
  eyeL.name = 'face-eye-left';
  eyeL.position.set(-0.11, 1.73, -0.226);
  const eyeR = new THREE.Mesh(eyeGeo.clone(), eyeWhiteMat);
  eyeR.name = 'face-eye-right';
  eyeR.position.set(0.11, 1.73, -0.226);
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
  pupilL.position.set(-0.11, 1.725, -0.238);
  const pupilR = new THREE.Mesh(pupilGeo.clone(), pupilMat);
  pupilR.position.set(0.11, 1.725, -0.238);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.018), pupilMat);
  mouth.name = 'face-mouth';
  mouth.position.set(0, 1.59, -0.228);

  group.add(
    legL,
    legR,
    torso,
    shirtPanel,
    belt,
    armL,
    armR,
    head,
    hairCap,
    hairBack,
    eyeL,
    eyeR,
    pupilL,
    pupilR,
    mouth,
  );
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  return { group, legL, legR, armL, armR };
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
    const { group, legL, legR, armL, armR } = buildAvatar(
      colors.primary,
      colors.secondary,
      colors.skin,
    );
    group.add(makeNameSprite(name));
    group.visible = false; // hidden until first position arrives
    this.group.add(group);
    this.players.set(id, {
      group,
      legL,
      legR,
      armL,
      armR,
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
      p.armL.rotation.x = -swing * 0.65;
      p.armR.rotation.x = swing * 0.65;
    }
  }
}
