// =========================
// Imports
// =========================
import './style.css';
import { joinRoom, selfId } from '@trystero-p2p/nostr';
import {
  INPUT_SEND_INTERVAL_MS,
  LOCAL_RECONCILE_RATE,
  MAX_PLAYERS,
  PUBLIC_ORIGIN,
  RELAY_URLS,
  REMOTE_INTERPOLATION_RATE,
  REMOTE_TIMEOUT_MS,
  ROOM_APP_ID,
  SIMULATION_STEP,
  SNAPSHOT_POSITION_SNAP_DISTANCE,
  SNAPSHOT_SEND_INTERVAL_MS,
  SNAPSHOT_VELOCITY_SNAP_DELTA,
  TURN_CREDENTIAL,
  TURN_URLS,
  TURN_USERNAME,
} from './game/config';
import { normalizeInput, readCurrentInputState, serializeInput, setupInput } from './game/input';
import { MAP_WORLD_SIZE, MAP_CELL_SIZE } from './game/map-data';
import { getActiveMap, getMapSpawn, mapCellToWorld, setSessionMap } from './game/map-data';
import { ensureRemotePlayer, colorFromId, createPlayer, syncPlayerTransform } from './game/players';
import { LifeSystem, isOnFloorOrWall } from './game/life.js';
import { createMapEditor } from './game/map-editor';
import { Vec2 } from './game/math';
import { resolveArenaCollision, resolveMapWallCollisions, resolvePlayerCollision, simulateMovement } from './game/physics';
import { createWorld } from './game/scene';
import { isLocalOrPrivateHost, lerpAngle, shortId } from './game/utils';
import { createLobbyController } from './lobby/lobby-controller';

// =========================
// DOM/UI References
// =========================
// ...existing code...
const playHud = document.getElementById('play-hud');
const editorHud = document.getElementById('editor-hud');
const eyebrowLabel = playHud.querySelector('.eyebrow');
const titleLabel = playHud.querySelector('h1');
const roomLabel = playHud.querySelector('#room-label');
const peerCountLabel = playHud.querySelector('#peer-count');
const statusLabel = playHud.querySelector('#status');
const copyLinkButton = playHud.querySelector('#copy-link');
const newRoomButton = playHud.querySelector('#new-room');
const hintLabel = playHud.querySelector('.hint');
const actions = playHud.querySelector('.hud__actions');
const readyButton = document.createElement('button');
readyButton.textContent = 'Ready';
actions.appendChild(readyButton);
const toggleEditButton = playHud.querySelector('#toggle-edit');
const togglePlayButton = playHud.querySelector('#toggle-play');

// Pause menu and timer logic
let isPaused = false;
let matchTime = 0;
let lastUnpausedTime = performance.now();
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const matchTimerDisplay = document.getElementById('match-timer');
const globalMatchTimer = document.getElementById('global-match-timer');
const newMatchBtn = document.getElementById('new-match-btn');


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
  // Only host should execute this
  if (!isHost()) return;
  // Reset life, score, timer, and respawn all players at spawn
  matchTime = 0;
  lastUnpausedTime = performance.now();
  // Local player
  playerLives[selfId].reset(INITIAL_LIFE);
  localPlayer.score = 0;
  localPlayer.velocity.set(0, 0);
  localPlayer.impactVelocity.set(0, 0);
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
    const spawn = getSpawnPoint(peerId);
    player.position.set(spawn.x, spawn.y);
    player.previousPosition.copy(player.position);
    player.targetPosition.copy(player.position);
    if (!player.group.parentNode) world.add(player.group);
  }
  updateHpBar();
  updateScoreDisplay();
  updateMatchTimerDisplay();
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateMatchTimerDisplay() {
  matchTimerDisplay.textContent = formatTime(matchTime);
  if (globalMatchTimer) globalMatchTimer.textContent = formatTime(matchTime);
}

function setPaused(paused) {
  isPaused = paused;
  pauseMenu.style.display = paused ? 'flex' : 'none';
  if (!paused) lastUnpausedTime = performance.now();
}

resumeBtn.addEventListener('click', () => setPaused(false));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setPaused(!isPaused);
});



const sceneRoot = document.querySelector('#scene');
// ...existing code...

// Create HP bar as a direct child of body for maximum overlay visibility
let hpBarContainer = document.getElementById('hp-bar-container');
let hpBarFill = null;
if (!hpBarContainer) {
  hpBarContainer = document.createElement('div');
  hpBarContainer.id = 'hp-bar-container';
  hpBarContainer.innerHTML = `
    <div id="hp-bar-bg">
      <div id="hp-bar-fill"></div>
    </div>
  `;
  document.body.appendChild(hpBarContainer);
}
hpBarFill = hpBarContainer.querySelector('#hp-bar-fill');

const { world, clock } = createWorld(sceneRoot);
const initialMap = getActiveMap();
const spawnPoint = mapCellToWorld(getMapSpawn(initialMap, 0).x, getMapSpawn(initialMap, 0).y);

const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  strafeLeft: false,
  strafeRight: false,
};

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
let scoreDisplay = document.getElementById('score-display');
if (!scoreDisplay) {
  scoreDisplay = document.createElement('div');
  scoreDisplay.id = 'score-display';
  document.body.appendChild(scoreDisplay);
}
if (localPlayer.score === undefined) localPlayer.score = 0;
function updateScoreDisplay() {
  scoreDisplay.textContent = `Score: ${localPlayer.score ?? 0}`;
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


let isEditMode = false;
let mapEditorInstance = null;



function enterEditMode() {
  // Only host can enter edit mode
  if (!isHost()) {
    statusLabel.textContent = 'Only the host can use the map editor.';
    return;
  }
  isEditMode = true;
  playHud.style.display = 'none';
  editorHud.style.display = '';
  // Show edit toggle
  toggleEditButton.style.display = 'none';
  togglePlayButton.style.display = '';
  // Start editor, pass editorHud as the UI container
  mapEditorInstance = startMapEditor(editorHud);
}


function exitEditMode() {
  isEditMode = false;
  playHud.style.display = '';
  editorHud.style.display = 'none';
  // Show edit toggle
  toggleEditButton.style.display = '';
  togglePlayButton.style.display = 'none';
  // Destroy editor UI if present
  if (mapEditorInstance && typeof mapEditorInstance.destroy === 'function') {
    mapEditorInstance.destroy();
    mapEditorInstance = null;
  }
  // Resume play controls and loop
  world.add(localPlayer.group);
  setupInput(keys);
  requestAnimationFrame(loop);
}

toggleEditButton.addEventListener('click', () => {
  if (!isEditMode) {
    enterEditMode();
  }
});
togglePlayButton.addEventListener('click', () => {
  if (isEditMode) {
    exitEditMode();
  }
});

// Start in play mode
world.add(localPlayer.group);
setupInput(keys);
setupRoom();
setupUi();
window.addEventListener('resize', handleResize);
requestAnimationFrame(loop);



function startMapEditor(editorHudContainer) {
  // Clear previous editor HUD
  editorHudContainer.innerHTML = '';
  // Create a new HUD card for the editor
  const editorCard = document.createElement('div');
  editorCard.className = 'hud__card';
  editorHudContainer.appendChild(editorCard);
  // Create UI references for the editor
  const ui = {
    eyebrow: document.createElement('p'),
    title: document.createElement('h1'),
    roomLabel: document.createElement('p'),
    peerCountLabel: document.createElement('p'),
    statusLabel: document.createElement('p'),
    copyLinkButton: document.createElement('button'),
    newRoomButton: document.createElement('button'),
    hintLabel: document.createElement('p'),
    actions: document.createElement('div'),
  };
  ui.eyebrow.className = 'eyebrow';
  ui.roomLabel.id = 'room-label';
  ui.peerCountLabel.id = 'peer-count';
  ui.statusLabel.id = 'status';
  ui.copyLinkButton.id = 'copy-link';
  ui.newRoomButton.id = 'new-room';
  ui.hintLabel.className = 'hint';
  ui.actions.className = 'hud__actions';
  // Add Play Game button to editor HUD
  const playButton = document.createElement('button');
  playButton.id = 'editor-toggle-play';
  playButton.textContent = 'Play Game';
  playButton.style.marginRight = '0.5rem';
  playButton.onclick = () => {
    if (typeof exitEditMode === 'function') exitEditMode();
  };
  ui.actions.appendChild(playButton);
  editorCard.appendChild(ui.eyebrow);
  editorCard.appendChild(ui.title);
  editorCard.appendChild(ui.roomLabel);
  editorCard.appendChild(ui.actions);
  editorCard.appendChild(ui.hintLabel);
  editorCard.appendChild(ui.peerCountLabel);
  editorCard.appendChild(ui.statusLabel);
  editorCard.appendChild(ui.copyLinkButton);
  editorCard.appendChild(ui.newRoomButton);
  // Remove player group from world if present
  if (localPlayer.group.parentNode) {
    world.remove(localPlayer.group);
  }
  // Start editor
  const editor = createMapEditor(sceneRoot, world, ui);
  setupInput(keys);
  viewPosition.set(0, 0);
  world.setViewPosition(viewPosition.x, viewPosition.y);
  window.addEventListener('resize', handleResize);
  requestAnimationFrame(mapEditorLoop);
  return editor;
}


function mapEditorLoop() {
  if (!isEditMode) return;
  const delta = Math.min(clock.getDelta(), 0.05);
  updateEditorView(delta);
  world.render();
  requestAnimationFrame(mapEditorLoop);
}

function setupUi() {
  copyLinkButton.addEventListener('click', async () => {
    const shareLink = buildShareUrl();

    try {
      await navigator.clipboard.writeText(shareLink);
      statusLabel.textContent = `Join link copied: ${shareLink}`;
    } catch {
      statusLabel.textContent = `Clipboard access failed. Share this URL manually: ${shareLink}`;
    }
  });

  newRoomButton.addEventListener('click', () => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('room', createRoomId());
    window.location.href = nextUrl.toString();
  });

  readyButton.addEventListener('click', () => {
    if (!lobby) return;
    lobby.handleLocalReady(true);
  });

}

function setupRoom() {
  roomId = ensureRoomId();
  roomLabel.textContent = `Room: ${roomId}`;

  if (!canUseMultiplayer()) {
    statusLabel.textContent = `Multiplayer requires HTTPS or localhost. Open ${buildSecureRoomUrl()} instead.`;
    return;
  }

  room = joinRoom(buildRoomConfig(), roomId);
  [sendInput, receiveInput] = room.makeAction('input');
  [sendSnapshot, receiveSnapshot] = room.makeAction('snapshot');
  [sendMap, receiveMap] = room.makeAction('map');
  [sendLobby, receiveLobby] = room.makeAction('lobby');

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

  lobby = createLobbyController({
    selfId,
    isHost,
    getActiveParticipantIds,
    sendLobby,
    onStartGame: () => {
      statusLabel.textContent = 'Game started!';
    },
  });

    if (isHost() && isPeerActive(peerId)) {
      sendMapPacket(peerId);
      sendSnapshotPacket(peerId);
    } else if (!isHost() && isPeerActive(selfId)) {
      sendInputPacket(true);
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
    player.input = normalizeInput(payload);
    player.lastSeenAt = performance.now();
  });

  receiveSnapshot((payload, peerId) => {
    if (!payload || !Array.isArray(payload.players)) {
      return;
    }

    participantIds.add(peerId);
    refreshHostRole(payload.hostId ?? peerId);

    // All clients except host sync matchTime from host
    if (typeof payload.matchTime === 'number' && !isHost()) {
      matchTime = payload.matchTime;
      updateMatchTimerDisplay();
    }

    if (peerId !== hostId) {
      return;
    }

    applySnapshot(payload.players);
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
    lobby.handleMessage(payload, peerId);
  });

}

function ensureRoomId() {
  const url = new URL(window.location.href);
  let nextRoomId = url.searchParams.get('room');

  if (!nextRoomId) {
    nextRoomId = createRoomId();
    url.searchParams.set('room', nextRoomId);
    window.history.replaceState({}, '', url);
  }

  return nextRoomId;
}

function createRoomId() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

function buildRoomConfig() {
  const config = {
    appId: ROOM_APP_ID,
  };

  if (RELAY_URLS.length > 0) {
    config.relayUrls = RELAY_URLS;
  }

  const turnServer = buildTurnServer();
  if (turnServer) {
    config.turnConfig = [turnServer];
  }

  return config;
}

function buildShareUrl() {
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('room', roomId || ensureRoomId());

  const shareOrigin = getShareOrigin();
  if (!shareOrigin) {
    return currentUrl.toString();
  }

  const shareUrl = new URL(shareOrigin);
  shareUrl.search = currentUrl.search;
  shareUrl.hash = currentUrl.hash;
  return shareUrl.toString();
}

function describeShareability() {
  const shareOrigin = getShareOrigin();

  if (shareOrigin && !isLocalOrPrivateHost(window.location.hostname)) {
    return `Public join link ready from ${shareOrigin}.`;
  }

  if (isLocalOrPrivateHost(window.location.hostname)) {
    return 'Running on a local or private host. Deploy to public HTTPS for off-network invite links.';
  }

  return 'Waiting for peers...';
}

function getShareOrigin() {
  if (PUBLIC_ORIGIN) {
    return PUBLIC_ORIGIN;
  }

  if (window.location.protocol === 'https:' && !isLocalOrPrivateHost(window.location.hostname)) {
    return window.location.origin;
  }

  return '';
}

function buildTurnServer() {
  if (TURN_URLS.length === 0) {
    return null;
  }

  return {
    urls: TURN_URLS,
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  };
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

  sendSnapshot({
    hostId: selfId,
    matchTime,
    players: getAllPlayers().map((player) => ({
      id: player.id,
      x: player.position.x,
      z: player.position.y,
      heading: player.heading,
      vx: player.velocity.x,
      vz: player.velocity.y,
    })),
  }, targetPeers);
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
  if (!hpBarFill || !playerLives[selfId]) return;
  const hp = playerLives[selfId].getLife ? playerLives[selfId].getLife() : playerLives[selfId].life;
  const maxHp = playerLives[selfId].maxLife || 15;
  const percent = Math.max(0, Math.min(1, hp / maxHp));
  // Reverse: fill from left, empty to right
  hpBarFill.style.width = (percent * 100) + '%';
}

function loop() {
  updateScoreDisplay();
  updateMatchTimerDisplay();
  if (globalMatchTimer) globalMatchTimer.textContent = formatTime(matchTime);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (!isPaused) {
    // Timer only runs when not paused
    if (isHost()) {
      matchTime += (performance.now() - lastUnpausedTime) / 1000;
    }
    lastUnpausedTime = performance.now();

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

    // Life system tick: damage if outside floor/wall every 0.5s
    lifeTickAccumulator += delta;
    if (lifeTickAccumulator >= LIFE_TICK_INTERVAL) {
      lifeTickAccumulator = 0;
      const map = getActiveMap();
      // Local player
      if (playerLives[selfId].isAlive() && !isOnFloorOrWall(localPlayer, { ...map, MAP_WORLD_SIZE, MAP_CELL_SIZE })) {
        playerLives[selfId].loseLife(LIFE_TICK_DAMAGE);
        if (!playerLives[selfId].isAlive()) {
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
          if (!playerLives[peerId].isAlive()) {
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
    }
  } else {
    // If paused, just update the lastUnpausedTime so timer resumes smoothly
    lastUnpausedTime = performance.now();
  }

  updateHpBar();

  // Camera logic: follow car in play mode, free move in edit mode or if eliminated
  if (isEditMode || !playerLives[selfId]?.isAlive()) {
    updateEditorView(delta);
  } else {
    updateWorldView(delta);
  }

  world.render();
  requestAnimationFrame(loop);
}

function updatePredictedLocalPlayer(delta) {
  simulateMovement(localPlayer, readCurrentInputState(keys), delta);
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
    const input = player.isLocal ? readCurrentInputState(keys) : player.input;
    simulateMovement(player, input, delta);
    resolveArenaCollision(player);
    resolveMapWallCollisions(player);
  }

  // Only resolve collisions between alive players
  for (let index = 0; index < players.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < players.length; otherIndex += 1) {
      resolvePlayerCollision(players[index], players[otherIndex]);
    }
  }
}

function applySnapshot(playerStates) {
  const now = performance.now();

  for (const playerState of playerStates) {
    if (playerState.id === selfId) {
      if (!isHost()) {
        localPlayer.targetPosition.set(playerState.x, playerState.z);
        localPlayer.targetVelocity.set(playerState.vx, playerState.vz);
        localPlayer.targetHeading = playerState.heading;
        localPlayer.hasSnapshot = true;
        localPlayer.lastSeenAt = now;
      }

      continue;
    }

    const player = ensureRemotePlayerWithLife(
      remotePlayers,
      world,
      playerState.id,
      { x: playerState.x, y: playerState.z }
    );

    const positionError = player.position.distanceTo(new Vec2(playerState.x, playerState.z));
    const velocityError = player.velocity.distanceTo(new Vec2(playerState.vx, playerState.vz));
    const shouldSnapToSnapshot = positionError >= SNAPSHOT_POSITION_SNAP_DISTANCE
      || velocityError >= SNAPSHOT_VELOCITY_SNAP_DELTA;

    player.targetPosition.set(playerState.x, playerState.z);
    player.targetVelocity.set(playerState.vx, playerState.vz);
    player.targetHeading = playerState.heading;
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
  }
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
  } else if (isHost()) {
    statusLabel.textContent = 'You are the authoritative host.';
  } else {
    statusLabel.textContent = `Authoritative host: ${shortId(hostId)}`;
  }
}

function isHost() {
  return hostId === selfId;
}

function getActiveParticipantIds() {
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

function canUseMultiplayer() {
  return window.isSecureContext && typeof RTCPeerConnection !== 'undefined' && Boolean(globalThis.crypto?.subtle);
}

function buildSecureRoomUrl() {
  const secureUrl = new URL(window.location.href);
  secureUrl.protocol = 'https:';
  secureUrl.searchParams.set('room', roomId || ensureRoomId());
  return secureUrl.toString();
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