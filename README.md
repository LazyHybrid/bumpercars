# Bumper Cars P2P

Bumper Cars P2P is a browser-based multiplayer bumper-car arena built with plain JavaScript, Vite, and Trystero over WebRTC. One peer becomes the authoritative host for simulation, while other peers send input and receive synchronized snapshots.

The project currently includes a lobby and ready flow, host-authoritative movement/collision, a built-in map editor, synchronized match state, and an expanding power-up and ability system.

## Current Features

- Host-authoritative P2P multiplayer using Trystero's Nostr strategy and WebRTC.
- Auto-generated room URLs so another browser or device can join the same session.
- Lobby flow with player names, ready states, and host-controlled match start.
- Match timer, HP bar, score display, pause menu, and new match reset.
- Built-in map editor with saved map slots.
- Random power-up spawning with host validation and synchronized pickup state.
- Space speed boost ability with cooldown HUD.
- Two dynamic held-ability slots bound to `Q` and `E`, with oldest-held replacement when both slots are full.
- Shield pickup with slot-based inventory, HUD display, and knockback immunity while active.

## Tech Stack

- Vite
- Plain JavaScript modules
- Trystero (`@trystero-p2p/nostr`)
- Browser DOM/CSS rendering

## Getting Started

Install dependencies:

```bash
npm ci
```

Start the normal play mode:

```bash
npm start
```

The dev server starts with HTTPS by default so WebRTC and Web Crypto work correctly on `localhost` and LAN devices.

If you need plain HTTP for local debugging:

```bash
npm start -- --http
```

## Available Scripts

```bash
npm start      # play mode over Vite with HTTPS enabled by default
npm run map    # start directly in map editor mode
npm run build  # production build
npm run preview
```

## Multiplayer Flow

1. Open the game in a browser.
2. The game creates a `room` query parameter automatically if one does not already exist.
3. Share the full URL with another player.
4. Players enter a unique name and mark themselves ready.
5. The host starts automatically once all active players are ready and there are at least two active players.

The host is authoritative for movement, collision, timer progression, power-up spawning, and synchronized match state.

## Controls

- `W`, `A`, `S`, `D`: drive and steer
- `Space`: activate speed boost
- `Q`: activate the left held ability slot
- `E`: activate the right held ability slot
- `Escape`: pause / resume
- UI buttons: copy invite link, create new room, toggle map edit mode, start/reset match

## Gameplay Systems

### Match State

- HP is shown at the top center.
- Score is shown at the bottom right.
- The match timer is synchronized from the host.
- `New Match` resets timer, lives, score, positions, momentum, abilities, and power-up state for everyone.

### Power-Ups

Power-ups spawn randomly on valid floor tiles and are validated by the host on pickup.

Held power-up behavior:

- Pickups go into a two-slot held-ability inventory.
- If the same pickup is collected again, it stacks charges in its existing slot.
- If both slots are occupied and a new different pickup is collected, the ability held the longest gets replaced.
- The two held slots are shown in the HUD on the left and right sides of the speed boost indicator.

Current pickup pool:

- `shield`
- `rocket` inventory placeholder
- `ghost` inventory placeholder
- `bomb` inventory placeholder

### Abilities

#### Speed Boost

- Activated with `Space`
- Single press, not hold-to-maintain
- Ramps up from the player's current speed scale
- Current config:
	- max scale: `3x`
	- ramp-up time: `0.5s`
	- duration: `2s`
	- cooldown: `15s`
- Cooldown is displayed with the lightning icon at the bottom center

#### Shield

- Obtained only through random power-up pickup
- Current pickup gives `1` charge
- Lives in the dynamic held-ability slots and can be triggered by `Q` or `E` depending on which slot it occupies
- Current duration is `60s` in config for testing
- While active:
	- the shielded player is immune to collision knockback
	- the unshielded player still gets launched away
	- the car gets a visible shield barrier effect
- Shield charges appear in the held-ability HUD, with a badge when a slot holds more than one charge

## Map Editor

Launch map editor mode directly with:

```bash
npm run map
```

The project supports session maps and saved map slots. The editor is also available in the in-game UI for the host.

## Public Hosting / Cross-Network Play

If players are not on the same machine or LAN, the game page itself must be hosted on a public HTTPS URL.

Recommended flow:

1. Deploy the built files to a public static host such as Netlify, Cloudflare Pages, or Vercel.
2. Open the public HTTPS URL.
3. Share that URL with the room query parameter.
4. Add a TURN server if you need more reliable connectivity across strict NATs.

Supported environment variables:

```bash
# Optional canonical URL used by the invite-link UI.
VITE_PUBLIC_ORIGIN=https://your-game.example.com

# Optional TURN configuration for harder network setups.
VITE_TURN_URLS=turn:turn.your-game.example.com:3478?transport=udp,turn:turn.your-game.example.com:3478?transport=tcp
VITE_TURN_USERNAME=bumpercars
VITE_TURN_CREDENTIAL=replace-me
```

Without a TURN server, many peer combinations still work, but some routers and carrier-grade NAT setups will fail.

## Build

```bash
npm run build
```

## Project Notes

- This is currently a rapidly evolving prototype, so gameplay values and README details should be considered implementation-current rather than final design.
- Some power-up names already exist in the pool before their gameplay effect is implemented.