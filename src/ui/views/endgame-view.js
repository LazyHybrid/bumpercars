export function renderEndgameUI(gameState) {
  document.body.dataset.state = 'endgame'

  show('#lobby-list')

  hide('#hp-bar-container')

  // later:
  // show results modal
}