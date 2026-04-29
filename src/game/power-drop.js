// --- Power-up system (migrated from main.js) ---
import { POWERUP_NAMES } from './powerups/list.js';
import * as powerupEffects from './powerups/effects.js';
import '../powerup.css';
import { getActiveMap, MAP_CELL_SIZE, mapCellToWorld, WORLD_SCALE } from './map-data.js';

let powerups = [];
let powerupTimers = [];
let powerupSpawnAccumulator = 0;
const POWERUP_SPAWN_INTERVAL = 7; // seconds
const POWERUP_DESPAWN_TIME = 20; // seconds
const MAX_POWERUPS = 2;

let worldRef = null;
let sendSnapshotPacketRef = null;
let isHostRef = null;
let localPlayerRef = null;
let playerLivesRef = null;
let hostIdRef = null;
let sendInputRef = null;

export function initPowerups({ world, sendSnapshotPacket, isHost, localPlayer, playerLives, hostId, sendInput }) {
	worldRef = world;
	sendSnapshotPacketRef = sendSnapshotPacket;
	isHostRef = isHost;
	localPlayerRef = localPlayer;
	playerLivesRef = playerLives;
	hostIdRef = hostId;
	sendInputRef = sendInput;
}

export function getPowerups() {
	return powerups;
}

function getRandomAvailableFloorTile() {
	const map = getActiveMap();
	const floorTiles = Array.isArray(map.floors) ? map.floors : [];
	if (floorTiles.length === 0) return null;
	// Exclude tiles already occupied by a powerup
	const occupied = new Set(powerups.map(p => `${p.x},${p.y}`));
	const availableTiles = floorTiles.filter(tile => !occupied.has(`${tile.x},${tile.y}`));
	if (availableTiles.length === 0) return null;
	const idx = Math.floor(Math.random() * availableTiles.length);
	return availableTiles[idx];
}

export function hostSpawnPowerup() {
	if (powerups.length >= MAX_POWERUPS) return;
	const tile = getRandomAvailableFloorTile();
	if (!tile) return;
	const type = POWERUP_NAMES[Math.floor(Math.random() * POWERUP_NAMES.length)];
	const powerup = { x: tile.x, y: tile.y, type, spawnedAt: performance.now() / 1000 };
	powerups.push(powerup);
	// Schedule despawn
	const timer = setTimeout(() => {
		hostDespawnPowerup(powerup);
	}, POWERUP_DESPAWN_TIME * 1000);
	powerupTimers.push({ powerup, timer });
}

export function hostDespawnPowerup(powerup) {
	powerups = powerups.filter(p => p !== powerup);
	const t = powerupTimers.find(t => t.powerup === powerup);
	if (t) clearTimeout(t.timer);
	powerupTimers = powerupTimers.filter(t => t.powerup !== powerup);
}

export function hostResetPowerups() {
	powerups = [];
	powerupTimers.forEach(t => clearTimeout(t.timer));
	powerupTimers = [];
	powerupSpawnAccumulator = 0;
}

export function isPlayerOnPowerup(player, powerup) {
	const playerPos = player.position;
	const powerupPos = mapCellToWorld(powerup.x, powerup.y);
	const dx = playerPos.x - powerupPos.x;
	const dy = playerPos.y - powerupPos.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	// Pickup radius: half cell size
	return dist < MAP_CELL_SIZE * 0.5;
}

export function tryPickupPowerup(windowObj, sendInput, hostId, localPlayer, isHost) {
	if (isHost()) return; // Host handles in simulation
	const list = windowObj.syncedPowerups;
	if (!Array.isArray(list)) return;
	for (const p of list) {
		if (isPlayerOnPowerup(localPlayer, p)) {
			// Send pickup request to host
			if (sendInput) sendInput({ pickup: { x: p.x, y: p.y, type: p.type } }, hostId);
			break;
		}
	}
}

export function renderPowerups(isHost, world, syncedPowerups, powerupsArg) {
	// Remove old DOM elements
	if (!renderPowerups.renderedPowerupEls) renderPowerups.renderedPowerupEls = [];
	for (const el of renderPowerups.renderedPowerupEls) {
		if (el.parentNode) el.parentNode.removeChild(el);
	}
	renderPowerups.renderedPowerupEls = [];

	// Get current powerup state
	const list = isHost() ? (powerupsArg || powerups) : syncedPowerups;
	if (!Array.isArray(list)) return;
	for (const p of list) {
		const size = MAP_CELL_SIZE * 0.7 * WORLD_SCALE;
		const el = document.createElement('div');
		el.className = 'powerup-item';
		el.style.position = 'absolute';
		const worldPos = mapCellToWorld(p.x, p.y);
		el.style.left = `calc(50% + ${worldPos.x * WORLD_SCALE - size / 2}px)`;
		el.style.top = `calc(50% + ${worldPos.y * WORLD_SCALE - size / 2}px)`;
		el.style.width = `${size}px`;
		el.style.height = `${size}px`;
		el.style.background = '#ff0';
		el.style.borderRadius = '50%';
		el.style.zIndex = 10;
		el.dataset.type = p.type;
		world.add(el);
		renderPowerups.renderedPowerupEls.push(el);
	}
}

export function simulatePowerupsStep(delta, { localPlayer, playerLives, sendSnapshotPacket, isHost }) {
	// Host: spawn powerups on timer
	if (isHost()) {
		powerupSpawnAccumulator += delta;
		if (powerupSpawnAccumulator >= POWERUP_SPAWN_INTERVAL) {
			powerupSpawnAccumulator = 0;
			hostSpawnPowerup();
		}
	}
	// Host: check if local player picks up any power-up
	if (isHost() && playerLives[selfId]?.isAlive()) {
		for (let i = powerups.length - 1; i >= 0; i--) {
			const p = powerups[i];
			if (isPlayerOnPowerup(localPlayer, p)) {
				// Remove powerup
				const [removed] = powerups.splice(i, 1);
				// Optionally: grant effect here
				// TODO: Apply powerupEffects[removed.type](localPlayer)
				// Remove timer
				const t = powerupTimers.find(t => t.powerup === removed);
				if (t) clearTimeout(t.timer);
				powerupTimers = powerupTimers.filter(t => t.powerup !== removed);
				// Sync state
				if (sendSnapshotPacket) sendSnapshotPacket();
			}
		}
	}
}

// Power drop system reset. Implement new logic here.
// Power-up types and effects are now in ./powerups/


import { POWERUP_NAMES } from './powerups/list.js';
import * as powerupEffects from './powerups/effects.js';
import '../powerup.css';


import { getActiveMap, MAP_CELL_SIZE, mapCellToWorld, WORLD_SCALE } from './map-data.js';


// Host-authoritative power-up state is now managed in main.js
// This module will only export helpers for rendering and effect application in future steps.