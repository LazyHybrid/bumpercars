import {gameState, lobbyRef, statusLabel, readyButton, setLocalPlayerName, getActiveParticipantIds} from '../main.js';
import {selfId } from '@trystero-p2p/nostr';

// Name input elements
const playerNameInput = document.getElementById('player-name');
const nameFeedback = document.getElementById('name-feedback');
const nameSubmitBtn = document.getElementById('name-submit-btn');

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
      const player = lobbyRef?.state.players.get(id);
      if (player?.name && (player.name.toLowerCase() === name.toLowerCase())) {
        return { valid: false, message: 'Name already taken' };
      }
    }
  }
  return { valid: true, message: 'Name available' };
}

export function updateNameValidation() {
  const name = playerNameInput.value.trim();
  const validation = validatePlayerName(name);
  //console.log('Name validation from updateNameValidation:', validation);
  
  nameFeedback.textContent = validation.message;
  nameFeedback.className = 'name-feedback ' + (validation.valid ? 'success' : 'error');
  
  //readyButton.style.display = validation.valid ? 'inline-block' : 'none';
}

export function initNameUI() {
    // Name input event listeners
    playerNameInput.addEventListener('input', () => {
    updateNameValidation();
    });
    
    playerNameInput.addEventListener('blur', updateNameValidation);
}

export function submitName() {
  if (gameState.phase !== 'lobby') return;

  if (!playerNameInput) return;
  
  if (!lobbyRef) {
    console.warn('Lobby not ready yet');
  //  return;
  }

  const name = playerNameInput.value.trim();

  if (!name) {
    nameFeedback.textContent = 'Name cannot be empty';
    nameFeedback.className = 'name-feedback error';
    return;
  }

  const validation = validatePlayerName(name);
  if (!validation.valid) {
    //console.log("Name validation failed:", validation.message);
    nameFeedback.textContent = validation.message;
    nameFeedback.className = 'name-feedback error';
    statusLabel.textContent = '';
    return;
  }

  //console.log('Name validation passed:', validation.message);
  setLocalPlayerName(name);
  statusLabel.textContent = `Name set: ${name}`;
}

// Button click
nameSubmitBtn?.addEventListener('click', () => {
    const validation = validatePlayerName(playerNameInput.value.trim());
    const readyButton = document.getElementById('ready-btn');
    readyButton.style.display = validation.valid ? 'inline-block' : 'none';
    submitName();
});

// Enter key support
playerNameInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const validation = validatePlayerName(playerNameInput.value.trim());
    const readyButton = document.getElementById('ready-btn');
    readyButton.style.display = validation.valid ? 'inline-block' : 'none';
    submitName();
  }
});