import { show, hide } from '../dom.js';

export function renderPlayingUI(gameState) {
  document.body.dataset.state = 'playing'

  // jätetään tämä näkyviin!
  show('#lobby-list')

  hide('#toggle-play')
  hide('.name-input-group')
  hide('.hud__actions')

  show('#global-match-timer')
  show('#score-display')
  show('#hp-bar-container')
  show('#ability-slots')
  show('#ability-cooldown-indicator')
}

export function cleanupPlayingUI() {
  hide('#ability-slots')
  hide('#ability-cooldown-indicator')
}