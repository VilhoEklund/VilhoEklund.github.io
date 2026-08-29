import * as THREE from 'three';
import {
  BlockId,
  CHUNK_SIZE,
  POS_SEND_INTERVAL_MS,
  TerrainGenerator,
  WORLD_HEIGHT,
  type PlayerRosterEntry,
  type ServerMessage,
} from '@eternal-blocks/shared';
import { buildAtlas, type AtlasResult } from './textures.ts';
import { WorldStore } from './world/worldStore.ts';
import { ChunkManager } from './world/chunkManager.ts';
import { LocalPlayer, Input } from './player.ts';
import { Interaction } from './interaction.ts';
import { RemotePlayers } from './remotePlayers.ts';
import { SignsRenderer } from './signsRenderer.ts';
import { NetClient } from '../net/connection.ts';
import { Hud } from '../ui/hud.ts';
import type { Settings } from '../identity.ts';

export interface GameHooks {
  onStatus(status: 'ok' | 'wait' | 'bad', label: string): void;
  onProgress(fraction: number | null, label?: string): void;
  onFirstSyncDone(): void;
  onFatal(message: string): void;
  onHelpToggle(): boolean; // returns new open state
}

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  settings: Settings;
  serverUrl: string;
  selfId: string;
  selfName: string;
  hooks: GameHooks;
  e2e: boolean;
}

const SKY_COLOR = 0x8ec9f2;

/**
 * Client game orchestrator: rendering, world sync, physics and UI glue.
 */
export class Game {
  readonly hud: Hud;
  readonly net: NetClient;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private atlas: AtlasResult;

  /** Public handles for UI glue in main.ts. */
  world!: WorldStore;
  chunks!: ChunkManager;
  player!: LocalPlayer;
  interaction!: Interaction;
  signsR!: SignsRenderer;

  private input = new Input();
  private remotes = new RemotePlayers();

  private sun!: THREE.DirectionalLight;
  private clouds!: THREE.InstancedMesh;
  private cloudVel = 1.4;
  private highlight!: THREE.LineSegments;

  private playing = false;
  private locked = false;
  private initialLoading = false;
  private hadWelcome = false;
  private expectedChunks = 0;
  private receivedChunks = 0;
  private lastPosSend = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsValue = 60;
  private disposed = false;
  private spawnPoint = { x: 8.5, y: 40, z: 8.5 };

  private readonly settings: Settings;
  private fixedAccum = 0;

  private get hooks(): GameHooks {
    return this.opts.hooks;
  }

  constructor(private readonly opts: GameOptions) {
    this.settings = opts.settings;

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      600,
    );
    this.scene.background = new THREE.Color(SKY_COLOR);

    this.atlas = buildAtlas();
    this.hud = new Hud(this.atlas);
    this.opts.uiRoot.appendChild(this.hud.root);
    this.hud.onHotbarSelect = (slot) => {
      if (this.interaction) this.interaction.selectedSlot = slot;
    };
    // Created eagerly (not in connect()) so UI glue can subscribe to net
    // events immediately after construction, before the socket opens.
    this.net = new NetClient(opts.serverUrl);

    this.setupEnvironment();
    this.attachInput();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.renderer.setAnimationLoop(this.frame);
  }

  // ---------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------

  private setupEnvironment(): void {
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x7d9464, 0.95);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff3d9, 1.5);
    this.sun.position.set(60, 100, 40);
    this.sun.castShadow = this.settings.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -56;
    cam.right = 56;
    cam.top = 56;
    cam.bottom = -56;
    cam.near = 10;
    cam.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const rd = this.settings.renderDistance;
    this.scene.fog = new THREE.Fog(SKY_COLOR, rd * CHUNK_SIZE * 0.55, rd * CHUNK_SIZE * 1.02);
    this.camera.far = Math.max(400, rd * CHUNK_SIZE * 1.5);
    this.camera.updateProjectionMatrix();

    // Drifting clouds for a bit of life in the sky.
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const count = 34;
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const sx = 8 + Math.random() * 16;
      const sy = 1.6 + Math.random() * 1.6;
      const sz = 6 + Math.random() * 12;
      m.makeScale(sx, sy, sz);
      m.setPosition(
        (Math.random() - 0.5) * 340,
        WORLD_HEIGHT + 14 + Math.random() * 12,
        (Math.random() - 0.5) * 340,
      );
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    this.clouds.renderOrder = 1;
    this.scene.add(this.clouds);

    // Target-block highlight.
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    const hlMat = new THREE.LineBasicMaterial({
      color: 0x10141c,
      transparent: true,
      opacity: 0.55,
    });
    this.highlight = new THREE.LineSegments(hlGeo, hlMat);
    this.highlight.visible = false;
    this.scene.add(this.highlight);
  }

  private attachInput(): void {
    const canvas = this.opts.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    canvas.addEventListener('click', this.onCanvasClick);
    window.addEventListener('keyup', this.onKeyUp);
    this.input.attach(window);
    this.input.setKeyPressHandler(this.onKeyPress);
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') hidePlayerListHold();
  };

  // ---------------------------------------------------------------
  // Networking / world lifecycle
  // ---------------------------------------------------------------

  connect(helloPayloadName: string, playerId: string): void {
    const net = this.net;
    if (!this.opts.serverUrl) {
      const generator = TerrainGenerator.fromSeedString('eternal-blocks-local-v1');
      this.startWorld(generator.seed, generator.findSpawn(), []);
      this.hooks.onStatus('ok', 'Local');
      this.finishInitialLoad();
      return;
    }
    net.events.on('message', (msg) => this.onServerMessage(msg));
    net.events.on('state', ({ state }) => {
      if (!this.playing) return;
      if (state === 'connected') this.hooks.onStatus('ok', 'Online');
      else if (state === 'connecting') this.hooks.onStatus('wait', 'Connecting…');
      else if (state === 'waiting-retry') this.hooks.onStatus('bad', 'Reconnecting…');
      else this.hooks.onStatus('bad', 'Offline');
    });
    net.connect({ name: helloPayloadName, playerId });
  }

  private onServerMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome': {
        this.startWorld(
          msg.seed,
          msg.spawn,
          msg.players.filter((p) => p.id !== msg.playerId),
        );
        this.hadWelcome = true;
        break;
      }
      case 'syncStart':
        this.expectedChunks = Math.max(1, msg.chunks.length);
        this.receivedChunks = 0;
        break;
      case 'chunk': {
        this.world.applySnapshot(msg.cx, msg.cz, msg.overrides, msg.signs);
        this.receivedChunks++;
        if (this.initialLoading && this.expectedChunks > 0) {
          this.hooks.onProgress(
            Math.min(0.98, this.receivedChunks / this.expectedChunks),
            `syncing world ${this.receivedChunks}/${this.expectedChunks}`,
          );
        }
        break;
      }
      case 'syncDone':
        if (this.initialLoading) {
          this.initialLoading = false;
          this.finishInitialLoad();
        }
        break;
      case 'pjoin':
        this.remotes.join(msg.id, msg.name);
        this.hud.pushSystem(`${msg.name} joined the world`);
        this.hud.setOnline(this.remotes.count + 1);
        break;
      case 'pleave': {
        this.remotes.leave(msg.id);
        this.hud.setOnline(this.remotes.count + 1);
        break;
      }
      case 'ps':
        if (msg.id !== this.opts.selfId)
          this.remotes.onState(msg.id, msg.x, msg.y, msg.z, msg.yaw, msg.pitch);
        break;
      case 'blockApplied':
        this.interaction.onBlockApplied(msg);
        break;
      case 'signApplied':
        this.interaction.onSignApplied(msg);
        break;
      case 'chatMsg': {
        const self = msg.from.id === this.opts.selfId;
        this.hud.pushChat(self ? 'You' : msg.from.name, msg.text, self);
        break;
      }
      case 'error':
        this.onServerError(msg.code, msg.msg, msg.ref);
        break;
      case 'pong':
        break;
    }
  }

  private startWorld(
    seed: number,
    spawn: { x: number; y: number; z: number },
    roster: PlayerRosterEntry[],
  ): void {
    const isResync = this.hadWelcome || this.playing;

    if (isResync) {
      this.world.resetForResync();
      this.remotes.clear();
      this.signsR.clearAll();
      this.interaction.dropPending();
    }

    if (!isResync) {
      this.world = new WorldStore(seed);
      const materials = {
        opaque: new THREE.MeshLambertMaterial({
          map: this.atlas.texture,
          vertexColors: true,
          alphaTest: 0.5,
        }),
        water: new THREE.MeshLambertMaterial({
          map: this.atlas.texture,
          vertexColors: true,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }),
      };
      this.chunks = new ChunkManager(
        this.world,
        materials,
        this.settings.shadows,
        this.settings.renderDistance,
      );
      this.scene.add(this.chunks.group);
      this.player = new LocalPlayer(this.world);
      this.signsR = new SignsRenderer(this.world);
      this.scene.add(this.signsR.group);
      this.scene.add(this.remotes.group);
      this.interaction = new Interaction(
        this.world,
        this.net,
        this.signsR,
        this.player,
        {
          toast: (m, k) => this.hud.toast(m, k),
          markDirty: (x, y, z) => this.chunks.markDirtyAt(x, y, z),
          onSignPlaced: (cell) => {
            this.releasePointerForModal();
            const sign = this.world.signs.get(`${cell.x},${cell.y},${cell.z}`);
            signModalHost?.(cell, 'create', sign);
          },
        },
        {
          localOnly: !this.opts.serverUrl,
          playerId: this.opts.selfId,
          playerName: this.opts.selfName,
        },
      );
      this.hud.selectSlot(0);
    }

    this.spawnPoint = spawn;
    this.player.teleport(spawn.x, spawn.y, spawn.z);
    this.remotes.applyRoster(roster);
    this.hud.setOnline(this.remotes.count + 1);
    this.playing = true;
    this.initialLoading = true;
    this.expectedChunks = 0;

    // Announce position immediately so the server subscribes us around here.
    this.sendPositionNow();

    if (isResync) {
      this.hooks.onProgress(null);
      this.hooks.onStatus('ok', 'Online');
      this.hud.toast('Reconnected - resyncing world…', 'info');
      this.interaction.flushPending();
    }
  }

  private finishInitialLoad(): void {
    this.chunks.markAllForRebuild();
    this.signsR.resyncAll();
    // Wait until nearby meshes exist before revealing the world.
    const waitMeshes = (): void => {
      if (this.disposed) return;
      this.chunks.update(this.player.pos.x, this.player.pos.z);
      const p = this.chunks.progress();
      const frac = p.total === 0 ? 1 : p.done / p.total;
      if (!this.chunks.hasPendingInitialLoad()) {
        this.hooks.onProgress(1, 'done');
        window.setTimeout(() => this.hooks.onProgress(null), 150);
        this.hooks.onFirstSyncDone();
        this.interaction.flushPending();
      } else {
        this.hooks.onProgress(frac * 0.98, `building terrain ${p.done}/${p.total}`);
        requestAnimationFrame(waitMeshes);
      }
    };
    waitMeshes();
  }

  private onServerError(code: string, message: string, ref?: string): void {
    if (code === 'banned' || code === 'world_locked') {
      this.net.close();
      this.hooks.onFatal(message);
      return;
    }
    this.interaction.onError(code, ref);
  }

  // ---------------------------------------------------------------
  // Input handling
  // ---------------------------------------------------------------

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private get modalOrMenuOpen(): boolean {
    return pauseMenuIsOpen() || helpIsOpen() || signModalIsOpen();
  }

  private onCanvasClick = (): void => {
    if (!this.playing || this.locked || this.modalOrMenuOpen) return;
    this.requestLock();
  };

  requestLock(): void {
    const p = this.opts.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  }

  releasePointerForModal(): void {
    if (document.pointerLockElement === this.opts.canvas) document.exitPointerLock();
  }

  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.opts.canvas;
    if (!this.playing) return;
    if (!this.locked) {
      if (hudChatOpen()) {
        // Esc during chat closes chat; pause menu takes over.
        forceCloseChatInput();
      }
      if (!this.modalOrMenuOpen) {
        pauseMenuShow();
      }
    } else {
      pauseMenuHide();
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.input.mouseDX += e.movementX;
    this.input.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    this.hud.cycleSlot(e.deltaY > 0 ? 1 : -1);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.locked || !this.playing) return;
    const eye = this.player.eyePosition();
    const look = this.player.lookDirection();
    const hit = this.interaction.targetFromCamera(eye, look);
    if (!hit) return;
    if (e.button === 0) {
      this.interaction.tryBreak(hit);
    } else if (e.button === 2) {
      if (this.world.getBlock(hit.x, hit.y, hit.z) === BlockId.Sign) {
        this.releasePointerForModal();
        const sign = this.signsR.get(hit.x, hit.y, hit.z);
        signModalHost?.({ x: hit.x, y: hit.y, z: hit.z }, sign ? 'view' : 'create', sign);
        return;
      }
      this.interaction.tryPlace(hit);
    }
  };

  private onKeyPress = (code: string): void => {
    if (!this.playing) return;
    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5));
      this.hud.selectSlot(n === 0 ? 9 : n - 1);
      return;
    }
    if (code === 'KeyT' && !hudChatOpen() && this.locked) {
      openChatInput();
      return;
    }
    if (code === 'Tab') {
      showPlayerListHold();
      return;
    }
    if (code === 'KeyH') {
      this.hooks.onHelpToggle();
      return;
    }
  };

  // ---------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------

  private frame = (): void => {
    if (this.disposed) return;
    const dt = Math.min(0.1, this.clock.getDelta());

    this.net?.watchdogTick();

    if (this.playing) {
      this.stepSimulation(dt);
    }

    this.animateClouds(dt);
    this.updateFpsMeter(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private stepSimulation(dt: number): void {
    const active = this.locked && !this.modalOrMenuOpen;

    if (active) {
      const { dx, dy } = this.input.takeMouseDelta();
      if (dx !== 0 || dy !== 0) this.player.applyLook(dx, dy, this.settings.sensitivity);
      this.fixedAccum = Math.min(this.fixedAccum + dt, 0.25);
      const stepDt = 1 / 120;
      while (this.fixedAccum >= stepDt) {
        this.player.step(stepDt, this.input.state());
        this.fixedAccum -= stepDt;
      }
    } else {
      this.input.takeMouseDelta();
    }

    // Camera follows eye position.
    const eye = this.player.eyePosition();
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);

    // Sun follows player (quantized to reduce shadow shimmer).
    const qx = Math.round(eye.x / 4) * 4;
    const qz = Math.round(eye.z / 4) * 4;
    this.sun.position.set(qx + 60, eye.y + 90, qz + 40);
    this.sun.target.position.set(qx, eye.y, qz);
    this.sun.target.updateMatrixWorld();

    this.chunks.update(this.player.pos.x, this.player.pos.z);
    this.remotes.update(dt);

    // Block highlight.
    if (active) {
      const look = this.player.lookDirection();
      const hit = this.interaction.targetFromCamera(eye, look);
      if (hit) {
        this.highlight.visible = true;
        this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      } else {
        this.highlight.visible = false;
      }
    } else {
      this.highlight.visible = false;
    }

    // Position updates at a bounded rate.
    const now = performance.now();
    if (now - this.lastPosSend >= POS_SEND_INTERVAL_MS) {
      this.lastPosSend = now;
      this.sendPositionNow();
    }
  }

  private sendPositionNow(): void {
    if (!this.playing || !this.net) return;
    this.net.send({
      t: 'pos',
      x: round2(this.player.pos.x),
      y: round2(this.player.pos.y),
      z: round2(this.player.pos.z),
      yaw: round3(this.player.yaw),
      pitch: round3(this.player.pitch),
    });
  }

  private animateClouds(dt: number): void {
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.clouds.count; i++) {
      this.clouds.getMatrixAt(i, m);
      const pos = new THREE.Vector3().setFromMatrixPosition(m);
      pos.x += this.cloudVel * dt;
      const relX = pos.x - this.camera.position.x;
      if (relX > 180) pos.x -= 360;
      if (relX < -180) pos.x += 360;
      m.setPosition(pos);
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  private updateFpsMeter(dt: number): void {
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.4) {
      this.fpsValue = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      if (this.playing) {
        const p = this.player.pos;
        this.hud.setCoords(p.x, p.y, p.z, this.fpsValue);
      }
    }
  }

  // ---------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------

  applySettings(s: Settings): void {
    Object.assign(this.settings, s);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.chunks?.setRenderDistance(s.renderDistance);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = s.renderDistance * CHUNK_SIZE * 0.55;
      fog.far = s.renderDistance * CHUNK_SIZE * 1.02;
    }
    this.sun.castShadow = s.shadows;
    if (this.chunks) {
      for (const child of this.chunks.group.children) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = s.shadows;
        mesh.receiveShadow = s.shadows;
      }
    }
  }

  // ---------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    const canvas = this.opts.canvas;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('click', this.onCanvasClick);
    this.input.detach(window);
    this.net?.close();
    this.chunks?.dispose();
    this.renderer.dispose();
    this.hud.root.remove();
  }

  /** Expose internals for automated end-to-end checks (opt-in via ?__e2e__). */
  exposeE2E(): void {
    const game = this;
    window.__EB__ = {
      get game() {
        return game;
      },
      get world() {
        return game.world;
      },
      get net() {
        return game.net;
      },
      get player() {
        return game.player;
      },
      get interaction() {
        return game.interaction;
      },
      get chunks() {
        return game.chunks;
      },
      hud: this.hud,
    };
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// Late-bound UI bridges set by main.ts (avoids circular imports).
type SignHost = (
  cell: { x: number; y: number; z: number },
  mode: 'create' | 'edit' | 'view',
  sign?: import('@eternal-blocks/shared').SignInfo,
) => void;
let signModalHost: SignHost | null = null;
export function registerSignModalHost(fn: SignHost | null): void {
  signModalHost = fn;
}
let pauseMenuIsOpen = (): boolean => false;
let pauseMenuShow = (): void => {};
let pauseMenuHide = (): void => {};
let helpIsOpen = (): boolean => false;
let hudChatOpen = (): boolean => false;
let openChatInput = (): void => {};
let forceCloseChatInput = (): void => {};
let showPlayerListHold = (): void => {};
let hidePlayerListHold = (): void => {};
let signModalIsOpen = (): boolean => false;
export function registerUiBridges(b: {
  pauseIsOpen: typeof pauseMenuIsOpen;
  pauseShow: typeof pauseMenuShow;
  pauseHide: typeof pauseMenuHide;
  helpIsOpen: typeof helpIsOpen;
  chatOpen: typeof hudChatOpen;
  chatOpenInput: typeof openChatInput;
  chatForceClose: typeof forceCloseChatInput;
  showPlayerList: typeof showPlayerListHold;
  hidePlayerList: typeof hidePlayerListHold;
  signIsOpen: typeof signModalIsOpen;
}): void {
  pauseMenuIsOpen = b.pauseIsOpen;
  pauseMenuShow = b.pauseShow;
  pauseMenuHide = b.pauseHide;
  helpIsOpen = b.helpIsOpen;
  hudChatOpen = b.chatOpen;
  openChatInput = b.chatOpenInput;
  forceCloseChatInput = b.chatForceClose;
  showPlayerListHold = b.showPlayerList;
  hidePlayerListHold = b.hidePlayerList;
  signModalIsOpen = b.signIsOpen;
}

declare global {
  interface Window {
    __EB__?: unknown;
  }
}
