export function createLobbyUI(playHud) {
  const lobbyList = document.createElement('div');
  lobbyList.id = 'lobby-list';
  playHud.appendChild(lobbyList);
  const readyButton = document.createElement('button');
  readyButton.textContent = 'Ready';
  playHud.appendChild(readyButton);

  readyButton.addEventListener('click', () => {
    if (!lobby) return;
    const current = lobby.state.players.get(selfId)?.ready ?? false;
    lobby.handleLocalReady(!current);
    });

  function render(lobby, selfId, getActiveParticipantIds, shortId) {
    if (!lobby) return;

    const active = getActiveParticipantIds();

    lobbyList.innerHTML = active.map(id => {
      const ready = lobby.state.players.get(id)?.ready;
      return `${id === selfId ? 'You' : shortId(id)}: ${ready ? '✅' : '❌'}`;
    }).join('<br>');
  }

  return { render };
}

function updateUIVisibility() {
  if (!lobby) return;

  if (lobby.state.phase === 'lobby') {
    playHud.style.display = 'block';
    pauseMenu.style.display = 'none';
  } else if (lobby.state.phase === 'playing') {
    playHud.style.display = 'block'; // tai halutessa piiloon
  }
}