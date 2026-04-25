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
      if (payload.phase === 'playing') {
        state.phase = 'playing';
        onStartGame();
      }
    }

    if (payload.type === 'start') {
      state.phase = 'playing';
      onStartGame();
    }
  }

  function broadcastState() {
    if (!isHost()) return;

    if (typeof sendLobby !== 'function') {
      console.warn('sendLobby not ready');
      return;
    }

    const players = getActiveParticipantIds().map(id => ({
      id,
      ready: state.players.get(id)?.ready ?? false,
    }));

    sendLobby({
      type: 'state',
      phase: state.phase,
      players,
    });
  }

  function maybeStart() {
    if (!isHost()) return;

    const active = getActiveParticipantIds();

    if (active.length < 2) {
      return;
    }

    if (allPlayersReady(state, active)) {
      state.phase = 'playing';
      if (typeof sendLobby === 'function') {
        sendLobby({ type: 'start' });
      }
      onStartGame();
    }
  }

  return {
    state,
    handleLocalReady,
    handleMessage,
  };
}