# Eternal Blocks

Eternal Blocks is an original browser voxel sandbox built with TypeScript,
Three.js, Vite, and an optional Cloudflare Worker multiplayer server.

The GitHub Pages build is playable without a backend. When
`VITE_GAME_SERVER_URL` is not configured, the client starts a local
single-player world. Local changes currently last until the page is reloaded.

## Local development

Requirements: Node.js 24 or newer.

```sh
npm ci
npm run dev:web
```

The web client is available at `http://localhost:5173`. To run multiplayer
locally, start the Worker in another terminal:

```sh
npm run dev:server
```

Open `http://localhost:5173/?__local__` to force local single-player mode
without starting the Worker.

## Deploying the web client

This repository is a GitHub user site, so the production base path is `/`.

1. Open **Repository settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run **Deploy web to GitHub Pages** from the Actions tab.

Do not select branch-based Pages deployment. The repository root contains
source files rather than the built Vite application.

## Optional multiplayer deployment

The shared persistent world uses a Cloudflare Worker and Durable Object.

1. Create a Cloudflare API token with **Workers Scripts: Edit** permission.
2. Add `CLOUDFLARE_API_TOKEN` to the repository's Actions secrets.
3. Add `CLOUDFLARE_ACCOUNT_ID` if the token does not identify the account.
4. Confirm `ALLOWED_ORIGINS` in `apps/server/wrangler.jsonc` contains the final
   GitHub Pages or custom-domain origin.
5. Run **Deploy server to Cloudflare** from the Actions tab.
6. Add the public WebSocket endpoint as the repository secret
   `VITE_GAME_SERVER_URL`, for example
   `wss://eternal-blocks-server.example.workers.dev/ws`.
7. Rerun **Deploy web to GitHub Pages** so Vite includes that endpoint.

The WebSocket URL is public runtime configuration, not an authentication
credential. Never commit the Cloudflare API token or an admin token.

## Verification

```sh
npm run verify
```

This runs type checking, linting, tests, the server dry-run build, the web
build, and the GitHub Pages base-path check.
