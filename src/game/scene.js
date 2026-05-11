import {
  getActiveMap,
  mapWallToWorldRect,
  WORLD_SCALE,
  MAP_CELL_SIZE,
  MAP_WORLD_SIZE,
  MAP_ARENA_ZONE_RADIUS,
  MAP_OUTER_ZONE_RADIUS,
  MAP_INNER_ZONE_RADIUS,
} from './map-data';
import { Vec2 } from './math';

export function createWorld(root) {
  root.replaceChildren();
  root.classList.add('scene-root');
  const activeMap = getActiveMap();

  const worldElement = document.createElement('div');
  worldElement.className = 'scene-world';
  root.append(worldElement);

  const mapLayer = document.createElement('div');
  mapLayer.className = 'scene-map-layer';
  worldElement.append(mapLayer);

  const actorLayer = document.createElement('div');
  actorLayer.className = 'scene-actor-layer';
  worldElement.append(actorLayer);

  function renderMap(map) {
    root.dataset.arenaVariant = map.arenaVariant;
    mapLayer.replaceChildren();

    const outerZoneRadius = map.arenaVariant === 'killzone'
      ? MAP_ARENA_ZONE_RADIUS
      : MAP_OUTER_ZONE_RADIUS;

    const outerZone = document.createElement('div');
    outerZone.className = 'arena-zone arena-zone--outer';
    outerZone.style.width = `${outerZoneRadius * 2 * WORLD_SCALE}px`;
    outerZone.style.height = `${outerZoneRadius * 2 * WORLD_SCALE}px`;
    mapLayer.append(outerZone);

    const innerZone = document.createElement('div');
    innerZone.className = 'arena-zone arena-zone--inner';
    innerZone.style.width = `${MAP_INNER_ZONE_RADIUS * 2 * WORLD_SCALE}px`;
    innerZone.style.height = `${MAP_INNER_ZONE_RADIUS * 2 * WORLD_SCALE}px`;
    mapLayer.append(innerZone);

    const arenaGrid = document.createElement('div');
    arenaGrid.className = 'arena-grid';
    arenaGrid.style.setProperty('--arena-grid-size', `${MAP_WORLD_SIZE * WORLD_SCALE}px`);
    arenaGrid.style.setProperty('--arena-cell-size', `${MAP_CELL_SIZE * WORLD_SCALE}px`);
    mapLayer.append(arenaGrid);

    for (const floor of map.floors) {
      const rect = mapWallToWorldRect(floor);
      const floorElement = document.createElement('div');
      floorElement.className = 'arena-floor-tile';
      floorElement.style.width = `${Math.ceil(MAP_CELL_SIZE * WORLD_SCALE) + 1}px`;
      floorElement.style.height = `${Math.ceil(MAP_CELL_SIZE * WORLD_SCALE) + 1}px`;
      floorElement.style.transform = `translate3d(${rect.minX * WORLD_SCALE}px, ${rect.minY * WORLD_SCALE}px, 0)`;
      mapLayer.append(floorElement);
    }
    
      for (const iceTile of map.ice ?? []) {
        const rect = mapWallToWorldRect(iceTile);
        const iceElement = document.createElement('div');
        iceElement.className = 'arena-ice-tile';
        iceElement.style.width = `${Math.ceil(MAP_CELL_SIZE * WORLD_SCALE) + 1}px`;
        iceElement.style.height = `${Math.ceil(MAP_CELL_SIZE * WORLD_SCALE) + 1}px`;
        iceElement.style.transform = `translate3d(${rect.minX * WORLD_SCALE}px, ${rect.minY * WORLD_SCALE}px, 0)`;
        mapLayer.append(iceElement);
      }

    for (const wall of map.walls) {
      const rect = mapWallToWorldRect(wall);
      const wallElement = document.createElement('div');
      wallElement.className = 'arena-wall';
      wallElement.style.width = `${(rect.maxX - rect.minX) * WORLD_SCALE}px`;
      wallElement.style.height = `${(rect.maxY - rect.minY) * WORLD_SCALE}px`;
      wallElement.style.transform = `translate3d(${rect.minX * WORLD_SCALE}px, ${rect.minY * WORLD_SCALE}px, 0)`;
      mapLayer.append(wallElement);
    }
  }

  renderMap(activeMap);

  const viewPosition = new Vec2();

  const world = {
    element: worldElement,
    add(child) {
      actorLayer.append(child);
    },
    remove(child) {
      if (child?.parentNode === actorLayer) {
        actorLayer.removeChild(child);
      }
    },
    setMap(map) {
      renderMap(map);
    },
    setViewPosition(x, y) {
      viewPosition.set(x, y);
    },
    moveView(deltaX, deltaY) {
      viewPosition.x += deltaX;
      viewPosition.y += deltaY;
    },
    setSize(width, height) {
      root.style.setProperty('--viewport-width', `${width}px`);
      root.style.setProperty('--viewport-height', `${height}px`);
    },
    render() {
      worldElement.style.transform = `translate3d(${-viewPosition.x * WORLD_SCALE}px, ${-viewPosition.y * WORLD_SCALE}px, 0)`;
    },
  };

  const clock = createClock();
  world.setSize(window.innerWidth, window.innerHeight);

  return { world, clock, map: activeMap };
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