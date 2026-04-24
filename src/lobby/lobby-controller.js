// src/lobby/lobby-controller.js

import {
  createLobbyState,
  setPlayerReady,
  setPlayers,
  allPlayersReady,
} from './lobby-state';

export function createLobbyController({
  selfId,
  isHost,
  getActiveParticipantIds,
  sendLobby,
  onStartGame,
}) {
  const state = createLobbyState(selfId);

  function handleLocalReady(ready) {
    if (isHost()) {
      setPlayerReady(state, selfId, ready);
      broadcastState();
      maybeStart();
    } else {
      sendLobby({ type: 'ready', ready });
    }
  }

  function handleMessage(payload, peerId) {
    if (!payload) return;

    if (payload.type === 'ready') {
      if (!isHost()) return;

      setPlayerReady(state, peerId, payload.ready);
      broadcastState();
      maybeStart();
    }

    if (payload.type === 'state') {
      setPlayers(state, payload.players);
    }

    if (payload.type === 'start') {
      state.phase = 'playing';
      onStartGame();
    }
  }

  function broadcastState() {
    if (!isHost()) return;

    const players = getActiveParticipantIds().map(id => ({
      id,
      ready: state.players.get(id)?.ready ?? false,
    }));

    sendLobby({
      type: 'state',
      players,
    });
  }

  function maybeStart() {
    if (!isHost()) return;

    const active = getActiveParticipantIds();

    if (allPlayersReady(state, active)) {
      sendLobby({ type: 'start' });
      state.phase = 'playing';
      onStartGame();
    }
  }

  return {
    state,
    handleLocalReady,
    handleMessage,
  };
}