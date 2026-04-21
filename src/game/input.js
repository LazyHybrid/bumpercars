export function createInputState() {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    strafeLeft: false,
    strafeRight: false,
  };
}

export function setupInput(keys) {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      return;
    }

    setKey(keys, event.code, true);
  });

  window.addEventListener('keyup', (event) => {
    setKey(keys, event.code, false);
  });
}

export function readCurrentInputState(keys) {
  return {
    forward: keys.forward,
    backward: keys.backward,
    left: keys.left,
    right: keys.right,
    strafeLeft: Boolean(keys.strafeLeft),
    strafeRight: Boolean(keys.strafeRight),
  };
}

export function normalizeInput(payload) {
  return {
    forward: Boolean(payload?.forward),
    backward: Boolean(payload?.backward),
    left: Boolean(payload?.left),
    right: Boolean(payload?.right),
    strafeLeft: Boolean(payload?.strafeLeft),
    strafeRight: Boolean(payload?.strafeRight),
  };
}

export function serializeInput(input) {
  return `${Number(input.forward)}${Number(input.backward)}${Number(input.left)}${Number(input.right)}${Number(input.strafeLeft)}${Number(input.strafeRight)}`;
}

function setKey(keys, code, pressed) {
  if (code === 'KeyW') {
    keys.forward = pressed;
  } else if (code === 'KeyS') {
    keys.backward = pressed;
  } else if (code === 'KeyA') {
    keys.left = pressed;
  } else if (code === 'KeyD') {
    keys.right = pressed;
  }
}