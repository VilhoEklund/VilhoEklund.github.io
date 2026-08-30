import { BLOCKS, HOTBAR_BLOCKS, INVENTORY_BLOCKS } from '@eternal-blocks/shared';
import type { AtlasResult } from '../game/textures.ts';
import { TILE_INDEX, BLOCK_TILES, TILE_PX, ATLAS_COLS } from '../game/textures.ts';

export type ToastKind = 'info' | 'error' | 'good';

type HotbarSlot = number | null;

const HOTBAR_STORAGE_KEY = 'eternal-blocks.hotbar.v1';

function loadHotbar(): HotbarSlot[] {
  const defaults: HotbarSlot[] = [...HOTBAR_BLOCKS];
  try {
    const raw = localStorage.getItem(HOTBAR_STORAGE_KEY);
    if (!raw) return defaults;
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length !== HOTBAR_BLOCKS.length) return defaults;
    const available = new Set(INVENTORY_BLOCKS);
    if (
      !saved.every(
        (blockId) => blockId === null || (typeof blockId === 'number' && available.has(blockId)),
      )
    ) {
      return defaults;
    }
    return saved as HotbarSlot[];
  } catch {
    return defaults;
  }
}

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
  private inventoryEl!: HTMLDivElement;
  private inventorySlots: HTMLDivElement[] = [];
  private toastsEl!: HTMLDivElement;
  private playerListEl!: HTMLDivElement;
  private playerListUl!: HTMLUListElement;
  private playerListTitle!: HTMLElement;
  private chatWrap!: HTMLDivElement;
  private chatLog!: HTMLDivElement;
  private chatInput!: HTMLInputElement;

  onHotbarSelect: ((slot: number, blockId: number | null) => void) | null = null;
  onInventoryClose: (() => void) | null = null;
  onChatSend: ((text: string) => void) | null = null;

  private selectedSlot = 0;
  private hotbar: HotbarSlot[] = loadHotbar();
  private inventoryOpen = false;
  private dragged:
    { source: 'palette'; blockId: number } | { source: 'hotbar'; slot: number } | null = null;
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
    this.hotbar.forEach((_blockId, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slot = String(i);
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String((i + 1) % 10);
      const icon = document.createElement('canvas');
      icon.width = TILE_PX;
      icon.height = TILE_PX;
      const label = document.createElement('span');
      label.className = 'label';
      slot.append(num, icon, label);
      slot.addEventListener('click', () => this.selectSlot(i));
      this.slots.push(slot);
      this.hotbarEl.appendChild(slot);
    });
    this.root.appendChild(this.hotbarEl);

    this.buildInventory();

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
          this.historyIdx = Math.max(
            0,
            this.historyIdx < 0 ? this.history.length - 1 : this.historyIdx - 1,
          );
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

    this.renderHotbar();
  }

  private buildInventory(): void {
    this.inventoryEl = document.createElement('div');
    this.inventoryEl.className = 'inventory-backdrop clickable hidden';
    this.inventoryEl.id = 'inventory';
    this.inventoryEl.setAttribute('role', 'dialog');
    this.inventoryEl.setAttribute('aria-modal', 'true');
    this.inventoryEl.setAttribute('aria-label', 'Block inventory');

    const panel = document.createElement('section');
    panel.className = 'inventory-panel glass glass-strong';
    panel.addEventListener('click', (e) => e.stopPropagation());

    const heading = document.createElement('div');
    heading.className = 'inventory-heading';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = 'Block inventory';
    const hint = document.createElement('p');
    hint.textContent = 'Drag a block into a hotbar slot. Drag slots to rearrange them.';
    titleWrap.append(title, hint);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'inventory-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close inventory');
    close.addEventListener('click', () => this.onInventoryClose?.());
    heading.append(titleWrap, close);
    panel.appendChild(heading);

    const paletteTitle = document.createElement('h3');
    paletteTitle.textContent = 'Available blocks';
    panel.appendChild(paletteTitle);

    const palette = document.createElement('div');
    palette.className = 'inventory-palette';
    INVENTORY_BLOCKS.forEach((blockId) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'inventory-block';
      item.draggable = true;
      item.title = `${BLOCKS[blockId]?.name ?? 'Block'} — drag to a hotbar slot`;
      const icon = document.createElement('canvas');
      icon.width = TILE_PX;
      icon.height = TILE_PX;
      this.drawBlockIcon(icon, blockId);
      const label = document.createElement('span');
      label.textContent = BLOCKS[blockId]?.name ?? '?';
      item.append(icon, label);
      item.addEventListener('click', () => this.setHotbarSlot(this.selectedSlot, blockId));
      item.addEventListener('dragstart', (e) => {
        this.dragged = { source: 'palette', blockId };
        e.dataTransfer?.setData('text/plain', String(blockId));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        this.dragged = null;
        item.classList.remove('dragging');
        this.clearDropHighlights();
      });
      palette.appendChild(item);
    });
    panel.appendChild(palette);

    const hotbarTitle = document.createElement('div');
    hotbarTitle.className = 'inventory-hotbar-title';
    const hotbarHeading = document.createElement('h3');
    hotbarHeading.textContent = 'Hotbar';
    const hotbarHint = document.createElement('span');
    hotbarHint.textContent = 'Right-click a slot to empty it';
    hotbarTitle.append(hotbarHeading, hotbarHint);
    panel.appendChild(hotbarTitle);

    const row = document.createElement('div');
    row.className = 'inventory-hotbar';
    this.hotbar.forEach((_blockId, i) => {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot';
      slot.dataset.slot = String(i);
      slot.tabIndex = 0;
      slot.setAttribute('role', 'button');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String((i + 1) % 10);
      const icon = document.createElement('canvas');
      icon.width = TILE_PX;
      icon.height = TILE_PX;
      const label = document.createElement('span');
      label.className = 'inventory-slot-label';
      slot.append(num, icon, label);
      slot.addEventListener('click', () => this.selectSlot(i));
      slot.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.selectSlot(i);
        } else if (e.code === 'Delete' || e.code === 'Backspace') {
          e.preventDefault();
          this.setHotbarSlot(i, null);
        }
      });
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.setHotbarSlot(i, null);
      });
      slot.addEventListener('dragstart', (e) => {
        if (this.hotbar[i] === null) {
          e.preventDefault();
          return;
        }
        this.dragged = { source: 'hotbar', slot: i };
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        slot.classList.add('dragging');
      });
      slot.addEventListener('dragover', (e) => {
        if (!this.dragged) return;
        e.preventDefault();
        if (e.dataTransfer)
          e.dataTransfer.dropEffect = this.dragged.source === 'palette' ? 'copy' : 'move';
        slot.classList.add('drop-target');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop-target'));
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drop-target');
        if (!this.dragged) return;
        if (this.dragged.source === 'palette') {
          this.setHotbarSlot(i, this.dragged.blockId);
        } else {
          this.swapHotbarSlots(this.dragged.slot, i);
        }
      });
      slot.addEventListener('dragend', () => {
        this.dragged = null;
        slot.classList.remove('dragging');
        this.clearDropHighlights();
      });
      this.inventorySlots.push(slot);
      row.appendChild(slot);
    });
    panel.appendChild(row);

    const footer = document.createElement('p');
    footer.className = 'inventory-footer';
    footer.textContent = 'Click a block to put it in the selected slot · E or Esc to close';
    panel.appendChild(footer);

    this.inventoryEl.appendChild(panel);
    this.inventoryEl.addEventListener('click', () => this.onInventoryClose?.());
    this.root.appendChild(this.inventoryEl);
  }

  /** Composite a simple isometric-ish block icon from atlas tiles. */
  private drawBlockIcon(canvas: HTMLCanvasElement, blockId: number): void {
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
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
    this.renderHotbar();
    this.onHotbarSelect?.(this.selectedSlot, this.hotbar[this.selectedSlot] ?? null);
  }

  cycleSlot(delta: number): void {
    const n = HOTBAR_BLOCKS.length;
    this.selectSlot((((this.selectedSlot + delta) % n) + n) % n);
  }

  openInventory(): void {
    this.inventoryOpen = true;
    this.inventoryEl.classList.remove('hidden');
    this.renderHotbar();
  }

  closeInventory(): void {
    this.inventoryOpen = false;
    this.dragged = null;
    this.inventoryEl.classList.add('hidden');
    this.clearDropHighlights();
  }

  get isInventoryOpen(): boolean {
    return this.inventoryOpen;
  }

  private setHotbarSlot(slot: number, blockId: HotbarSlot): void {
    this.hotbar[slot] = blockId;
    this.persistHotbar();
    this.selectSlot(slot);
  }

  private swapHotbarSlots(from: number, to: number): void {
    if (from === to) return;
    [this.hotbar[from], this.hotbar[to]] = [this.hotbar[to] ?? null, this.hotbar[from] ?? null];
    this.persistHotbar();
    this.selectSlot(to);
  }

  private persistHotbar(): void {
    try {
      localStorage.setItem(HOTBAR_STORAGE_KEY, JSON.stringify(this.hotbar));
    } catch {
      // Storage may be disabled; the inventory still works for this session.
    }
  }

  private renderHotbar(): void {
    const renderSlot = (slot: HTMLDivElement, i: number, inventory: boolean): void => {
      const blockId = this.hotbar[i] ?? null;
      const canvas = slot.querySelector('canvas');
      const label = slot.querySelector(inventory ? '.inventory-slot-label' : '.label');
      if (canvas instanceof HTMLCanvasElement) {
        const g = canvas.getContext('2d');
        g?.clearRect(0, 0, canvas.width, canvas.height);
        if (blockId !== null) this.drawBlockIcon(canvas, blockId);
      }
      if (label) label.textContent = blockId === null ? 'Empty' : (BLOCKS[blockId]?.name ?? '?');
      slot.classList.toggle('empty', blockId === null);
      slot.classList.toggle('selected', i === this.selectedSlot);
      slot.draggable = inventory && blockId !== null;
      const name = blockId === null ? 'Empty' : (BLOCKS[blockId]?.name ?? 'Unknown block');
      slot.setAttribute('aria-label', `Hotbar slot ${(i + 1) % 10}: ${name}`);
      if (inventory)
        slot.title =
          blockId === null ? 'Empty slot' : `${name} — drag to move, right-click to empty`;
    };
    this.slots.forEach((slot, i) => renderSlot(slot, i, false));
    this.inventorySlots.forEach((slot, i) => renderSlot(slot, i, true));
  }

  private clearDropHighlights(): void {
    this.inventorySlots.forEach((slot) => slot.classList.remove('drop-target'));
  }

  setStatus(state: 'ok' | 'wait' | 'bad', label: string): void {
    this.statusDot.className = `server-dot ${state}`;
    this.statusLabel.textContent = label;
  }

  setOnline(count: number): void {
    this.onlineEl.textContent =
      count === 1 ? 'You are alone in the world' : `${count} builders online`;
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
