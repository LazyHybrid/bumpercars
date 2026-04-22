// Score system module for bumper cars

export class ScoreSystem {
  constructor() {
    this.score = 0;
  }

  add(points) {
    this.score += points;
    return this.score;
  }

  subtract(points) {
    this.score = Math.max(0, this.score - points);
    return this.score;
  }

  reset() {
    this.score = 0;
  }

  get() {
    return this.score;
  }
}
