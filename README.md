# Bumper Cars P2P

Small browser prototype for a third-person bumper car arena built with JavaScript, Three.js, and WebRTC.

## Features

- WASD driving with loose, slippery handling
- Third-person chase camera
- Joinable multiplayer room via URL query string
- Host-authoritative P2P sync using Trystero over WebRTC

## Run locally

```bash
npm install
npm start
```

Then open the local URL in your browser. The game will automatically generate a room ID in the URL if one is missing.

The dev server starts with HTTPS by default so WebRTC and Web Crypto work on LAN devices as well as on `localhost`. If you need plain HTTP for debugging, run `npm start -- --http`.

To invite another player, copy the full URL and open it on another device or browser.

## Map editor

```bash
npm run map
```

This starts the built-in map maker without needing `--` argument forwarding.

## Make the link work off-network

If you want someone on a different network to join through the link, the page itself must be hosted on a public HTTPS URL. Opening `localhost` or a private LAN IP only works for devices that can already reach that machine.

1. Deploy the site as static files to a public host such as Netlify, Cloudflare Pages, Vercel, or GitHub Pages.
2. Once the site is running on a public HTTPS domain, the in-game copy button will use that domain automatically.
3. For better WebRTC connectivity across strict NATs, add a TURN server with `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL`.

Set `VITE_PUBLIC_ORIGIN` only if you want the copied invite link to use a different canonical host than the one serving the page.

Example environment file:

```bash
# Optional. Only needed if invite links should point at a different public domain.
VITE_PUBLIC_ORIGIN=https://your-game.example.com
VITE_TURN_URLS=turn:turn.your-game.example.com:3478?transport=udp,turn:turn.your-game.example.com:3478?transport=tcp
VITE_TURN_USERNAME=bumpercars
VITE_TURN_CREDENTIAL=replace-me
```

Without a TURN server, many cross-network connections will still work, but some players behind strict routers or carrier-grade NAT will fail to connect.

## Gameplay Features 

- Host-synchronized match timer: The timer in the top right is always in sync for all players, controlled by the host.
- New Match button: Instantly resets the match (timer, scores, life, positions, and momentum) for all players in the room.
- Player elimination: When a player's HP reaches zero, their car despawns and they get a free camera until the next match or respawn.
- Score and HP bar: Score is shown bottom right, HP bar is at the top center.
- Pause menu: Press Escape to pause, resume, or see session info.
- Map editor: Toggle with the Edit Map button to create or modify arenas.

## How the Timer Works

- The timer in the top right is always synchronized across all players.
- Only the host advances the timer; all other players receive the timer value from the host.
- When a new match is started, the timer resets for everyone.

## Resetting the Match

- Click the New Match button (above the timer) to reset the game for all players in the current room.
- This will reset all scores, HP, positions, and momentum, and respawn all cars.

## Controls

- WASD: Drive
- Mouse: Steer camera
- Escape: Pause menu
- Edit Map: Enter map editor
- New Match: Reset the match for all players

---

## Notes on P2P hosting

This project uses Trystero's Nostr strategy for signaling and WebRTC for the actual player-to-player connection.

- The page itself still needs to be served as a normal static site.
- Room discovery happens from the `room` query parameter in the URL.
- The peer with the elected host ID runs the authoritative simulation and other peers send input plus receive snapshots.
- For reliable internet-wide matchmaking, host the static site publicly over HTTPS and provide a TURN server.
- This is still P2P hosted, but collisions and movement fairness are improved because the host resolves the actual game state.

## Build

```bash
npm run build
```