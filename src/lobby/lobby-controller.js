// src/lobby/lobby-controller.js

import { createLobbyState, setPlayerReady, setPlayerName, setPlayers, allPlayersReady,} from './lobby-state';
import { renderLobby } from '../main.js';

export function createLobbyController({
  selfId,
  isHost,
  getActiveParticipantIds,
  sendLobby,
  onStartGame,
  onStateChange = () => {
    renderLobby(); // TAI lobbyUI.render(...)
  }
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

  function handleLocalName(name) {
    setPlayerName(state, selfId, name);
    onStateChange?.();
    if (isHost()) {
      broadcastState();
    } else {
      sendLobby({ type: 'name', name });
    }
  }

  function handleMessage(payload, peerId) {
    if (!payload) return;

    if (payload.type === 'ready') {
      if (!isHost()) return;

      setPlayerReady(state, peerId, payload.ready);
      onStateChange?.();
      broadcastState();
      maybeStart();
    }

    if (payload.type === 'name') {
      if (!isHost()) return;

      setPlayerName(state, peerId, payload.name);
      onStateChange?.();
      broadcastState();
    }

    if (payload.type === 'state') {
      setPlayers(state, payload.players);

      state.phase = payload.phase ?? state.phase;

      onStateChange?.();

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
      name: state.players.get(id)?.name || '',
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
    handleLocalName,
    handleMessage,
  };
}