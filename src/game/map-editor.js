import {
  createDefaultMap,
  getActiveMap,
  getActiveMapSlot,
  getDefaultMapTemplate,
  getMapSpawn,
  MAP_GRID_SIZE,
  MAP_CELL_SIZE,
  MAP_SLOT_COUNT,
  getMapSlot,
  getMapSlotSummaries,
  normalizeMap,
  WORLD_SCALE,
  saveActiveMap,
  saveMapSlot,
  setActiveMapSlot,
} from './map-data';
import { MAX_PLAYERS } from './config';

const GRID_SIZE = MAP_GRID_SIZE;
const CELL_SIZE = Math.round(MAP_CELL_SIZE * WORLD_SCALE);
const EDIT_BRUSH_RADIUS = 0;

export function createMapEditor(sceneRoot, scene, ui) {
  const storedMap = getActiveMap();
  const state = {
    activeSlot: getActiveMapSlot(),
    arenaVariant: storedMap.arenaVariant,
    mode: 'floor',
    floors: createCellsFromTiles(storedMap.floors, 1),
    cells: createCellsFromWalls(storedMap.walls),
    spawns: storedMap.spawns,
    selectedSpawnIndex: 0,
  };

  const layer = document.createElement('div');
  layer.className = 'editor-layer';
  scene.add(layer);

  const grid = document.createElement('div');
  grid.className = 'editor-grid';
  grid.style.setProperty('--editor-grid-size', `${GRID_SIZE}`);
  grid.style.setProperty('--editor-cell-size', `${CELL_SIZE}px`);
  layer.append(grid);

  const cells = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'editor-cell';
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      grid.append(cell);
      cells.push(cell);
    }
  }

  configureHud(ui, state, exportMap, clearMap, setMode, saveToSlot, loadSlot, selectSpawn);
  render();

  grid.addEventListener('click', (event) => {
    const cell = event.target.closest('.editor-cell');
    if (!cell) {
      return;
    }

    const row = Number(cell.dataset.row);
    const column = Number(cell.dataset.column);

    if (state.mode === 'spawn') {
      state.spawns = state.spawns.filter((spawn, index) => index === state.selectedSpawnIndex || spawn.x !== column || spawn.y !== row);
      state.spawns[state.selectedSpawnIndex] = { x: column, y: row };
      state.floors[row][column] = 1;
    } else if (state.mode === 'floor') {
      const nextFloorValue = state.floors[row][column] ? 0 : 1;
      forEachBrushCell(row, column, (brushRow, brushColumn) => {
        state.floors[brushRow][brushColumn] = nextFloorValue;
        if (!nextFloorValue) {
          state.cells[brushRow][brushColumn] = 0;
        }
      });

      if (!nextFloorValue) {
        state.spawns = repairSpawns(state.spawns, state.floors);
      }
    } else {
      const nextWallValue = state.cells[row][column] ? 0 : 1;
      forEachBrushCell(row, column, (brushRow, brushColumn) => {
        state.cells[brushRow][brushColumn] = nextWallValue;
        state.floors[brushRow][brushColumn] = 1;
      });
    }

    render();
    persist();
  });

  function setMode(nextMode) {
    state.mode = nextMode;
    renderToolbarState(ui, state.mode);
    ui.statusLabel.textContent = nextMode === 'spawn'
      ? 'Spawn painter active. Click a tile to move the player start.'
      : nextMode === 'floor'
        ? 'Floor painter active. Click tiles to add or remove playable floor.'
        : 'Wall painter active. Click tiles to toggle solid cells.';
  }

  function clearMap() {
    const nextMap = getDefaultMapTemplate();
    state.arenaVariant = nextMap.arenaVariant;
    state.floors = createCellsFromTiles(nextMap.floors, 1);
    state.cells = createCellsFromWalls(nextMap.walls);
    state.spawns = nextMap.spawns;
    state.selectedSpawnIndex = 0;
    render();
    persist();
    ui.statusLabel.textContent = 'Editor cleared.';
  }

  function saveToSlot(slot) {
    const normalizedSlot = Math.min(MAP_SLOT_COUNT, Math.max(1, slot));
    const payload = buildMapPayload(state);
    saveMapSlot(normalizedSlot, payload);
    setActiveMapSlot(normalizedSlot);
    state.activeSlot = normalizedSlot;
    render();
    ui.statusLabel.textContent = `Saved current map to slot ${normalizedSlot}.`;
  }

  function loadSlot(slot) {
    const normalizedSlot = Math.min(MAP_SLOT_COUNT, Math.max(1, slot));
    const loadedMap = normalizeMap(getMapSlot(normalizedSlot));
    state.activeSlot = normalizedSlot;
    state.arenaVariant = loadedMap.arenaVariant;
    state.floors = createCellsFromTiles(loadedMap.floors, 1);
    state.cells = createCellsFromWalls(loadedMap.walls);
    state.spawns = loadedMap.spawns;
    state.selectedSpawnIndex = 0;
    setActiveMapSlot(normalizedSlot);
    render();
    ui.statusLabel.textContent = `Loaded map slot ${normalizedSlot}.`;
  }

  async function exportMap() {
    const payload = JSON.stringify(buildMapPayload(state), null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      ui.statusLabel.textContent = 'Map JSON copied to clipboard.';
    } catch {
      ui.statusLabel.textContent = 'Clipboard failed. Map JSON printed to console.';
      console.log(payload);
    }
  }

  function render() {
    for (const cell of cells) {
      const row = Number(cell.dataset.row);
      const column = Number(cell.dataset.column);
      const hasFloor = state.floors[row][column] === 1;
      const isWall = state.cells[row][column] === 1;
      const spawnIndex = state.spawns.findIndex((spawn) => spawn.x === column && spawn.y === row);
      const isSpawn = spawnIndex >= 0;
      cell.classList.toggle('editor-cell--void', !hasFloor);
      cell.classList.toggle('editor-cell--floor', hasFloor);
      cell.classList.toggle('editor-cell--wall', isWall);
      cell.classList.toggle('editor-cell--spawn', isSpawn);
      cell.dataset.spawnIndex = isSpawn ? String(spawnIndex + 1) : '';
      cell.textContent = isSpawn ? String(spawnIndex + 1) : '';
    }

    ui.roomLabel.textContent = `Map mode: ${GRID_SIZE} x ${GRID_SIZE}`;
    ui.peerCountLabel.textContent = `Slot ${state.activeSlot} | ${state.arenaVariant} | ${state.spawns.length} spawn${state.spawns.length === 1 ? '' : 's'} | ${countTiles(state.floors)} floor tile${countTiles(state.floors) === 1 ? '' : 's'} | ${countWalls(state.cells)} wall tile${countWalls(state.cells) === 1 ? '' : 's'}`;
    sceneRoot.dataset.arenaVariant = state.arenaVariant;

    renderSlotState(ui, state.activeSlot);
    renderSlotMetadata(ui, getMapSlotSummaries());
    renderSpawnState(ui, state.selectedSpawnIndex);
  }

  function persist() {
    saveActiveMap(buildMapPayload(state));
  }

  function selectSpawn(index) {
    state.selectedSpawnIndex = index;
    renderSpawnState(ui, state.selectedSpawnIndex);
    ui.statusLabel.textContent = `Spawn painter active. Click a tile to place Player ${index + 1}.`;
  }

  return {
    destroy() {
      scene.remove(layer);
    },
  };
}

function configureHud(ui, state, exportMap, clearMap, setMode, saveToSlot, loadSlot, selectSpawn = () => {}) {
  ui.title.textContent = 'Map Maker';
  ui.eyebrow.textContent = 'Editor';
  ui.hintLabel.textContent = 'Paint floor, walls, or spawn. Export copies the JSON layout.';
  ui.newRoomButton.textContent = 'Clear map';
  ui.copyLinkButton.textContent = 'Export JSON';
  ui.copyLinkButton.onclick = exportMap;
  ui.newRoomButton.onclick = clearMap;

  const toolbar = document.createElement('div');
  toolbar.className = 'editor-toolbar';
  toolbar.innerHTML = `
    <button type="button" data-editor-mode="floor">Floor</button>
    <button type="button" data-editor-mode="wall">Wall</button>
    <button type="button" data-editor-mode="spawn">Spawn</button>
  `;
  ui.actions.after(toolbar);

  const slotToolbar = document.createElement('div');
  slotToolbar.className = 'editor-slot-toolbar';
  slotToolbar.innerHTML = Array.from({ length: MAP_SLOT_COUNT }, (_, index) => {
    const slot = index + 1;
    return `<button type="button" data-map-slot="${slot}">Slot ${slot}</button>`;
  }).join('');
  toolbar.after(slotToolbar);

  const slotActions = document.createElement('div');
  slotActions.className = 'editor-slot-actions';
  slotActions.innerHTML = `
    <button type="button" data-slot-action="load">Load slot</button>
    <button type="button" data-slot-action="save">Save slot</button>
  `;
  slotToolbar.after(slotActions);

  const spawnToolbar = document.createElement('div');
  spawnToolbar.className = 'editor-spawn-toolbar';
  spawnToolbar.innerHTML = Array.from({ length: MAX_PLAYERS }, (_, index) => `
    <button type="button" data-spawn-slot="${index}">Player ${index + 1}</button>
  `).join('');
  toolbar.after(spawnToolbar);

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-editor-mode]');
    if (!button) {
      return;
    }

    setMode(button.dataset.editorMode);
  });

  spawnToolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-spawn-slot]');
    if (!button) {
      return;
    }

    selectSpawn(Number(button.dataset.spawnSlot));
  });

  slotToolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-map-slot]');
    if (!button) {
      return;
    }

    const slot = Number(button.dataset.mapSlot);
    state.activeSlot = slot;
    renderSlotState(ui, state.activeSlot);
  });

  slotActions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-slot-action]');
    if (!button) {
      return;
    }

    if (button.dataset.slotAction === 'save') {
      saveToSlot(state.activeSlot);
    } else {
      loadSlot(state.activeSlot);
    }
  });

  renderSlotMetadata(ui, getMapSlotSummaries());

  renderToolbarState(ui, state.mode);
  renderSlotState(ui, state.activeSlot);
  renderSpawnState(ui, state.selectedSpawnIndex);
  ui.statusLabel.textContent = 'Floor painter active. Click tiles to add or remove playable floor.';
}

function renderToolbarState(ui, mode) {
  const toolbarButtons = ui.actions.parentElement.querySelectorAll('[data-editor-mode]');
  for (const button of toolbarButtons) {
    button.classList.toggle('editor-toolbar__button--active', button.dataset.editorMode === mode);
  }
}

function renderSlotState(ui, activeSlot) {
  const slotButtons = ui.actions.parentElement.querySelectorAll('[data-map-slot]');
  for (const button of slotButtons) {
    button.classList.toggle('editor-slot-toolbar__button--active', Number(button.dataset.mapSlot) === activeSlot);
  }
}

function renderSpawnState(ui, selectedSpawnIndex) {
  const spawnButtons = ui.actions.parentElement.querySelectorAll('[data-spawn-slot]');
  for (const button of spawnButtons) {
    button.classList.toggle('editor-spawn-toolbar__button--active', Number(button.dataset.spawnSlot) === selectedSpawnIndex);
  }
}

function renderSlotMetadata(ui, summaries) {
  let metadata = ui.actions.parentElement.querySelector('.editor-slot-metadata');
  if (!metadata) {
    metadata = document.createElement('div');
    metadata.className = 'editor-slot-metadata';
    ui.actions.parentElement.append(metadata);
  }

  metadata.innerHTML = summaries.map((summary) => `
    <span>Slot ${summary.slot}: ${summary.arenaVariant}, ${summary.floorCount} floor, ${summary.wallCount} walls</span>
  `).join('');
}

function countTiles(cells) {
  let total = 0;
  for (const row of cells) {
    for (const cell of row) {
      total += cell;
    }
  }
  return total;
}

function countWalls(cells) {
  let total = 0;
  for (const row of cells) {
    for (const cell of row) {
      total += cell;
    }
  }
  return total;
}

function buildMapPayload(state) {
  return {
    gridSize: GRID_SIZE,
    cellSize: MAP_CELL_SIZE,
    arenaVariant: state.arenaVariant,
    spawns: state.spawns.map((spawn, index) => getMapSpawn({ spawns: state.spawns }, index)),
    floors: state.floors.flatMap((row, y) => row.flatMap((cell, x) => (cell ? [{ x, y }] : []))),
    walls: state.cells.flatMap((row, y) => row.flatMap((cell, x) => (cell ? [{ x, y }] : []))),
  };
}

function createCellsFromWalls(walls) {
  return createCellsFromTiles(walls, 0);
}

function createCellsFromTiles(tiles, fallback = 0) {
  const cells = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  if (fallback === 1 && (!tiles || tiles.length === 0)) {
    for (let row = 0; row < GRID_SIZE; row += 1) {
      cells[row].fill(1);
    }
    return cells;
  }

  for (const tile of tiles ?? []) {
    if (cells[tile.y] && Number.isInteger(cells[tile.y][tile.x])) {
      cells[tile.y][tile.x] = 1;
    }
  }
  return cells;
}

function forEachBrushCell(centerRow, centerColumn, callback) {
  for (let row = centerRow - EDIT_BRUSH_RADIUS; row <= centerRow + EDIT_BRUSH_RADIUS; row += 1) {
    for (let column = centerColumn - EDIT_BRUSH_RADIUS; column <= centerColumn + EDIT_BRUSH_RADIUS; column += 1) {
      if (row < 0 || row >= GRID_SIZE || column < 0 || column >= GRID_SIZE) {
        continue;
      }

      callback(row, column);
    }
  }
}

function findFirstFloor(cells) {
  for (let row = 0; row < cells.length; row += 1) {
    for (let column = 0; column < cells[row].length; column += 1) {
      if (cells[row][column]) {
        return { x: column, y: row };
      }
    }
  }

  return null;
}

function repairSpawns(spawns, floors) {
  const repaired = [];

  for (const spawn of spawns) {
    if (floors[spawn.y]?.[spawn.x]) {
      repaired.push(spawn);
      continue;
    }

    const fallback = findFirstOpenFloor(floors, repaired);
    if (fallback) {
      repaired.push(fallback);
    }
  }

  while (repaired.length < MAX_PLAYERS) {
    const fallback = findFirstOpenFloor(floors, repaired);
    if (!fallback) {
      break;
    }
    repaired.push(fallback);
  }

  return repaired;
}

function findFirstOpenFloor(cells, occupied) {
  for (let row = 0; row < cells.length; row += 1) {
    for (let column = 0; column < cells[row].length; column += 1) {
      if (!cells[row][column]) {
        continue;
      }

      if (occupied.some((spawn) => spawn.x === column && spawn.y === row)) {
        continue;
      }

      return { x: column, y: row };
    }
  }

  return null;
}
