export function createLobbyUI(playHud) {
  const lobbyList = document.createElement('div');
  lobbyList.id = 'lobby-list';
  playHud.appendChild(lobbyList);

  function render(lobby, selfId, getActiveParticipantIds, shortId) {
    if (!lobby) return;

    const active = getActiveParticipantIds();

    lobbyList.innerHTML =
      `<b>Phase: ${lobby.state.phase}</b><br><br>` +
      active.map(id => {
        const ready = lobby.state.players.get(id)?.ready;
        return `${id === selfId ? 'You' : shortId(id)}: ${ready ? '✅' : '❌'}`;
      }).join('<br>');
  }

  return { render };
}

