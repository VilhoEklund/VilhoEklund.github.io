import { SIGN_MAX_CHARS, SIGN_MAX_LINES, type SignInfo } from '@eternal-blocks/shared';
import { el } from './panels.ts';

export interface SignModalCallbacks {
  /** Save text (edit/create modes). */
  save(text: string): void;
  /** Remove the sign entirely. */
  delete(): void;
  /** Switch from viewing to editing. */
  edit(): void;
  close(): void;
}

export type SignModalMode = 'create' | 'edit' | 'view';

/**
 * Sign read/edit dialog. The textarea is plain text with a hard maxlength;
 * display uses textContent everywhere, so sign text can never inject markup.
 */
export class SignModal {
  readonly backdrop: HTMLDivElement;
  private title: HTMLElement;
  private viewText: HTMLDivElement;
  private editArea: HTMLTextAreaElement;
  private meta: HTMLDivElement;
  private count: HTMLDivElement;
  private actions: HTMLDivElement;
  private saveBtn: HTMLButtonElement;
  private deleteBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private mode: SignModalMode = 'view';
  private cell: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private wasCreating = false;

  constructor(private cb: SignModalCallbacks) {
    this.backdrop = el('div', 'modal-backdrop hidden');
    this.backdrop.id = 'sign-modal';
    const modal = el('div', 'modal glass glass-strong', this.backdrop);
    this.title = el('h2', undefined, modal);
    this.viewText = el('div', 'sign-view-text', modal);
    this.editArea = el('textarea', undefined, modal) as HTMLTextAreaElement;
    this.editArea.maxLength = SIGN_MAX_CHARS;
    this.count = el('div', 'char-count', modal);
    this.meta = el('div', 'modal-meta', modal);
    this.actions = el('div', 'modal-actions', modal);
    this.deleteBtn = el('button', 'btn danger', this.actions) as HTMLButtonElement;
    this.deleteBtn.textContent = 'Remove sign';
    this.cancelBtn = el('button', 'btn ghost', this.actions) as HTMLButtonElement;
    this.cancelBtn.textContent = 'Cancel';
    this.saveBtn = el('button', 'btn primary', this.actions) as HTMLButtonElement;
    this.saveBtn.textContent = 'Save text';

    this.saveBtn.addEventListener('click', () => {
      if (this.mode === 'view') {
        cb.edit();
        return;
      }
      if (this.mode === 'create' && this.editArea.value.trim().length === 0) {
        // Never leave empty signs behind.
        cb.delete();
      } else {
        cb.save(this.editArea.value);
      }
      this.close();
    });
    this.cancelBtn.addEventListener('click', () => {
      if (this.mode === 'create') {
        // Canceling placement removes the just-placed sign.
        cb.delete();
      }
      this.close();
    });
    this.deleteBtn.addEventListener('click', () => {
      cb.delete();
      this.close();
    });
    this.editArea.addEventListener('input', () => this.updateCount());
    this.editArea.addEventListener('keydown', (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return !this.backdrop.classList.contains('hidden');
  }

  open(cell: { x: number; y: number; z: number }, mode: SignModalMode, sign?: SignInfo): void {
    this.cell = cell;
    this.mode = mode;
    this.wasCreating = mode === 'create';
    this.backdrop.classList.remove('hidden');

    const posLabel = `at ${cell.x}, ${cell.y}, ${cell.z}`;
    if (mode === 'view' && sign) {
      this.title.textContent = `Sign ${posLabel}`;
      this.viewText.classList.remove('hidden');
      this.editArea.classList.add('hidden');
      this.count.classList.add('hidden');
      this.viewText.textContent = sign.text.length > 0 ? sign.text : '(empty sign)';
      this.meta.textContent =
        sign.authorName && sign.authorId
          ? `Written by ${sign.authorName}${sign.updatedAt ? '' : ''}`
          : 'Author unknown';
      this.saveBtn.textContent = sign.authorId ? 'Edit text' : 'Write text';
      this.saveBtn.classList.remove('hidden');
      this.deleteBtn.classList.remove('hidden');
      this.cancelBtn.textContent = 'Close';
    } else {
      this.title.textContent = mode === 'create' ? `Write your sign ${posLabel}` : `Edit sign ${posLabel}`;
      this.viewText.classList.add('hidden');
      this.editArea.classList.remove('hidden');
      this.count.classList.remove('hidden');
      this.editArea.value = sign?.text ?? '';
      this.meta.textContent = `${SIGN_MAX_LINES} lines max · plain text only`;
      this.updateCount();
      this.saveBtn.textContent = 'Save';
      this.saveBtn.classList.remove('hidden');
      this.deleteBtn.classList.toggle('hidden', mode === 'create');
      this.cancelBtn.textContent = 'Cancel';
      window.setTimeout(() => this.editArea.focus(), 30);
    }
  }

  switchToEdit(sign?: SignInfo): void {
    this.open(this.cell, 'edit', sign ?? (this.viewText.textContent !== '(empty sign)' ? { x: this.cell.x, y: this.cell.y, z: this.cell.z, text: this.viewText.textContent ?? '', authorId: '', authorName: '', updatedAt: 0 } : undefined));
  }

  close(): void {
    this.backdrop.classList.add('hidden');
    void this.wasCreating;
  }

  private updateCount(): void {
    const len = this.editArea.value.length;
    const lines = this.editArea.value.split('\n').length;
    this.count.textContent = `${len}/${SIGN_MAX_CHARS} chars · ${lines}/${SIGN_MAX_LINES} lines`;
  }
}
