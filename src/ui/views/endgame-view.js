import { show, hide } from '../dom.js';

export function renderEndgameUI(gameState) {
  document.body.dataset.state = 'endgame'

  show('#lobby-list')
  show('.hud__actions')

  hide('#hp-bar-container')
  hide('#ability-slots')
  hide('#ability-cooldown-indicator')

  // later:
  // show results modal
}