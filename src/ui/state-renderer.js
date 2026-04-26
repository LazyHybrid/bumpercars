// ui/state-renderer.js

import { renderLobbyUI, cleanupLobbyUI } from './views/lobby-view.js'
import { renderPlayingUI, cleanupPlayingUI } from './views/playing-view.js'
import { renderEndgameUI } from './views/endgame-view.js'

let currentPhase = null

export function renderUI(gameState) {
  const nextPhase = gameState.phase

  if (nextPhase === currentPhase) return

  // cleanup previous
  switch (currentPhase) {
    case 'lobby':
      cleanupLobbyUI()
      break
    case 'playing':
      cleanupPlayingUI()
      break
  }

  // render next
  switch (nextPhase) {
    case 'lobby':
      renderLobbyUI(gameState)
      break

    case 'playing':
      renderPlayingUI(gameState)
      break

    case 'endgame':
      renderEndgameUI(gameState)
      break
  }

  currentPhase = nextPhase
}