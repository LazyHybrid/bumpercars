import * as THREE from 'three';
import { getActiveMap, mapWallToWorldRect, WORLD_SCALE, MAP_CELL_SIZE, MAP_WORLD_SIZE, MAP_ARENA_ZONE_RADIUS, MAP_OUTER_ZONE_RADIUS, MAP_KILLZONE_FIELD_SIZE, MAP_INNER_ZONE_RADIUS } from './map-data';

export function createWorld(root) {
  root.replaceChildren();
  root.classList.add('scene-root');
  const activeMap = getActiveMap();
  root.dataset.arenaVariant = activeMap.arenaVariant;

  const world = document.createElement('div');
  world.className = 'scene-world';
  root.append(world);

  const outerZoneRadius = activeMap.arenaVariant === 'killzone'
    ? MAP_ARENA_ZONE_RADIUS
    : MAP_OUTER_ZONE_RADIUS;

  const outerZone = document.createElement('div');
  outerZone.className = 'arena-zone arena-zone--outer';
  outerZone.style.width = `${outerZoneRadius * 2 * WORLD_SCALE}px`;
  outerZone.style.height = `${outerZoneRadius * 2 * WORLD_SCALE}px`;
  world.append(outerZone);

  const innerZone = document.createElement('div');
  innerZone.className = 'arena-zone arena-zone--inner';
  innerZone.style.width = `${MAP_INNER_ZONE_RADIUS * 2 * WORLD_SCALE}px`;
  innerZone.style.height = `${MAP_INNER_ZONE_RADIUS * 2 * WORLD_SCALE}px`;
  world.append(innerZone);

  const arenaGrid = document.createElement('div');
  arenaGrid.className = 'arena-grid';
  arenaGrid.style.setProperty('--arena-grid-size', `${MAP_WORLD_SIZE * WORLD_SCALE}px`);
  arenaGrid.style.setProperty('--arena-cell-size', `${MAP_CELL_SIZE * WORLD_SCALE}px`);
  world.append(arenaGrid);

  for (const floor of activeMap.floors) {
    const rect = mapWallToWorldRect(floor);
    const floorElement = document.createElement('div');
    floorElement.className = 'arena-floor-tile';
    floorElement.style.width = `${Math.ceil(MAP_CELL_SIZE * WORLD_SCALE) + 1}px`;
    floorElement.style.height = `${Math.ceil(MAP_CELL_SIZE * WORLD_SCALE) + 1}px`;
    floorElement.style.transform = `translate3d(${rect.minX * WORLD_SCALE}px, ${rect.minY * WORLD_SCALE}px, 0)`;
    world.append(floorElement);
  }

  for (const wall of activeMap.walls) {
    const rect = mapWallToWorldRect(wall);
    const wallElement = document.createElement('div');
    wallElement.className = 'arena-wall';
    wallElement.style.width = `${(rect.maxX - rect.minX) * WORLD_SCALE}px`;
    wallElement.style.height = `${(rect.maxY - rect.minY) * WORLD_SCALE}px`;
    wallElement.style.transform = `translate3d(${rect.minX * WORLD_SCALE}px, ${rect.minY * WORLD_SCALE}px, 0)`;
    world.append(wallElement);
  }

  const scene = {
    add(child) {
      world.append(child);
    },
    remove(child) {
      if (child?.parentNode === world) {
        world.removeChild(child);
      }
    },
  };

  const camera = {
    position: new THREE.Vector3(),
    aspect: window.innerWidth / window.innerHeight,
    updateProjectionMatrix() {},
    lookAt() {},
  };

  const clock = createClock();
  const renderer = {
    setSize(width, height) {
      root.style.setProperty('--viewport-width', `${width}px`);
      root.style.setProperty('--viewport-height', `${height}px`);
    },
    render() {
      const cameraX = camera.position.x * WORLD_SCALE;
      const cameraY = camera.position.z * WORLD_SCALE;
      world.style.transform = `translate3d(${-cameraX}px, ${-cameraY}px, 0)`;
    },
  };

  renderer.setSize(window.innerWidth, window.innerHeight);

  return { renderer, scene, camera, clock, map: activeMap };
}

function createClock() {
  let previousTime = performance.now();

  return {
    getDelta() {
      const now = performance.now();
      const delta = (now - previousTime) / 1000;
      previousTime = now;
      return delta;
    },
  };
}