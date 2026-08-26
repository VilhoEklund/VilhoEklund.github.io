import { BLOCKS, HOTBAR_BLOCKS } from '@eternal-blocks/shared';
import type { AtlasResult } from '../game/textures.ts';
import { TILE_INDEX, BLOCK_TILES, TILE_PX, ATLAS_COLS } from '../game/textures.ts';

export type ToastKind = 'info' | 'error' | 'good';

/**
 * In-game HUD: crosshair, hotbar, status chip, coordinates, online list,
 * chat log/input and toast notifications. All dynamic strings are inserted
 * via textContent - never innerHTML - so nicknames/chat cannot inject markup.
 */
export class Hud {
  readonly root = document.createElement('div');
  private statusEl!: HTMLDivElement;
  private statusDot!: HTMLSpanElement;
  private statusLabel!: HTMLSpanElement;
  private onlineEl!: HTMLDivElement;
  private coordsEl!: HTMLDivElement;
  private hotbarEl!: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private toastsEl!: HTMLDivElement;
  private playerListEl!: HTMLDivElement;
  private playerListUl!: HTMLUListElement;
  private playerListTitle!: HTMLElement;
  private chatWrap!: HTMLDivElement;
  private chatLog!: HTMLDivElement;
  private chatInput!: HTMLInputElement;

  onHotbarSelect: ((slot: number) => void) | null = null;
  onChatSend: ((text: string) => void) | null = null;

  private selectedSlot = 0;
  private chatOpen = false;
  private history: string[] = [];
  private historyIdx = -1;

  constructor(private atlas: AtlasResult) {
    this.build();
  }

  // ---------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------

  private build(): void {
    this.root.id = 'hud';

    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    crosshair.id = 'crosshair';
    this.root.appendChild(crosshair);

    this.coordsEl = document.createElement('div');
    this.coordsEl.className = 'coords-chip glass';
    this.coordsEl.id = 'coords';
    this.root.appendChild(this.coordsEl);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'status-chip glass clickable';
    this.statusEl.id = 'net-status';
    this.statusDot = document.createElement('span');
    this.statusDot.className = 'server-dot';
    this.statusLabel = document.createElement('span');
    this.statusLabel.textContent = 'Connecting…';
    this.statusEl.append(this.statusDot, this.statusLabel);
    this.root.appendChild(this.statusEl);

    this.onlineEl = document.createElement('div');
    this.onlineEl.className = 'online-chip glass';
    this.onlineEl.id = 'online-chip';
    this.root.appendChild(this.onlineEl);

    this.playerListEl = document.createElement('div');
    this.playerListEl.className = 'player-list glass hidden';
    this.playerListEl.id = 'player-list';
    this.playerListTitle = document.createElement('h3');
    this.playerListUl = document.createElement('ul');
    this.playerListEl.append(this.playerListTitle, this.playerListUl);
    this.root.appendChild(this.playerListEl);

    this.hotbarEl = document.createElement('div');
    this.hotbarEl.className = 'hotbar glass clickable';
    this.hotbarEl.id = 'hotbar';
    HOTBAR_BLOCKS.forEach((blockId, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slot = String(i);
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String((i + 1) % 10);
      const icon = document.createElement('canvas');
      icon.width = TILE_PX;
      icon.height = TILE_PX;
      this.drawBlockIcon(icon, blockId);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = BLOCKS[blockId]?.name ?? '?';
      slot.append(num, icon, label);
      slot.addEventListener('click', () => this.selectSlot(i));
      this.slots.push(slot);
      this.hotbarEl.appendChild(slot);
    });
    this.root.appendChild(this.hotbarEl);

    this.chatWrap = document.createElement('div');
    this.chatWrap.className = 'chat-wrap';
    this.chatWrap.id = 'chat';
    this.chatLog = document.createElement('div');
    this.chatLog.className = 'chat-log';
    const inputRow = document.createElement('div');
    inputRow.className = 'chat-input-row';
    this.chatInput = document.createElement('input');
    this.chatInput.className = 'text-input';
    this.chatInput.maxLength = 200;
    this.chatInput.placeholder = 'Message the world… (Enter to send, Esc to close)';
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text.length > 0) {
          this.history.push(text);
          if (this.history.length > 30) this.history.shift();
          this.onChatSend?.(text);
        }
        this.closeChatInput();
      } else if (e.key === 'Escape') {
        this.closeChatInput();
      } else if (e.key === 'ArrowUp') {
        if (this.history.length > 0) {
          this.historyIdx = Math.max(0, this.historyIdx < 0 ? this.history.length - 1 : this.historyIdx - 1);
          this.chatInput.value = this.history[this.historyIdx] ?? '';
        }
      } else if (e.key === 'ArrowDown') {
        this.historyIdx = this.historyIdx + 1;
        if (this.historyIdx >= this.history.length) {
          this.historyIdx = -1;
          this.chatInput.value = '';
        } else {
          this.chatInput.value = this.history[this.historyIdx] ?? '';
        }
      }
    });
    inputRow.appendChild(this.chatInput);
    this.chatWrap.append(this.chatLog, inputRow);
    this.root.appendChild(this.chatWrap);

    this.toastsEl = document.createElement('div');
    this.toastsEl.className = 'toasts';
    this.toastsEl.id = 'toasts';
    this.root.appendChild(this.toastsEl);
  }

  /** Composite a simple isometric-ish block icon from atlas tiles. */
  private drawBlockIcon(canvas: HTMLCanvasElement, blockId: number): void {
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const tiles = BLOCK_TILES[blockId];
    if (!tiles) return;
    const srcTile = (name: keyof typeof TILE_INDEX): [number, number] => {
      const idx = TILE_INDEX[name];
      return [(idx % ATLAS_COLS) * TILE_PX, Math.floor(idx / ATLAS_COLS) * TILE_PX];
    };
    const [tx, ty] = srcTile(tiles[1]);
    g.drawImage(this.atlas.canvas, tx, ty, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    // Slight top highlight for depth.
    const [ttx, tty] = srcTile(tiles[0]);
    g.globalAlpha = 0.85;
    g.drawImage(this.atlas.canvas, ttx, tty, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX * 0.34);
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------
  // Behavior
  // ---------------------------------------------------------------

  selectSlot(slot: number): void {
    this.selectedSlot = slot % HOTBAR_BLOCKS.length;
    this.slots.forEach((el, i) => el.classList.toggle('selected', i === this.selectedSlot));
    this.onHotbarSelect?.(this.selectedSlot);
  }

  cycleSlot(delta: number): void {
    const n = HOTBAR_BLOCKS.length;
    this.selectSlot(((this.selectedSlot + delta) % n + n) % n);
  }

  setStatus(state: 'ok' | 'wait' | 'bad', label: string): void {
    this.statusDot.className = `server-dot ${state}`;
    this.statusLabel.textContent = label;
  }

  setOnline(count: number): void {
    this.onlineEl.textContent = count === 1 ? 'You are alone in the world' : `${count} builders online`;
  }

  setCoords(x: number, y: number, z: number, fps: number): void {
    this.coordsEl.textContent = `X ${x.toFixed(0)}  Y ${y.toFixed(0)}  Z ${z.toFixed(0)}   ${fps.toFixed(0)} fps`;
  }

  toast(msg: string, kind: ToastKind = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${kind === 'error' ? 'error' : kind === 'good' ? 'good' : ''}`;
    el.textContent = msg; // textContent only
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild?.remove();
    window.setTimeout(() => {
      el.remove();
    }, 3600);
  }

  showPlayerList(players: Array<{ id: string; name: string }>, selfId: string): void {
    this.playerListTitle.textContent = `Online — ${players.length}`;
    this.playerListUl.replaceChildren(
      ...players.map((p) => {
        const li = document.createElement('li');
        if (p.id === selfId) li.classList.add('self');
        const swatch = document.createElement('span');
        swatch.className = 'player-swatch';
        swatch.style.background = colorFor(p.id);
        const name = document.createElement('span');
        name.textContent = p.name;
        li.append(swatch, name);
        return li;
      }),
    );
    this.playerListEl.classList.remove('hidden');
  }

  hidePlayerList(): void {
    this.playerListEl.classList.add('hidden');
  }

  pushChat(from: string, text: string, self = false): void {
    const line = document.createElement('div');
    line.className = `chat-line${self ? ' me' : ''}`;
    const nameSpan = document.createElement('b');
    nameSpan.textContent = from;
    line.append(nameSpan, document.createTextNode(`: ${text}`));
    this.chatLog.appendChild(line);
    while (this.chatLog.children.length > 60) this.chatLog.firstChild?.remove();
    // Auto-fade old lines by capping visible ones via CSS overflow.
    this.trimOldLines();
  }

  pushSystem(text: string): void {
    const line = document.createElement('div');
    line.className = 'chat-line system';
    line.textContent = text;
    this.chatLog.appendChild(line);
    this.trimOldLines();
  }

  private trimOldLines(): void {
    while (this.chatLog.children.length > 60) this.chatLog.firstChild?.remove();
    // Hide lines older than the last 8 after a delay using CSS classes.
    const children = [...this.chatLog.children];
    children.forEach((c, i) => {
      const idxFromEnd = children.length - 1 - i;
      (c as HTMLElement).style.opacity = idxFromEnd > 8 && !this.chatOpen ? '0' : '1';
    });
  }

  openChatInput(): void {
    this.chatOpen = true;
    this.chatWrap.classList.add('input-open');
    this.chatInput.focus();
    this.trimOldLines();
  }

  closeChatInput(): void {
    this.chatOpen = false;
    this.chatInput.value = '';
    this.historyIdx = -1;
    this.chatWrap.classList.remove('input-open');
    this.chatInput.blur();
    this.trimOldLines();
  }

  get isChatOpen(): boolean {
    return this.chatOpen;
  }
}

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 2654435761) >>> 0) % 360;
  return `hsl(${h} 62% 56%)`;
}
