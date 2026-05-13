// Imports
import '../style.css';
import '../scene-actor-layer.css';
import { joinRoom, selfId } from '@trystero-p2p/nostr';
import {
  ABILITY_DEFINITIONS,
  ABILITY_IDS,
  applyPlayerAbilitiesSnapshot,
  resetPlayerAbilities,
  serializePlayerAbilities,
  updatePlayerAbilityInput,
} from '../game/abilities';
import { syncCooldownIndicator } from '../game/cooldowns';
import {
  applyHeldAbilitiesSnapshot,
  applyPowerupEffect,
  resetHeldAbilities,
  serializeHeldAbilities,
} from '../game/powerups/effects';
import {
  INPUT_SEND_INTERVAL_MS,
  LOCAL_RECONCILE_RATE,
  MAX_PLAYERS,
  REMOTE_INTERPOLATION_RATE,
  REMOTE_TIMEOUT_MS,
  SIMULATION_STEP,
  SNAPSHOT_POSITION_SNAP_DISTANCE,
  SNAPSHOT_SEND_INTERVAL_MS,
  SNAPSHOT_VELOCITY_SNAP_DELTA,
} from '../game/config';
import { createInputState, normalizeInput, readCurrentInputState, serializeInput, setupInput } from '../game/input';
import { MAP_WORLD_SIZE, MAP_CELL_SIZE, WORLD_SCALE, getActiveMap, getActiveMapSlot, getMapSlot, getMapSpawn, mapCellToWorld, setSessionMap } from '../game/map-data';
import { ensureRemotePlayer, colorFromId, createPlayer, syncPlayerTransform } from '../game/players';
import { LifeSystem, isOnFloorOrWall } from '../game/life.js';
import { Vec2 } from '../game/math';
import { resolveArenaCollision, resolveMapWallCollisions, resolvePlayerCollision, simulateMovement } from '../game/physics';
import { createWorld } from '../game/scene';
import { initAudio, updateEngineSound, playCollectSound, playCollisionSound, playDamageSound, playDespawnSound, playSpeedBoostSound, playBombDropSound, playExplosionSound, startShieldSound, stopShieldSound, startGhostSound, stopGhostSound } from '../game/audio/sound-manager';
import { lerpAngle, shortId } from '../game/utils';
import { buildEndgameResults, shouldEndMatch } from '../game/win/win-logic';
import { createLobbyController } from '../lobby/lobby-controller';
import { createLobbyUI } from '../ui/lobby-ui';
import { submitName, validatePlayerName, updateNameValidation, initNameUI } from '../lobby/lobby-helpers';
import { renderUI } from '../ui/state-renderer.js';
import { buildRoomConfig, buildSecureRoomUrl, buildShareUrl, canUseMultiplayer, createRoomId, ensureRoomId } from './runtime-room.js';
import { ensureHpBarFill, ensureScoreDisplay, updateHpBar as updateHpBarDisplay, updateMatchTimerDisplay as renderMatchTimerDisplay, updateScoreDisplay as renderScoreDisplay } from './runtime-hud.js';
import { applyLifeSnapshotForPlayer, getHealthPercent as getPlayerHealthPercent, getPlayerLifeValue } from './runtime-life.js';
import { createRuntimeEditor } from './runtime-editor.js';
import { updateHeldAbilitySlots as renderHeldAbilitySlots } from './runtime-ability-ui.js';
import { createRuntimePowerups } from './runtime-powerups.js';

// DOM/UI References
const playHud = document.getElementById('play-hud');
const editorHud = document.getElementById('editor-hud');
const eyebrowLabel = playHud.querySelector('.eyebrow');
const titleLabel = playHud.querySelector('h1');
const roomLabel = playHud.querySelector('#room-label');
const peerCountLabel = playHud.querySelector('#peer-count');
export const statusLabel = playHud.querySelector('#status');
const copyLinkButton = playHud.querySelector('#copy-link');
const newRoomButton = playHud.querySelector('#new-room');
const pauseRoomLabel = document.getElementById('pause-room-label');
const pauseHostLabel = document.getElementById('pause-host-label');
const pauseCopyLinkButton = document.getElementById('pause-copy-link-btn');
const pauseNewRoomButton = document.getElementById('pause-new-room-btn');
const hintLabel = playHud.querySelector('.hint');
const actions = playHud.querySelector('.hud__actions');
export const lobbyUI = createLobbyUI(playHud);
export const readyButton = playHud?.querySelector('#ready-btn');
const toggleEditButton = playHud.querySelector('#toggle-edit');
const togglePlayButton = playHud.querySelector('#toggle-play');

// Ready button event listener
if (readyButton) {
readyButton?.addEventListener('click', () => {
  if (!lobby) return;

  const name = lobby.state.players.get(selfId)?.name ?? '';

  if (!validatePlayerName(name).valid) {
    statusLabel.textContent = 'Enter valid name first';
    return;
  }

  lobby.handleLocalReady(true);
});
}

import { initPauseMenu, setPaused, getPaused, getLastUnpausedTime, setLastUnpausedTime, setupPauseNetworking } from '../game/pause.js';
let matchTime = 0;
const matchTimerDisplay = document.getElementById('match-timer');
const globalMatchTimer = document.getElementById('global-match-timer');
const newMatchBtn = document.getElementById('new-match-btn');
const abilityCooldownIndicator = document.getElementById('ability-cooldown-indicator');
const abilityCooldownIcon = document.getElementById('ability-cooldown-icon');
const abilitySlotLeft = document.getElementById('ability-slot-left');
const abilitySlotLeftIcon = document.getElementById('ability-slot-left-icon');
const abilitySlotLeftBadge = document.getElementById('ability-slot-left-badge');
const abilitySlotRight = document.getElementById('ability-slot-right');
const abilitySlotRightIcon = document.getElementById('ability-slot-right-icon');
const abilitySlotRightBadge = document.getElementById('ability-slot-right-badge');
const heldAbilityUiElements = {
  abilitySlotLeft,
  abilitySlotLeftIcon,
  abilitySlotLeftBadge,
  abilitySlotRight,
  abilitySlotRightIcon,
  abilitySlotRightBadge,
};

// Lobby list container
const lobbyList = document.getElementById('lobby-list');
export let lobbyRef = null;

export function setLobbyRef(lobby) {
  lobbyRef = lobby;
}

// Game state
export const gameState = {
  phase: 'lobby', // 'lobby' | 'playing' | 'editing' | 'paused' | 'endgame'
  endgameResults: null,
};



if (newMatchBtn) {
  newMatchBtn.addEventListener('click', () => {
    if (isHost()) {
      resetMatch();
      // After resetting, broadcast new state to all peers
      sendSnapshotPacket();
    } else {
      statusLabel.textContent = 'Only the host can reset the match.';
    }
  });
}

function resetMatch() {
  if (isHost()) runtimePowerups.hostResetPowerups();
  // Only host should execute this
  if (!isHost()) return;

  gameState.phase = 'playing';
  if (lobby) {
    lobby.state.phase = 'playing';
  }

  const savedMap = getMapSlot(getActiveMapSlot());
  applyAuthoritativeMap(savedMap);
  sendMapPacket();

  // Reset life, score, timer, and respawn all players at spawn
  matchTime = 0;
  gameState.endgameResults = null;
  setLastUnpausedTime(performance.now());
  // Local player
  playerLives[selfId].reset(INITIAL_LIFE);
  localPlayer.score = 0;
  localPlayer.velocity.set(0, 0);
  localPlayer.impactVelocity.set(0, 0);
  resetPlayerAbilities(localPlayer);
  localPlayer.abilityInputState.speedBoostHeld = false;
  localPlayer.abilityInputState.ability1Held = false;
  localPlayer.abilityInputState.ability2Held = false;
  resetHeldAbilities(localPlayer);
  localPlayer.shield = { activeUntil: 0 };
  localPlayer.ghost = { activeUntil: 0 };
  localPlayer.pendingBombDrop = null;
  const spawn = getSpawnPoint(selfId);
  localPlayer.position.set(spawn.x, spawn.y);
  localPlayer.previousPosition.copy(localPlayer.position);
  localPlayer.targetPosition.copy(localPlayer.position);
  viewPosition.copy(localPlayer.position);
  world.setViewPosition(viewPosition.x, viewPosition.y);
  if (!localPlayer.group.parentNode) world.add(localPlayer.group);
  // Remote players
  for (const [peerId, player] of remotePlayers.entries()) {
    if (playerLives[peerId]) playerLives[peerId].reset(INITIAL_LIFE);
    player.score = 0;
    player.velocity.set(0, 0);
    player.impactVelocity.set(0, 0);
    resetPlayerAbilities(player);
    player.abilityInputState.speedBoostHeld = false;
    player.abilityInputState.ability1Held = false;
    player.abilityInputState.ability2Held = false;
    resetHeldAbilities(player);
    player.shield = { activeUntil: 0 };
    player.ghost = { activeUntil: 0 };
    player.pendingBombDrop = null;
    const spawn = getSpawnPoint(peerId);
    player.position.set(spawn.x, spawn.y);
    player.previousPosition.copy(player.position);
    player.targetPosition.copy(player.position);
    if (!player.group.parentNode) world.add(player.group);
  }
  updateHpBar();
  updateScoreDisplay();
  updateMatchTimerDisplay();

  // reset ready state after match start
  if (lobby) {
    for (const id of getActiveParticipantIds()) {
      const player = lobby.state.players.get(id);
      lobby.state.players.set(id, {name: player?.name ?? '', ready: false, });
    }
  }
}

function updateMatchTimerDisplay() {
  renderMatchTimerDisplay(matchTimerDisplay, globalMatchTimer, matchTime);
}



// Initialize pause menu logic BEFORE networking
initPauseMenu();



const sceneRoot = document.querySelector('#scene');

const hpBarFill = ensureHpBarFill();

const { world, clock } = createWorld(sceneRoot);
const initialMap = getActiveMap();
const spawnPoint = mapCellToWorld(getMapSpawn(initialMap, 0).x, getMapSpawn(initialMap, 0).y);

const keys = createInputState();

const remotePlayers = new Map();

// Life system for all players
const playerLives = {};
const LIFE_TICK_INTERVAL = 0.5; // seconds
const LIFE_TICK_DAMAGE = 0.5;
const INITIAL_LIFE = 15;
let lifeTickAccumulator = 0;
const participantIds = new Set([selfId]);
let room = null;
let sendInput = null;
let sendSnapshot = null;
let receiveInput = null;
let receiveSnapshot = null;
let sendMap = null;
let receiveMap = null;
let sendLobby = null;
let receiveLobby = null;
let lobby = null;
let roomId = '';
let hostId = selfId;
let simulationAccumulator = 0;
let snapshotAccumulator = 0;
let inputAccumulator = 0;
let lastSentInputSignature = '';
const EDIT_CAMERA_SPEED = 30;
const viewPosition = new Vec2(spawnPoint.x, spawnPoint.y);


const localPlayer = createPlayer(selfId, true, colorFromId(selfId), spawnPoint);
playerLives[selfId] = new LifeSystem(INITIAL_LIFE);

// Score display element (must be after localPlayer is defined)
const scoreDisplay = ensureScoreDisplay();
if (localPlayer.score === undefined) localPlayer.score = 0;
function updateScoreDisplay() {
  renderScoreDisplay(scoreDisplay, localPlayer.score ?? 0);
}

function ensureRemotePlayerWithLife(remotePlayers, world, peerId, spawnPosition) {
  let player = remotePlayers.get(peerId);
  if (!player) {
    player = createPlayer(peerId, false, colorFromId(peerId), spawnPosition);
    remotePlayers.set(peerId, player);
    if (!playerLives[peerId]) playerLives[peerId] = new LifeSystem(INITIAL_LIFE);
  }
  // Always re-add car if alive and not present
  if (playerLives[peerId]?.isAlive() && !player.group.parentNode) {
    world.add(player.group);
  }
  // Always remove car if not alive and present
  if (!playerLives[peerId]?.isAlive() && player.group.parentNode) {
    world.remove(player.group);
  }
  return player;
}

const runtimePowerups = createRuntimePowerups({
  world,
  isHost,
  localPlayer,
  selfId,
  getHostId: () => hostId,
  getSendInput: () => sendInput,
  playerLives,
  applyPickupEffect,
  sendSnapshotPacket,
  sendMapPacket,
  playBombDropSound,
  playExplosionSound,
});

const runtimeEditor = createRuntimeEditor({
  isHost,
  statusLabel,
  playHud,
  editorHud,
  toggleEditButton,
  togglePlayButton,
  gameState,
  world,
  localPlayer,
  setupInput,
  keys,
  sceneRoot,
  viewPosition,
  handleResize,
  clock,
  updateEditorView,
});

runtimeEditor.bindToggleButtons();


// Start in play mode
world.add(localPlayer.group);
setupInput(keys);
setupRoom();
setupUi();
initNameUI();
window.addEventListener('click', () => {  //audio context requires user interaction to start on some browsers
  initAudio();
}, { once: true });
window.addEventListener('resize', handleResize);
requestAnimationFrame(loop);

export function setLocalPlayerName(name) {
  if (!lobby) return;

  const existing = lobby.state.players.get(selfId);
  
  lobby.handleLocalName(name);
  updatePauseHostLabel();

  updateNameValidation(name);
}

function setupUi() {

  submitName();

  const handleCopyJoinLink = async () => {
    const shareLink = buildShareUrl(roomId);

    try {
      await navigator.clipboard.writeText(shareLink);
      statusLabel.textContent = `Join link copied: ${shareLink}`;
    } catch {
      statusLabel.textContent = `Clipboard access failed. Share this URL manually: ${shareLink}`;
    }
  };

  const handleNewRoom = () => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('room', createRoomId());
    window.location.href = nextUrl.toString();
  };

  if (copyLinkButton) {
    copyLinkButton.addEventListener('click', handleCopyJoinLink);
  }

  if (pauseCopyLinkButton) {
    pauseCopyLinkButton.addEventListener('click', handleCopyJoinLink);
  }

  if (newRoomButton) {
    newRoomButton.onclick = handleNewRoom;
  }

  if (pauseNewRoomButton) {
    pauseNewRoomButton.onclick = handleNewRoom;
  }

}

function setupRoom() {
  console.log('sendLobby:', sendLobby);

  if (lobby) {
    lobby.state.players.set(selfId, { ready: false });
  }

  roomId = ensureRoomId();
  roomLabel.textContent = `Room: ${roomId}`;
  if (pauseRoomLabel) {
    pauseRoomLabel.textContent = `Room: ${roomId}`;
  }

  if (!canUseMultiplayer()) {
    statusLabel.textContent = `Multiplayer requires HTTPS or localhost. Open ${buildSecureRoomUrl(roomId)} instead.`;
    return;
  }

  room = joinRoom(buildRoomConfig(), roomId);
  [sendInput, receiveInput] = room.makeAction('input');
  [sendSnapshot, receiveSnapshot] = room.makeAction('snapshot');
  [sendMap, receiveMap] = room.makeAction('map');
  [sendLobby, receiveLobby] = room.makeAction('lobby');

  lobby = createLobbyController({
    selfId,
    isHost,
    getActiveParticipantIds,
    sendLobby,
    onStartGame: () => {
      // Show status
      if (isHost()) {
        statusLabel.textContent = 'Game started! \n You are the host.';
      } else {
        statusLabel.textContent = `Game started!`;
      }

      // Update lobby UI with final player statuses before starting game
      if (lobby) {
        lobbyUI.render(lobby, selfId, getActiveParticipantIds, shortId);
      }

      // Set phase and unpause
      gameState.phase = 'playing';
      setPaused(false); // Unpause if paused

      matchTime = 0;
      setLastUnpausedTime(performance.now());
      resetMatch();

      // Ensure main game loop is running
      requestAnimationFrame(loop);
    },

    lobbyRef: lobby,

  });

  // add self with empty name initially
  lobby.state.players.set(selfId, {name: lobby.state.players.get(selfId)?.name || '', ready: false, });
  setLobbyRef(lobby); // Ensure lobbyRef is set immediately
  gameState.phase = 'lobby';

  refreshHostRole();
  updatePeerCount();

  room.onPeerJoin((peerId) => {
    participantIds.add(peerId);
    syncActiveRoster();

    if (isPeerActive(peerId)) {
      ensureRemotePlayerWithLife(remotePlayers, world, peerId, getSpawnPoint(peerId));
    }

    refreshHostRole();
    updatePeerCount();

    if (isHost() && isPeerActive(peerId)) {
      sendMapPacket(peerId);
      sendSnapshotPacket(peerId);
    } else if (!isHost() && isPeerActive(selfId)) {
      sendInputPacket(true);
    }

    // Sync lobby state to new peer
    if (isHost() && lobby) {
      lobby.state.players.set(peerId, { ready: false });

      const players = getActiveParticipantIds().map(id => ({
        id,
        ready: lobby.state.players.get(id)?.ready ?? false,
      }));

      sendLobby({
        type: 'state',
        phase: lobby.state.phase,
        players,
      }, peerId);
    }

  });

  room.onPeerLeave((peerId) => {
    participantIds.delete(peerId);
    const player = remotePlayers.get(peerId);
    if (player) {
      world.remove(player.group);
      remotePlayers.delete(peerId);
    }
    syncActiveRoster();
    refreshHostRole();
    updatePeerCount();

    if (isHost()) {
      sendSnapshotPacket();
    }
  });

  receiveInput((payload, peerId) => {
    if (!isHost() || !isPeerActive(peerId)) {
      return;
    }

    const player = ensureRemotePlayerWithLife(remotePlayers, world, peerId, getSpawnPoint(peerId));
    // Power-up pickup request
    if (payload && payload.pickup) {
      runtimePowerups.handlePickupRequest(payload.pickup, player);
    }
    player.input = normalizeInput(payload);
    player.lastSeenAt = performance.now();
  });

  receiveSnapshot((payload, peerId) => {

    if (!payload || !Array.isArray(payload.players)) {
      return;
    }

    if (payload.phase) {
      lobby.state.phase = payload.phase;
      gameState.phase = payload.phase;
    }

    if ('endgameResults' in payload) {
      gameState.endgameResults = payload.endgameResults ?? null;
    }

    participantIds.add(peerId);
    refreshHostRole(payload.hostId ?? peerId);

    // All clients except host sync matchTime from host
    if (typeof payload.matchTime === 'number' && !isHost()) {
      matchTime = payload.matchTime;
      updateMatchTimerDisplay();
    }

    // All clients apply the full snapshot (players and powerups)
    applySnapshot(payload);
  });

  receiveMap((payload, peerId) => {
    if (!payload?.map) {
      return;
    }

    participantIds.add(peerId);
    refreshHostRole(payload.hostId ?? peerId);

    if (peerId !== hostId) {
      return;
    }

    applyAuthoritativeMap(payload.map);
  });

  receiveLobby((payload, peerId) => {
    if (!lobby) return;
    if (!payload || typeof payload !== 'object') return;
    lobby.handleMessage(payload, peerId);
    updatePauseHostLabel();
  });


  playHud.style.display = 'block';
  // Pause menu UI is managed by pause.js

  // Ensure pause networking is set up for all peers after room and player are ready
  setupPauseNetworking(room, localPlayer);

}

function updatePeerCount() {
  const totalPlayers = getActiveParticipantIds().length;
  peerCountLabel.textContent = `${totalPlayers}/${MAX_PLAYERS} player${totalPlayers === 1 ? '' : 's'} active`;
}

function sendInputPacket(force = false) {
  if (isHost() || !sendInput || hostId === selfId || !isPeerActive(selfId)) {
    return;
  }

  const input = readCurrentInputState(keys);
  const signature = serializeInput(input);

  if (!force && signature === lastSentInputSignature && inputAccumulator < INPUT_SEND_INTERVAL_MS) {
    return;
  }

  inputAccumulator = 0;
  lastSentInputSignature = signature;
  sendInput(input, hostId);
}

function sendSnapshotPacket(targetPeers) {
  if (!isHost() || !sendSnapshot) {
    return;
  }

  const snapshotNow = performance.now() / 1000;
  sendSnapshot({
    hostId: selfId,
    phase: lobby?.state.phase ?? 'playing',
    endgameResults: gameState.endgameResults,
    matchTime,
    players: getAllPlayers().map((player) => ({
      id: player.id,
      x: player.position.x,
      z: player.position.y,
      heading: player.heading,
      vx: player.velocity.x,
      vz: player.velocity.y,
      ready: lobby?.state.players.get(player.id)?.ready ?? false,
      score: player.score ?? 0,
      alive: playerLives[player.id]?.isAlive?.() ?? true,
      life: getPlayerLifeValue(playerLives, player.id, INITIAL_LIFE),
      maxLife: playerLives[player.id]?.maxLife ?? INITIAL_LIFE,
      abilities: serializePlayerAbilities(player),
      heldAbilities: serializeHeldAbilities(player),
      shield: { activeUntil: player.shield?.activeUntil ?? 0 },
      ghost: { remainingSeconds: Math.max(0, (player.ghost?.activeUntil ?? 0) - snapshotNow) },
      collected: player.collected ?? false,
      collided: player.collided ?? false,
      bombDropped: player.bombDropped ?? false
    })),
    powerups: runtimePowerups.getPowerups(),
    bombs: runtimePowerups.getBombs(),
  }, targetPeers);

  // Clear transient event flags after broadcasting them once
  for (const player of getAllPlayers()) {
    player.collected = false;
    player.collided = false;
    player.bombDropped = false;
  }
}

function sendMapPacket(targetPeers) {
  if (!isHost() || !sendMap) {
    return;
  }

  sendMap({
    hostId: selfId,
    map: getActiveMap(),
  }, targetPeers);
}

function handleResize() {
  world.setSize(window.innerWidth, window.innerHeight);
}



function updateHpBar() {
  updateHpBarDisplay(hpBarFill, playerLives[selfId], INITIAL_LIFE);
}

function updateUIVisibility() {
  const isLobby = gameState.phase === 'lobby';
  const nameInputGroup = document.querySelector('.name-input-group');
  const player = lobby?.state.players.get(selfId);

  /*
  if (validatePlayerName(player?.name).valid) {
  readyButton.style.display = gameState.phase === 'lobby' && hasValidName ? 'block' : 'none';
  }*/

  if (nameInputGroup) {
    nameInputGroup.style.display = isLobby ? 'block' : 'none';
  }
  
  // Ready button visibility is handled by name validation
  // But hide it completely when not in lobby
  if (!isLobby) {
    readyButton.style.display = 'none';
  }
  
}

window.addEventListener('keydown', (e) => {
  if (e.key === '1') gameState.phase = 'lobby';
  if (e.key === '2') gameState.phase = 'playing';
  if (e.key === '3') gameState.phase = 'endgame';
  if ((e.key === 'R' || e.key === 'r') && e.shiftKey && isHost()) {
    resetMatch();
    sendSnapshotPacket();
  }
});

function loop() {

  try {
  
  const handleNewMatch = () => {
    if (isHost()) {
      resetMatch();
      sendSnapshotPacket();
    }
  };

  renderUI(gameState, { lobby, playHud, selfId, shortId, getActiveParticipantIds, getHealthPercent, lobbyUI, hostId, handleNewMatch });

  // LOBBY GATING
  if (gameState.phase !== 'playing') {
    updateScoreDisplay();
    world.render();
    requestAnimationFrame(loop);
    return;
  }
  updateScoreDisplay();
  updateMatchTimerDisplay();
  const delta = Math.min(clock.getDelta(), 0.05);

  if (!getPaused()) {
    // Timer only runs when not paused
    if (isHost()) {
      matchTime += (performance.now() - getLastUnpausedTime()) / 1000;
    }
    setLastUnpausedTime(performance.now());

    // Host loop
    if (isHost()) {
      localPlayer.input = readCurrentInputState(keys);
      simulationAccumulator += delta;

      while (simulationAccumulator >= SIMULATION_STEP) {
        simulateAuthoritativeStep(SIMULATION_STEP);
        simulationAccumulator -= SIMULATION_STEP;
      }

      snapshotAccumulator += delta * 1000;
      if (snapshotAccumulator >= SNAPSHOT_SEND_INTERVAL_MS) {
        snapshotAccumulator = 0;
        sendSnapshotPacket();
      }

      syncPlayerTransform(localPlayer);
      for (const remote of remotePlayers.values()) {
        syncPlayerTransform(remote);
      }
    } else {
      inputAccumulator += delta * 1000;
      updatePredictedLocalPlayer(delta);
      updateRemotePlayers(delta);

      sendInputPacket();
    }

    // Life system is host-authoritative and replicated via snapshots.
    if (isHost()) {
      lifeTickAccumulator += delta;
      if (lifeTickAccumulator >= LIFE_TICK_INTERVAL) {
        lifeTickAccumulator = 0;
        const map = getActiveMap();
        // Local player
        if (playerLives[selfId].isAlive() && !isOnFloorOrWall(localPlayer, { ...map, MAP_WORLD_SIZE, MAP_CELL_SIZE })) {
          playerLives[selfId].loseLife(LIFE_TICK_DAMAGE);
          playDamageSound();
          if (!playerLives[selfId].isAlive()) {
            playDespawnSound();
            // Despawn car
            if (localPlayer.group.parentNode) world.remove(localPlayer.group);
            // Award 1 point to all alive remote players
            for (const [peerId, remoteLife] of Object.entries(playerLives)) {
              if (peerId !== selfId && remoteLife.isAlive() && remotePlayers.has(peerId) && remotePlayers.get(peerId).score !== undefined) {
                remotePlayers.get(peerId).score += 1;
              }
            }
          }
        }
        // Remote players
        for (const [peerId, player] of remotePlayers.entries()) {
          if (playerLives[peerId].isAlive() && !isOnFloorOrWall(player, { ...map, MAP_WORLD_SIZE, MAP_CELL_SIZE })) {
            playerLives[peerId].loseLife(LIFE_TICK_DAMAGE);
            playDamageSound();
            if (!playerLives[peerId].isAlive()) {
              playDespawnSound();
              // Despawn car
              if (player.group.parentNode) world.remove(player.group);
              // Award 1 point to all alive players except eliminated
              if (localPlayer && playerLives[selfId].isAlive() && localPlayer.score !== undefined) {
                localPlayer.score += 1;
              }
              for (const [otherPeerId, otherPlayer] of remotePlayers.entries()) {
                if (otherPeerId !== peerId && playerLives[otherPeerId].isAlive() && otherPlayer.score !== undefined) {
                  otherPlayer.score += 1;
                }
              }
            }
          }
        }

        maybeFinishMatch();
      }
    }
  } else {
    // If paused, just update the lastUnpausedTime so timer resumes smoothly
    setLastUnpausedTime(performance.now());
  }

  updateHpBar();
  syncCooldownIndicator(
    abilityCooldownIndicator,
    abilityCooldownIcon,
    ABILITY_DEFINITIONS[ABILITY_IDS.SPEED_BOOST],
    localPlayer.abilities?.[ABILITY_IDS.SPEED_BOOST],
    performance.now() / 1000
  );
  renderHeldAbilitySlots(localPlayer, heldAbilityUiElements);

  const nowSeconds = performance.now() / 1000;

  const shieldActive = (localPlayer.shield?.activeUntil || 0) > nowSeconds;
  const ghostActive = (localPlayer.ghost?.activeUntil || 0) > nowSeconds;

  if (shieldActive) {
    startShieldSound();
  } else {
    stopShieldSound();
  }

  if (ghostActive) {
    startGhostSound();
  } else {
    stopGhostSound();
  }

  // Camera logic: follow car in play mode, free move in edit mode or if eliminated
  if (runtimeEditor.isEditMode() || !playerLives[selfId]?.isAlive()) {
    updateEditorView(delta);
  } else {
    updateWorldView(delta);
  }

  runtimePowerups.renderPowerups();
  runtimePowerups.renderBombs();
  runtimePowerups.tryPickupPowerup();
  world.render();

  // Engine sound update
  const t = localPlayer.speedRamp || 0;

  const boostActive =
    localPlayer.abilities?.speedBoost?.activeUntil > (performance.now() / 1000);

  if (playerLives[selfId]?.isAlive()) {
    updateEngineSound(
      t,
      boostActive ? 1 : 0
    );
  } else {
    localPlayer.speedRamp = 0;
    updateEngineSound(0, 0);
  }

  requestAnimationFrame(loop);

  } catch (err) {
  console.error('LOOP ERROR:', err);
}
}

function maybeFinishMatch() {
  if (!isHost() || gameState.phase !== 'playing') {
    return;
  }

  const activeParticipantIds = getActiveParticipantIds();
  if (!shouldEndMatch(playerLives, activeParticipantIds)) {
    return;
  }

  gameState.endgameResults = buildEndgameResults({
    playerLives,
    participantIds: activeParticipantIds,
    getPlayerById: (id) => {
      if (id === selfId) return localPlayer;
      return remotePlayers.get(id) ?? null;
    },
    getDisplayName: (id) => lobby?.state?.players?.get(id)?.name?.trim() || shortId(id),
  });

  gameState.phase = 'endgame';
  if (lobby) {
    lobby.state.phase = 'endgame';
  }

  sendSnapshotPacket();
}

function updateLocalPlayerAbilityInput(player, input, now) {
  const speedBoostHeld = Boolean(input?.speedBoost);
  const boostJustPressed = speedBoostHeld && !player.abilityInputState?.speedBoostHeld;
  updatePlayerAbilityInput(player, input, now);
  if (boostJustPressed) {
    playSpeedBoostSound();
  }
}

function updatePredictedLocalPlayer(delta) {
  const input = readCurrentInputState(keys);
  const now = performance.now() / 1000;
  updateLocalPlayerAbilityInput(localPlayer, input, now);
  simulateMovement(localPlayer, input, delta, now);
  resolveArenaCollision(localPlayer);
  resolveMapWallCollisions(localPlayer);
  reconcileLocalPlayer(delta);
  syncPlayerTransform(localPlayer);
}

function updateRemotePlayers(delta) {
  const now = performance.now();

  for (const [peerId, player] of remotePlayers.entries()) {
    if (now - player.lastSeenAt > REMOTE_TIMEOUT_MS) {
      world.remove(player.group);
      remotePlayers.delete(peerId);
      updatePeerCount();
      continue;
    }

    player.position.lerp(player.targetPosition, Math.min(1, delta * REMOTE_INTERPOLATION_RATE));
    player.velocity.lerp(player.targetVelocity, Math.min(1, delta * 6));
    player.heading = lerpAngle(player.heading, player.targetHeading, Math.min(1, delta * 10));
    syncPlayerTransform(player);
  }
}

function applyAuthoritativeMap(nextMap) {
  const appliedMap = setSessionMap(nextMap);
  world.setMap(appliedMap);
  syncActiveRoster();

  if (!isHost()) {
    const localSpawn = getSpawnPoint(selfId);
    localPlayer.position.set(localSpawn.x, localSpawn.y);
    localPlayer.previousPosition.copy(localPlayer.position);
    localPlayer.targetPosition.copy(localPlayer.position);
    viewPosition.copy(localPlayer.position);
    world.setViewPosition(viewPosition.x, viewPosition.y);
  }
}

function reconcileLocalPlayer(delta) {
  if (!localPlayer.hasSnapshot) {
    return;
  }

  localPlayer.position.lerp(localPlayer.targetPosition, Math.min(1, delta * LOCAL_RECONCILE_RATE));
  localPlayer.velocity.lerp(localPlayer.targetVelocity, Math.min(1, delta * 6));
  localPlayer.heading = lerpAngle(
    localPlayer.heading,
    localPlayer.targetHeading,
    Math.min(1, delta * LOCAL_RECONCILE_RATE)
  );
}

function updateWorldView(delta) {
  viewPosition.lerp(localPlayer.position, Math.min(1, delta * 5.5));
  world.setViewPosition(viewPosition.x, viewPosition.y);
}

function updateEditorView(delta) {
  const viewStep = EDIT_CAMERA_SPEED * delta;

  if (keys.forward) {
    viewPosition.y -= viewStep;
  }

  if (keys.backward) {
    viewPosition.y += viewStep;
  }

  if (keys.left) {
    viewPosition.x -= viewStep;
  }

  if (keys.right) {
    viewPosition.x += viewStep;
  }

  world.setViewPosition(viewPosition.x, viewPosition.y);
}

function getAllPlayers() {
  const players = [];
  if (isPeerActive(selfId)) {
    players.push(localPlayer);
  }

  return [...players, ...remotePlayers.values()];
}

function simulateAuthoritativeStep(delta) {
  // Only include alive players for movement and collision
  const players = getAllPlayers().filter(p => {
    if (p.id === selfId) return playerLives[selfId]?.isAlive();
    return playerLives[p.id]?.isAlive();
  });

  for (const player of players) {
    const input = player.isLocal
      ? readCurrentInputState(keys)
      : (player.input ?? { forward: false, backward: false, left: false, right: false, strafeLeft: false, strafeRight: false });
    const now = performance.now() / 1000;
    if (player.isLocal) {
      updateLocalPlayerAbilityInput(player, input, now);
    } else {
      updatePlayerAbilityInput(player, input, now);
    }
    simulateMovement(player, input, delta, now);
    
    // Check for collisions with arena and walls
    const prevPosX = player.position.x;
    const prevPosY = player.position.y;
    resolveArenaCollision(player);
    resolveMapWallCollisions(player);
    const arenaOrWallCollided = prevPosX !== player.position.x || prevPosY !== player.position.y;
    if (arenaOrWallCollided && !player.collided) {
      playCollisionSound();
      player.collided = true;
    }
  }

  // Only resolve collisions between alive players
  for (let index = 0; index < players.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < players.length; otherIndex += 1) {
      const prevPos1X = players[index].position.x;
      const prevPos1Y = players[index].position.y;
      const prevPos2X = players[otherIndex].position.x;
      const prevPos2Y = players[otherIndex].position.y;
      
      resolvePlayerCollision(players[index], players[otherIndex]);
      
      // Check if this collision event moved either player (indicates contact)
      const didCollide1 = prevPos1X !== players[index].position.x || prevPos1Y !== players[index].position.y;
      const didCollide2 = prevPos2X !== players[otherIndex].position.x || prevPos2Y !== players[otherIndex].position.y;
      if ((didCollide1 || didCollide2) && (!players[index].collided || !players[otherIndex].collided)) {
        playCollisionSound();
        players[index].collided = true;
        players[otherIndex].collided = true;
      }
    }
  }

  runtimePowerups.simulateAuthoritativeStep(delta, players);
}

function applySnapshot(playerStates) {
  const now = performance.now();

  // Accepts either (players) or ({ players, powerups, bombs })
  let playerList = playerStates;
  let powerupList = undefined;
  let bombList = undefined;
  if (Array.isArray(playerStates)) {
    playerList = playerStates;
  } else if (playerStates && typeof playerStates === 'object') {
    playerList = playerStates.players;
    powerupList = playerStates.powerups;
    bombList = playerStates.bombs;
  }

  runtimePowerups.applySnapshotPowerups(powerupList, bombList);

  for (const playerState of playerList) {
    if (playerState.id === selfId) {
      if (!isHost()) {
        localPlayer.targetPosition.set(playerState.x, playerState.z);
        localPlayer.targetVelocity.set(playerState.vx, playerState.vz);
        localPlayer.targetHeading = playerState.heading;
        localPlayer.score = Number(playerState.score ?? localPlayer.score ?? 0);
        applyPlayerAbilitiesSnapshot(localPlayer, playerState.abilities)        
        applyHeldAbilitiesSnapshot(localPlayer, playerState.heldAbilities);

        if (playerState.collected) {
          playCollectSound();
        }

        if (playerState.collided) {
          playCollisionSound();
        }

        if (playerState.bombDropped) {
          playBombDropSound();
        }

        if (playerState.shield) {
          if (!localPlayer.shield) localPlayer.shield = { activeUntil: 0 };
          localPlayer.shield.activeUntil = playerState.shield.activeUntil;
        }
        if (playerState.ghost) {
          if (!localPlayer.ghost) localPlayer.ghost = { activeUntil: 0 };
          localPlayer.ghost.activeUntil = playerState.ghost.remainingSeconds > 0
            ? performance.now() / 1000 + playerState.ghost.remainingSeconds
            : 0;
        }

        applyLifeSnapshotForPlayer(playerLives, INITIAL_LIFE, playerState.id, playerState);
        localPlayer.pendingBombDrop = null;
        localPlayer.hasSnapshot = true;
        localPlayer.lastSeenAt = now;

        if (playerLives[selfId]?.isAlive?.() && !localPlayer.group.parentNode) {
          world.add(localPlayer.group);
        } else if (!playerLives[selfId]?.isAlive?.() && localPlayer.group.parentNode) {
          world.remove(localPlayer.group);
        }
      }

      continue;
    }

    const player = ensureRemotePlayerWithLife(
      remotePlayers,
      world,
      playerState.id,
      { x: playerState.x, y: playerState.z }
    );

    // FORCE spawn sync from host
    if (!player.hasSpawned) {
      player.position.set(playerState.x, playerState.z);
      player.targetPosition.copy(player.position);
      player.hasSpawned = true;
    }

    if (!player) return; // this causes more problems

    const positionError = player.position.distanceTo(new Vec2(playerState.x, playerState.z));
    const velocityError = player.velocity.distanceTo(new Vec2(playerState.vx, playerState.vz));
    const shouldSnapToSnapshot = positionError >= SNAPSHOT_POSITION_SNAP_DISTANCE
      || velocityError >= SNAPSHOT_VELOCITY_SNAP_DELTA;

    player.targetPosition.set(playerState.x, playerState.z);
    player.targetVelocity.set(playerState.vx, playerState.vz);
    player.targetHeading = playerState.heading;
    player.score = Number(playerState.score ?? player.score ?? 0);
    applyPlayerAbilitiesSnapshot(player, playerState.abilities);
    applyHeldAbilitiesSnapshot(player, playerState.heldAbilities);
    if (playerState.shield) {
      if (!player.shield) player.shield = { activeUntil: 0 };
      player.shield.activeUntil = playerState.shield.activeUntil;
    }
    if (playerState.ghost) {
      if (!player.ghost) player.ghost = { activeUntil: 0 };
      player.ghost.activeUntil = playerState.ghost.remainingSeconds > 0
        ? performance.now() / 1000 + playerState.ghost.remainingSeconds
        : 0;
    }
    applyLifeSnapshotForPlayer(playerLives, INITIAL_LIFE, playerState.id, playerState);
    player.pendingBombDrop = null;
    player.lastSeenAt = now;

    if (shouldSnapToSnapshot) {
      player.position.copy(player.targetPosition);
      player.velocity.copy(player.targetVelocity);
      player.heading = player.targetHeading;
    }

    if (isHost()) {
      player.position.set(playerState.x, playerState.z);
      player.velocity.set(playerState.vx, playerState.vz);
      player.heading = playerState.heading;
    }

    if (playerLives[playerState.id]?.isAlive?.() && !player.group.parentNode) {
      world.add(player.group);
    } else if (!playerLives[playerState.id]?.isAlive?.() && player.group.parentNode) {
      world.remove(player.group);
    }
  }
}

function applyPickupEffect(type, player) {
  applyPowerupEffect(type, player);

  player.collected = true;

  if (player.isLocal) {
    playCollectSound();
  }
}

function getPlayerDisplayName(peerId) {
  const playerName = lobby?.state?.players?.get(peerId)?.name?.trim();
  return playerName || shortId(peerId);
}

function updatePauseHostLabel() {
  if (!pauseHostLabel) {
    return;
  }

  pauseHostLabel.textContent = `Host: ${getPlayerDisplayName(hostId)}`;
}

// Only update hostId from host packets or on join/leave
function refreshHostRole(forcedHostId) {
  if (typeof forcedHostId === 'string') {
    hostId = forcedHostId;
  } else if (participantIds.size > 0) {
    // Only recalculate on join/leave
    hostId = [...participantIds].sort()[0] ?? selfId;
  }

  if (!isPeerActive(selfId)) {
    statusLabel.textContent = `Room full. Only ${MAX_PLAYERS} players can be active.`;
    updatePauseHostLabel();
  } else if (isHost()) {
    statusLabel.textContent = 'You are the authoritative host.';
    updatePauseHostLabel();
  } else {
    statusLabel.textContent = `Authoritative host: ${shortId(hostId)}`;
    updatePauseHostLabel();
  }
}

function isHost() {
  return hostId === selfId;
}

export function getActiveParticipantIds() {
  return [...participantIds].slice(0, MAX_PLAYERS);
}

function isPeerActive(peerId) {
  return getActiveParticipantIds().includes(peerId);
}

function getSpawnPoint(peerId) {
  const spawnIndex = Math.max(0, getActiveParticipantIds().indexOf(peerId));
  const spawnCell = getMapSpawn(getActiveMap(), spawnIndex);
  return mapCellToWorld(spawnCell.x, spawnCell.y);
}

function getHealthPercent(peerId) {
  return getPlayerHealthPercent(playerLives, peerId, INITIAL_LIFE);
}

function syncActiveRoster() {
  for (const [peerId, player] of remotePlayers.entries()) {
    if (!isPeerActive(peerId)) {
      world.remove(player.group);
      remotePlayers.delete(peerId);
    }
  }

  if (!isPeerActive(selfId) && localPlayer.group.parentNode) {
    world.remove(localPlayer.group);
  } else if (isPeerActive(selfId) && !localPlayer.group.parentNode) {
    const spawnPoint = getSpawnPoint(selfId);
    localPlayer.position.set(spawnPoint.x, spawnPoint.y);
    localPlayer.previousPosition.copy(localPlayer.position);
    localPlayer.targetPosition.copy(localPlayer.position);
    viewPosition.copy(localPlayer.position);
    world.setViewPosition(viewPosition.x, viewPosition.y);
    world.add(localPlayer.group);
  }
}
