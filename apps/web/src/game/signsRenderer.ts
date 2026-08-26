import * as THREE from 'three';
import {
  SIGN_MAX_LINES,
  blockKey,
  chunkCoord,
  chunkKey,
  type SignInfo,
} from '@eternal-blocks/shared';
import type { WorldStore } from './world/worldStore.ts';

/**
 * Renders sign entities (post + text panel) as small individual meshes.
 * Text is drawn with canvas fillText - plain text only, no HTML involved.
 */

function renderSignTexture(sign: SignInfo): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const g = canvas.getContext('2d')!;

  // Wood panel background.
  const grad = g.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, '#d9b277');
  grad.addColorStop(1, '#c69a5f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = 'rgba(74,50,26,0.55)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 154);

  // Text lines - plain fillText only (XSS-safe by construction).
  const lines = sign.text.split('\n').slice(0, SIGN_MAX_LINES);
  g.fillStyle = '#3a2a18';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 30px system-ui, sans-serif';
  const startY = 80 - ((lines.length - 1) * 38) / 2;
  lines.forEach((line, i) => {
    g.fillText(line, 128, startY + i * 38);
  });

  if (sign.authorName) {
    g.font = '500 17px system-ui, sans-serif';
    g.fillStyle = 'rgba(58,42,24,0.65)';
    g.textAlign = 'right';
    g.fillText(`- ${sign.authorName.slice(0, 18)}`, 244, 146);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const POST_MATERIAL = new THREE.MeshLambertMaterial({ color: '#8a6234' });
const PANEL_SIDE_MATERIAL = new THREE.MeshLambertMaterial({ color: '#c69a5f' });

export class SignsRenderer {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.Group>();

  constructor(private world: WorldStore) {}

  /** Sync rendered signs against world state for the given loaded chunk. */
  syncChunk(cx: number, cz: number): void {
    const wanted = new Set<string>();
    for (const [key, sign] of this.world.signs) {
      if (chunkCoord(sign.x) === cx && chunkCoord(sign.z) === cz) {
        wanted.add(key);
        if (!this.meshes.has(key)) this.add(sign);
      }
    }
    for (const [key, mesh] of [...this.meshes]) {
      if (chunkCoord((mesh.userData as { sign: SignInfo }).sign.x) === cx && chunkCoord((mesh.userData as { sign: SignInfo }).sign.z) === cz && !wanted.has(key)) {
        this.remove(key);
      }
    }
  }

  upsert(sign: SignInfo): void {
    this.world.upsertSign(sign);
    const key = blockKey(sign.x, sign.y, sign.z);
    this.remove(key);
    this.add(sign);
  }

  removeAt(x: number, y: number, z: number): void {
    this.world.removeSign(x, y, z);
    this.remove(blockKey(x, y, z));
  }

  private add(sign: SignInfo): void {
    const group = new THREE.Group();

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), POST_MATERIAL);
    post.position.set(0, 0.48, 0);
    post.castShadow = true;
    group.add(post);

    const tex = renderSignTexture(sign);
    const panelMat = new THREE.MeshLambertMaterial({ map: tex });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.62, 0.07), [
      PANEL_SIDE_MATERIAL,
      PANEL_SIDE_MATERIAL,
      PANEL_SIDE_MATERIAL,
      PANEL_SIDE_MATERIAL,
      panelMat,
      panelMat,
    ]);
    panel.position.set(0, 0.82, 0.075);
    panel.castShadow = true;
    group.add(panel);

    // Pivot at the cell center so rotation keeps the sign inside its cell.
    group.position.set(sign.x + 0.5, sign.y, sign.z + 0.5);
    group.rotation.y = -((sign.rot ?? 0) % 4) * (Math.PI / 2);
    group.userData.sign = sign;
    this.group.add(group);
    this.meshes.set(blockKey(sign.x, sign.y, sign.z), group);
  }

  remove(key: string): void {
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((mm) => {
          const mat = mm as THREE.MeshLambertMaterial;
          mat.map?.dispose();
          mat.dispose();
        });
      }
    });
    this.meshes.delete(key);
  }

  get(x: number, y: number, z: number): SignInfo | undefined {
    return this.world.signs.get(blockKey(x, y, z));
  }

  clearAll(): void {
    for (const key of [...this.meshes.keys()]) this.remove(key);
  }

  /** Re-sync every loaded chunk's signs (after resync). */
  resyncAll(): void {
    this.clearAll();
    const chunks = new Set<string>();
    for (const sign of this.world.signs.values()) {
      chunks.add(chunkKey(chunkCoord(sign.x), chunkCoord(sign.z)));
    }
    for (const key of chunks) {
      const comma = key.indexOf(',');
      this.syncChunk(Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
    }
  }
}
