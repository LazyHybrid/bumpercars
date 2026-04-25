// Name input elements
const playerNameInput = document.getElementById('player-name');
const nameFeedback = document.getElementById('name-feedback');

// Name validation and ready button logic
let localPlayerName = '';

export function validatePlayerName(name) {
  if (!name || name.trim().length === 0) {
    return { valid: false, message: 'Name cannot be empty' };
  }
  if (name.length > 20) {
    return { valid: false, message: 'Name too long (max 20 chars)' };
  }
  // Check for uniqueness among active players
  const activeIds = getActiveParticipantIds();
  for (const id of activeIds) {
    if (id !== selfId) {
      const player = lobby?.state.players.get(id);
      if (player?.name && player.name.toLowerCase() === name.toLowerCase()) {
        return { valid: false, message: 'Name already taken' };
      }
    }
  }
  return { valid: true, message: 'Name available' };
}

export function updateNameValidation() {
  const name = playerNameInput.value.trim();
  const validation = validatePlayerName(name);
  
  nameFeedback.textContent = validation.message;
  nameFeedback.className = 'name-feedback ' + (validation.valid ? 'success' : 'error');
  
  // Show ready button only if name is valid
  readyButton.style.display = validation.valid ? 'inline-block' : 'none';
  
  if (validation.valid) {
    localPlayerName = name;
    if (lobby) {
      lobby.handleLocalName(name);
    }
  }
}

// Name input event listeners
playerNameInput.addEventListener('input', updateNameValidation);
playerNameInput.addEventListener('blur', updateNameValidation);

