import { show, hide } from '../dom.js';

export function renderPlayingUI(gameState) {
  document.body.dataset.state = 'playing'

  // jätetään tämä näkyviin!
  show('#lobby-list')

  hide('#toggle-play')
  hide('.name-input-group')

  show('#global-match-timer')
  show('#score-display')
  show('#hp-bar-container')
}

export function cleanupPlayingUI() {
  // placeholder for any cleanup needed when leaving playing phase
}