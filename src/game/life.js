// Life system module for bumper cars

export class LifeSystem {
  constructor(initialLife = 15) {
    this.life = initialLife;
    this.maxLife = initialLife;
  }

  loseLife(amount = 1) {
    this.life = Math.max(0, this.life - amount);
    return this.life;
  }

  gainLife(amount = 1) {
    this.life = Math.min(this.maxLife, this.life + amount);
    return this.life;
  }

  isAlive() {
    return this.life > 0;
  }

  reset(initialLife = 15) {
    this.life = initialLife;
    this.maxLife = initialLife;
  }

  get() {
    return this.life;
  }
}

// Utility to check if a player is on a floor or wall tile
export function isOnFloorOrWall(player, map) {
  // Convert world position to map cell
  const cellX = Math.floor((player.position.x + map.MAP_WORLD_SIZE / 2) / map.MAP_CELL_SIZE);
  const cellY = Math.floor((player.position.y + map.MAP_WORLD_SIZE / 2) / map.MAP_CELL_SIZE);
  // Check if on a floor or wall tile
  const onFloor = map.floors.some(tile => tile.x === cellX && tile.y === cellY);
  const onWall = map.walls.some(tile => tile.x === cellX && tile.y === cellY);
  return onFloor || onWall;
}
