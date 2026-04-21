import { ARENA_RADIUS, MAX_PLAYERS } from './config';

export const MAP_STORAGE_KEY = 'bumpercars-map-db-v1';
export const MAP_SLOT_COUNT = 4;
export const DEFAULT_MAP_SLOT = 2;
export const BASE_MAP_GRID_SIZE = 24;
export const MAP_SIZE_MULTIPLIER = 3;
export const MAP_GRID_SIZE = BASE_MAP_GRID_SIZE * MAP_SIZE_MULTIPLIER;
export const ORIGINAL_MAP_WORLD_SIZE = ARENA_RADIUS * 2;
export const MAP_WORLD_SIZE = ARENA_RADIUS * 2 * MAP_SIZE_MULTIPLIER;
export const MAP_CELL_SIZE = MAP_WORLD_SIZE / MAP_GRID_SIZE;
export const WORLD_SCALE = 18;
export const ARENA_VARIANTS = ['classic', 'killzone'];
export const MAP_ARENA_ZONE_RADIUS = ARENA_RADIUS;
export const MAP_OUTER_ZONE_RADIUS = ARENA_RADIUS * 3.5;
export const MAP_KILLZONE_FIELD_MULTIPLIER = 5;
export const MAP_KILLZONE_FIELD_SIZE = MAP_WORLD_SIZE * MAP_KILLZONE_FIELD_MULTIPLIER;
export const MAP_INNER_ZONE_RADIUS = ARENA_RADIUS * 0.58;

export function createDefaultMap(arenaVariant = 'classic') {
  return {
    gridSize: MAP_GRID_SIZE,
    cellSize: MAP_CELL_SIZE,
    arenaVariant,
    spawns: createDefaultSpawns(arenaVariant),
    floors: createCircularDefaultFloors(arenaVariant),
    walls: [],
  };
}

export function getDefaultMapTemplate() {
  if (typeof window === 'undefined') {
    return createDefaultMap();
  }

  try {
    const raw = window.localStorage.getItem(MAP_STORAGE_KEY);
    if (!raw) {
      return createDefaultMap();
    }

    const parsed = JSON.parse(raw);
    const templateIndex = DEFAULT_MAP_SLOT - 1;
    if (!Array.isArray(parsed) || !parsed[templateIndex]) {
      return createDefaultMap();
    }

    return normalizeMap(parsed[templateIndex]);
  } catch {
    return createDefaultMap();
  }
}

export function getActiveMap() {
  return getMapSlot(getActiveMapSlot());
}

export function saveActiveMap(map) {
  saveMapSlot(getActiveMapSlot(), map);
}

export function getActiveMapSlot() {
  if (typeof window === 'undefined') {
    return DEFAULT_MAP_SLOT;
  }

  try {
    const slot = Number(window.localStorage.getItem(getActiveSlotKey()));
    return clampSlot(slot);
  } catch {
    return DEFAULT_MAP_SLOT;
  }
}

export function setActiveMapSlot(slot) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getActiveSlotKey(), String(clampSlot(slot)));
}

export function getMapSlot(slot) {
  if (typeof window === 'undefined') {
    return createDefaultMap();
  }

  try {
    const database = getMapDatabase();
    return normalizeMap(database[clampSlot(slot) - 1]);
  } catch {
    return createDefaultMap();
  }
}

export function saveMapSlot(slot, map) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedSlot = clampSlot(slot);
  const database = getMapDatabase();
  database[normalizedSlot - 1] = normalizeMap(map);
  window.localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(database));
}

export function getMapSlotSummaries() {
  const database = getMapDatabase();
  return database.map((map, index) => ({
    slot: index + 1,
    arenaVariant: normalizeMap(map).arenaVariant,
    floorCount: Array.isArray(map.floors) ? map.floors.length : 0,
    wallCount: Array.isArray(map.walls) ? map.walls.length : 0,
  }));
}

export function normalizeMap(map) {
  const arenaVariant = ARENA_VARIANTS.includes(map?.arenaVariant) ? map.arenaVariant : 'classic';
  const base = createDefaultMap(arenaVariant);
  const sourceGridSize = Number.isFinite(map?.gridSize) ? Math.max(1, Math.round(map.gridSize)) : base.gridSize;
  const gridOffset = Math.floor((base.gridSize - sourceGridSize) / 2);
  const spawns = normalizeSpawns(map?.spawns, map?.spawn, sourceGridSize, base.gridSize, gridOffset, base.spawns);
  const floors = Array.isArray(map?.floors)
    ? map.floors
      .map((floor) => normalizeWall(floor, sourceGridSize, base.gridSize, gridOffset))
      .filter(Boolean)
    : base.floors;
  const walls = Array.isArray(map?.walls)
    ? map.walls
      .map((wall) => normalizeWall(wall, sourceGridSize, base.gridSize, gridOffset))
      .filter(Boolean)
    : base.walls;

  return {
    ...base,
    arenaVariant,
    spawns,
    floors,
    walls,
  };
}

export function getMapSpawn(map, index) {
  const normalizedMap = normalizeMap(map);
  return normalizedMap.spawns[Math.min(MAX_PLAYERS - 1, Math.max(0, index))];
}

export function mapCellToWorld(cellX, cellY) {
  return {
    x: (cellX + 0.5) * MAP_CELL_SIZE - MAP_WORLD_SIZE / 2,
    y: (cellY + 0.5) * MAP_CELL_SIZE - MAP_WORLD_SIZE / 2,
  };
}

export function mapWallToWorldRect(wall) {
  return {
    minX: wall.x * MAP_CELL_SIZE - MAP_WORLD_SIZE / 2,
    maxX: (wall.x + 1) * MAP_CELL_SIZE - MAP_WORLD_SIZE / 2,
    minY: wall.y * MAP_CELL_SIZE - MAP_WORLD_SIZE / 2,
    maxY: (wall.y + 1) * MAP_CELL_SIZE - MAP_WORLD_SIZE / 2,
  };
}

export function createCircularDefaultFloors(arenaVariant = 'classic') {
  const radius = getDefaultFloorRadius(arenaVariant);
  const floors = [];

  for (let y = 0; y < MAP_GRID_SIZE; y += 1) {
    for (let x = 0; x < MAP_GRID_SIZE; x += 1) {
      const world = mapCellToWorld(x, y);
      if (Math.hypot(world.x, world.y) <= radius) {
        floors.push({ x, y });
      }
    }
  }

  return floors;
}

function createDefaultSpawns(arenaVariant = 'classic') {
  const center = Math.floor(MAP_GRID_SIZE / 2);
  const footprintGridSize = arenaVariant === 'killzone' ? MAP_GRID_SIZE : BASE_MAP_GRID_SIZE;
  const offset = Math.max(2, Math.round(footprintGridSize * 0.18));

  return [
    { x: center, y: center - offset },
    { x: center + offset, y: center },
    { x: center, y: center + offset },
    { x: center - offset, y: center },
  ];
}

function getDefaultFloorRadius(arenaVariant) {
  const worldSize = arenaVariant === 'killzone' ? MAP_WORLD_SIZE : ORIGINAL_MAP_WORLD_SIZE;
  return worldSize / 2 - MAP_CELL_SIZE * 0.5;
}

function normalizeWall(wall, sourceGridSize, targetGridSize, gridOffset = 0) {
  if (!Number.isFinite(wall?.x) || !Number.isFinite(wall?.y)) {
    return null;
  }

  const x = clampInteger(wall.x, 0, sourceGridSize - 1) + gridOffset;
  const y = clampInteger(wall.y, 0, sourceGridSize - 1) + gridOffset;
  if (x < 0 || x >= targetGridSize || y < 0 || y >= targetGridSize) {
    return null;
  }

  return { x, y };
}

function normalizeSpawns(spawns, legacySpawn, sourceGridSize, targetGridSize, gridOffset, fallbackSpawns) {
  const normalized = [];

  if (Array.isArray(spawns)) {
    for (const spawn of spawns) {
      const nextSpawn = normalizeSpawnCell(spawn, sourceGridSize, targetGridSize, gridOffset);
      if (nextSpawn && !normalized.some((entry) => entry.x === nextSpawn.x && entry.y === nextSpawn.y)) {
        normalized.push(nextSpawn);
      }
    }
  } else {
    const legacy = normalizeSpawnCell(legacySpawn, sourceGridSize, targetGridSize, gridOffset);
    if (legacy) {
      normalized.push(legacy);
    }
  }

  for (const fallback of fallbackSpawns) {
    if (normalized.length >= MAX_PLAYERS) {
      break;
    }

    if (!normalized.some((entry) => entry.x === fallback.x && entry.y === fallback.y)) {
      normalized.push(fallback);
    }
  }

  return normalized.slice(0, MAX_PLAYERS);
}

function normalizeSpawnCell(spawn, sourceGridSize, targetGridSize, gridOffset = 0) {
  if (!spawn || !Number.isFinite(spawn.x) || !Number.isFinite(spawn.y)) {
    return null;
  }

  const x = clampInteger(spawn.x, 0, sourceGridSize - 1) + gridOffset;
  const y = clampInteger(spawn.y, 0, sourceGridSize - 1) + gridOffset;
  if (x < 0 || x >= targetGridSize || y < 0 || y >= targetGridSize) {
    return null;
  }

  return {
    x,
    y,
  };
}

function clampInteger(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampSlot(slot) {
  return clampInteger(Number.isFinite(slot) ? slot : 1, 1, MAP_SLOT_COUNT);
}

function getMapDatabase() {
  if (typeof window === 'undefined') {
    return Array.from({ length: MAP_SLOT_COUNT }, () => createDefaultMap());
  }

  try {
    const raw = window.localStorage.getItem(MAP_STORAGE_KEY);
    if (!raw) {
      return Array.from({ length: MAP_SLOT_COUNT }, () => createDefaultMap());
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return Array.from({ length: MAP_SLOT_COUNT }, () => createDefaultMap());
    }

    const templateIndex = DEFAULT_MAP_SLOT - 1;
    const slotOneTemplate = parsed[templateIndex] ? normalizeMap(parsed[templateIndex]) : createDefaultMap();
    return Array.from({ length: MAP_SLOT_COUNT }, (_, index) => normalizeMap(parsed[index] ?? slotOneTemplate));
  } catch {
    return Array.from({ length: MAP_SLOT_COUNT }, () => createDefaultMap());
  }
}

function getActiveSlotKey() {
  return `${MAP_STORAGE_KEY}:active-slot`;
}
