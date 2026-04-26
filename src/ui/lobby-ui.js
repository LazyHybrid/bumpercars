export function createLobbyUI(playHud) {
  const lobbyList = document.createElement('div');
  lobbyList.id = 'lobby-list';
  playHud.appendChild(lobbyList);

  function render(lobby, selfId, getActiveParticipantIds, shortId) {
    if (!lobby) return;

    const active = getActiveParticipantIds();

    lobbyList.innerHTML =
      `<b><p class="eyebrow">Players:</p>` +
      active.map(id => {
        const player = lobby.state.players.get(id);
        const name = player?.name || shortId(id);
        const ready = player?.ready;
        const displayName = id === selfId ? 'You' : name;
        return `${displayName}: ${ready ? '✅' : '❌'}`;
      }).join('<br>');
  }

  return { render };
}

