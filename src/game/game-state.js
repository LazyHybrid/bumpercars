// Centralized game state for lives and scores
import { LifeSystem } from './life.js';
import { ScoreSystem } from './score.js';

export class GameState {
  constructor(playerIds, initialLives = 3) {
    this.lives = {};
    this.scores = {};
    for (const id of playerIds) {
      this.lives[id] = new LifeSystem(initialLives);
      this.scores[id] = new ScoreSystem();
    }
  }

  eliminatePlayer(eliminatedId) {
    this.lives[eliminatedId].loseLife();
    // Award points to all players still alive (except eliminated)
    for (const id in this.lives) {
      if (id !== eliminatedId && this.lives[id].isAlive()) {
        this.scores[id].add(1);
      }
    }
  }

  isAlive(id) {
    return this.lives[id]?.isAlive();
  }

  getScore(id) {
    return this.scores[id]?.get() ?? 0;
  }

  reset(playerIds, initialLives = 3) {
    for (const id of playerIds) {
      if (!this.lives[id]) this.lives[id] = new LifeSystem(initialLives);
      else this.lives[id].reset(initialLives);
      if (!this.scores[id]) this.scores[id] = new ScoreSystem();
      else this.scores[id].reset();
    }
  }
}
