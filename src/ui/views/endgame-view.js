import { show, hide } from '../dom.js';

export function renderEndgameUI(gameState) {
  document.body.dataset.state = 'endgame'

  show('#lobby-list')
  show('.hud__actions')

  hide('#hp-bar-container')

  // later:
  // show results modal
}