import './style.css';
import * as THREE from 'three';
import { joinRoom, selfId } from '@trystero-p2p/nostr';
import {
  INPUT_SEND_INTERVAL_MS,
  LOCAL_RECONCILE_RATE,
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
import { ensureRemotePlayer, colorFromId, createPlayer, syncPlayerTransform } from './game/players';
import { resolveArenaCollision, resolvePlayerCollision, simulateMovement } from './game/physics';
import { createWorld } from './game/scene';
import { isLocalOrPrivateHost, lerpAngle, shortId } from './game/utils';

const canvas = document.querySelector('#scene');
const roomLabel = document.querySelector('#room-label');
const peerCountLabel = document.querySelector('#peer-count');
const statusLabel = document.querySelector('#status');
const copyLinkButton = document.querySelector('#copy-link');
const newRoomButton = document.querySelector('#new-room');

const { renderer, scene, camera, clock } = createWorld(canvas);

const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  strafeLeft: false,
  strafeRight: false,
};

const remotePlayers = new Map();
const participantIds = new Set([selfId]);
let room = null;
let sendInput = null;
let sendSnapshot = null;
let receiveInput = null;
let receiveSnapshot = null;
let roomId = '';
let hostId = selfId;
let simulationAccumulator = 0;
let snapshotAccumulator = 0;
let inputAccumulator = 0;
let lastSentInputSignature = '';

const localPlayer = createPlayer(selfId, true, colorFromId(selfId), new THREE.Vector3(0, 0, 0));
scene.add(localPlayer.group);

setupInput(keys);
setupRoom();
setupUi();
window.addEventListener('resize', handleResize);
requestAnimationFrame(loop);

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
}

function setupRoom() {
  roomId = ensureRoomId();
  roomLabel.textContent = `Room: ${roomId}`;

  room = joinRoom(buildRoomConfig(), roomId);
  [sendInput, receiveInput] = room.makeAction('input');
  [sendSnapshot, receiveSnapshot] = room.makeAction('snapshot');

  refreshHostRole();
  updatePeerCount();

  room.onPeerJoin((peerId) => {
    participantIds.add(peerId);
    ensureRemotePlayer(remotePlayers, scene, peerId);
    refreshHostRole();
    updatePeerCount();

    if (isHost()) {
      sendSnapshotPacket(peerId);
    } else {
      sendInputPacket(true);
    }
  });

  room.onPeerLeave((peerId) => {
    participantIds.delete(peerId);
    const player = remotePlayers.get(peerId);
    if (player) {
      scene.remove(player.group);
      remotePlayers.delete(peerId);
    }
    refreshHostRole();
    updatePeerCount();

    if (isHost()) {
      sendSnapshotPacket();
    }
  });

  receiveInput((payload, peerId) => {
    if (!isHost()) {
      return;
    }

    const player = ensureRemotePlayer(remotePlayers, scene, peerId);
    player.input = normalizeInput(payload);
    player.lastSeenAt = performance.now();
  });

  receiveSnapshot((payload, peerId) => {
    if (!payload || !Array.isArray(payload.players)) {
      return;
    }

    participantIds.add(peerId);
    refreshHostRole(payload.hostId ?? peerId);

    if (peerId !== hostId) {
      return;
    }

    applySnapshot(payload.players);
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
  const totalPlayers = participantIds.size;
  peerCountLabel.textContent = `${totalPlayers} player${totalPlayers === 1 ? '' : 's'} connected`;
}

function sendInputPacket(force = false) {
  if (isHost() || !sendInput || hostId === selfId) {
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

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function loop() {
  const delta = Math.min(clock.getDelta(), 0.05);

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

  updateCamera(delta);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function updatePredictedLocalPlayer(delta) {
  simulateMovement(localPlayer, readCurrentInputState(keys), delta);
  resolveArenaCollision(localPlayer);
  reconcileLocalPlayer(delta);
  syncPlayerTransform(localPlayer);
}

function updateRemotePlayers(delta) {
  const now = performance.now();

  for (const [peerId, player] of remotePlayers.entries()) {
    if (now - player.lastSeenAt > REMOTE_TIMEOUT_MS) {
      scene.remove(player.group);
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

function updateCamera(delta) {
  const forward = new THREE.Vector3(Math.sin(localPlayer.heading), 0, Math.cos(localPlayer.heading));
  const desiredPosition = new THREE.Vector3(
    localPlayer.position.x,
    7.2,
    localPlayer.position.y
  )
    .addScaledVector(forward, -8.6)
    .add(new THREE.Vector3(0, 2.1, 0));

  camera.position.lerp(desiredPosition, Math.min(1, delta * 4.8));

  const lookTarget = new THREE.Vector3(localPlayer.position.x, 1.2, localPlayer.position.y)
    .addScaledVector(forward, 3.2);
  camera.lookAt(lookTarget);
}

function getAllPlayers() {
  return [localPlayer, ...remotePlayers.values()];
}

function simulateAuthoritativeStep(delta) {
  const players = getAllPlayers();

  for (const player of players) {
    const input = player.isLocal ? readCurrentInputState(keys) : player.input;
    simulateMovement(player, input, delta);
    resolveArenaCollision(player);
  }

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

    const player = ensureRemotePlayer(
      remotePlayers,
      scene,
      playerState.id,
      new THREE.Vector3(playerState.x, 0, playerState.z)
    );

    const positionError = player.position.distanceTo(new THREE.Vector2(playerState.x, playerState.z));
    const velocityError = player.velocity.distanceTo(new THREE.Vector2(playerState.vx, playerState.vz));
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

function refreshHostRole(forcedHostId) {
  const nextHostId = forcedHostId ?? [...participantIds].sort()[0] ?? selfId;
  hostId = nextHostId;

  if (isHost()) {
    statusLabel.textContent = 'You are the authoritative host.';
  } else {
    statusLabel.textContent = `Authoritative host: ${shortId(hostId)}`;
  }
}

function isHost() {
  return hostId === selfId;
}