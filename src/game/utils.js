import * as THREE from 'three';

export function parseListEnv(value) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
}

export function sanitizeOrigin(value) {
  if (!value) {
    return '';
  }

  return value.trim().replace(/\/$/, '');
}

export function isLocalOrPrivateHost(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0'
    || hostname.endsWith('.local')
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

export function lerpAngle(from, to, alpha) {
  const wrappedDelta = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + wrappedDelta * alpha;
}

export function shortId(id) {
  return id.slice(0, 6);
}