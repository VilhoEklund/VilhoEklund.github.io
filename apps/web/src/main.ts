import { validateNickname } from '@eternal-blocks/shared';
import './styles.css';
import { loadConfig } from './config.ts';
import {
  DEFAULT_SETTINGS,
  loadIdentity,
  loadSettings,
  saveName,
  saveSettings,
  type Settings,
} from './identity.ts';
import { Game, registerSignModalHost, registerUiBridges } from './game/game.ts';
import {
  buildHelpOverlay,
  buildLoadingScreen,
  buildPauseMenu,
  buildTitleScreen,
  buildTouchNotice,
  isTouchOnlyDevice,
} from './ui/panels.ts';
import { SignModal, type SignModalMode } from './ui/modals.ts';

function boot(): void {
  const config = loadConfig();
  const appRoot = document.getElementById('app')!;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  let settings: Settings = loadSettings();
  if (!Number.isFinite(settings.sensitivity)) settings = { ...DEFAULT_SETTINGS };

  const proceed = (): void => showTitle();

  // Desktop-first: friendly notice on touch-only devices.
  if (isTouchOnlyDevice()) {
    const notice = buildTouchNotice(() => {
      notice.remove();
      proceed();
    });
    appRoot.appendChild(notice);
    return;
  }
  proceed();

  function showTitle(): void {
    const identity = loadIdentity();
    const title = buildTitleScreen({
      initialName: identity.name,
      online: Boolean(config.serverUrl),
      onPlay(name) {
        saveName(name);
        title.destroy();
        startGame(name, identity.playerId);
      },
    });
    appRoot.appendChild(title.root);

    // Best-effort server reachability indicator on the title screen.
    const dot = document.getElementById('title-server-dot');
    const statusText = document.getElementById('title-server-status');
    if (dot && statusText) {
      if (!config.serverUrl) {
        dot.className = 'server-dot ok';
        statusText.textContent = ' local world · auto-saved';
      } else {
        const httpUrl = config.serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '/');
        fetch(httpUrl + 'stats')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((j: { online?: number }) => {
            dot.className = 'server-dot ok';
            statusText.textContent =
              typeof j.online === 'number'
                ? ` ${j.online} online now · join them`
                : ' server reachable';
          })
          .catch(() => {
            dot.className = 'server-dot bad';
            statusText.textContent = ' server unreachable (is the worker deployed?)';
          });
      }
    }
  }

  function startGame(name: string, playerId: string): void {
    if (!validateNickname(name).ok) {
      location.reload();
      return;
    }
    const identity = loadIdentity();

    const loading = buildLoadingScreen('the eternal world');
    appRoot.appendChild(loading.root);

    const helpOverlay = buildHelpOverlay();
    appRoot.appendChild(helpOverlay.root);

    const pauseMenu = buildPauseMenu(settings);
    pauseMenu.onResume = () => {
      pauseMenu.close();
      game?.requestLock();
    };
    pauseMenu.onSettingsChange = (s) => {
      settings = s;
      saveSettings(s);
      game?.applySettings(s);
    };
    pauseMenu.onShowHelp = () => {
      pauseMenu.close();
      helpOverlay.show();
    };
    helpOverlay.root.querySelector('button')?.addEventListener('click', () => game?.requestLock());
    appRoot.appendChild(pauseMenu.root);

    let currentSignCell: { x: number; y: number; z: number } | null = null;
    const signModal = new SignModal({
      save: (text) => {
        if (currentSignCell && game) game.interaction.saveSignText(currentSignCell, text);
      },
      delete: () => {
        if (currentSignCell && game) game.interaction.removeSign(currentSignCell);
      },
      edit: () => {
        if (currentSignCell && game) {
          const { x, y, z } = currentSignCell;
          signModal.switchToEdit(game.world.signs.get(`${x},${y},${z}`));
        }
      },
      close: () => game?.requestLock(),
    });
    appRoot.appendChild(signModal.backdrop);

    registerSignModalHost((cell, mode: SignModalMode, sign) => {
      currentSignCell = cell;
      signModal.open(cell, mode, sign);
    });

    let game: Game | null = null;
    game = new Game({
      canvas,
      uiRoot: appRoot,
      settings,
      serverUrl: config.serverUrl,
      selfId: identity.playerId,
      selfName: name,
      e2e: config.e2e,
      hooks: {
        onStatus(status, label) {
          game?.hud.setStatus(status, label);
        },
        onProgress(fraction, label) {
          if (fraction === null) {
            loading.root.classList.add('hidden');
          } else {
            loading.root.classList.remove('hidden');
            loading.setProgress(fraction, label ?? '');
          }
        },
        onFirstSyncDone() {
          loading.root.classList.add('hidden');
          game?.hud.pushSystem(
            config.serverUrl
              ? 'Welcome to the eternal world. Be kind - everything persists.'
              : 'Welcome to your local world. Buildings are auto-saved in this browser.',
          );
          game?.hud.toast('Click to grab the mouse and play', 'good');
        },
        onFatal(message) {
          loading.setProgress(1, `⚠ ${message}`);
          loading.root.classList.remove('hidden');
        },
        onHelpToggle() {
          const next = !helpOverlay.isOpen;
          if (next) helpOverlay.show();
          else helpOverlay.hide();
          return next;
        },
      },
    });

    // Presence roster for the Tab player list.
    const rosterCache = new Map<string, string>();
    game.net.events.on('message', (msg) => {
      switch (msg.t) {
        case 'welcome':
          rosterCache.clear();
          for (const p of msg.players) rosterCache.set(p.id, p.name);
          break;
        case 'pjoin':
          rosterCache.set(msg.id, msg.name);
          break;
        case 'pleave':
          rosterCache.delete(msg.id);
          break;
        default:
          break;
      }
    });

    game.hud.onChatSend = (text) => {
      if (config.serverUrl) game!.net.send({ t: 'chat', text });
      else game!.hud.pushChat('You', text, true);
    };

    registerUiBridges({
      pauseIsOpen: () => pauseMenu.isOpen,
      pauseShow: () => pauseMenu.open(),
      pauseHide: () => pauseMenu.close(),
      helpIsOpen: () => helpOverlay.isOpen,
      chatOpen: () => game!.hud.isChatOpen,
      chatOpenInput: () => game!.hud.openChatInput(),
      chatForceClose: () => game!.hud.closeChatInput(),
      showPlayerList: () => {
        if (!game) return;
        const players = [...rosterCache.entries()].map(([id, pname]) => ({ id, name: pname }));
        players.push({ id: identity.playerId, name });
        game.hud.showPlayerList(players, identity.playerId);
      },
      hidePlayerList: () => game?.hud.hidePlayerList(),
      signIsOpen: () => signModal.isOpen,
    });

    if (config.e2e) game.exposeE2E();

    window.addEventListener(
      'beforeunload',
      () => {
        game?.dispose();
      },
      { once: true },
    );

    game.connect(name, playerId);
  }
}

boot();
