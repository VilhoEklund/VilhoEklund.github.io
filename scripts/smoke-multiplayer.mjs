const endpoint = process.argv[2] ?? process.env.VITE_GAME_SERVER_URL ?? 'ws://127.0.0.1:8787/ws';
const runId = Date.now().toString(36);

class Client {
  constructor(name, playerId) {
    this.name = name;
    this.playerId = playerId;
    this.messages = [];
    this.waiters = [];
    this.socket = new WebSocket(endpoint);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      this.messages.push(message);
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(message)) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          clearTimeout(waiter.timer);
          waiter.resolve(message);
        }
      }
    });
  }

  async join() {
    if (this.socket.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.socket.addEventListener('open', resolve, { once: true });
        this.socket.addEventListener('error', () => reject(new Error('WebSocket failed')), {
          once: true,
        });
      });
    }
    this.send({ t: 'hello', proto: 1, name: this.name, playerId: this.playerId });
    const welcome = await this.waitFor((message) => message.t === 'welcome');
    this.send({
      t: 'pos',
      x: welcome.spawn.x,
      y: welcome.spawn.y,
      z: welcome.spawn.z,
      yaw: 0,
      pitch: 0,
    });
    await this.waitFor((message) => message.t === 'syncDone');
    return welcome;
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  waitFor(predicate, timeoutMs = 15_000) {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new Error(`Timed out waiting for a server message for ${this.name}`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  close() {
    this.socket.close(1000, 'smoke test complete');
  }
}

const alice = new Client('SmokeAlice', `smokeAlice_${runId}`);
const bob = new Client('SmokeBob', `smokeBob_${runId}`);

try {
  const aliceWelcome = await alice.join();
  const bobWelcome = await bob.join();
  await alice.waitFor((message) => message.t === 'pjoin' && message.id === bob.playerId);

  const chatText = `shared-chat-${runId}`;
  bob.send({ t: 'chat', text: chatText });
  await Promise.all(
    [alice, bob].map((client) =>
      client.waitFor((message) => message.t === 'chatMsg' && message.text === chatText),
    ),
  );

  const block = {
    x: Math.floor(aliceWelcome.spawn.x) + 2,
    y: Math.floor(aliceWelcome.spawn.y) + 2,
    z: Math.floor(aliceWelcome.spawn.z),
  };
  const placeId = `smokePlace_${runId}`;
  alice.send({ t: 'edit', eid: placeId, action: 'place', ...block, block: 9 });
  await Promise.all(
    [alice, bob].map((client) =>
      client.waitFor(
        (message) => message.t === 'blockApplied' && message.eid === placeId && message.block === 9,
      ),
    ),
  );

  const cleanupId = `smokeBreak_${runId}`;
  alice.send({ t: 'edit', eid: cleanupId, action: 'break', ...block });
  await Promise.all(
    [alice, bob].map((client) =>
      client.waitFor(
        (message) =>
          message.t === 'blockApplied' && message.eid === cleanupId && message.block === 0,
      ),
    ),
  );

  console.log(
    JSON.stringify({
      ok: true,
      endpoint,
      seed: aliceWelcome.seed,
      spawn: aliceWelcome.spawn,
      rosterVisible: bobWelcome.players.some((player) => player.id === alice.playerId),
      chatBroadcast: true,
      blockBroadcast: true,
      cleanupApplied: true,
    }),
  );
} finally {
  alice.close();
  bob.close();
}
