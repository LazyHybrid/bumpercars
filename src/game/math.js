export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(vector) {
    this.x = vector.x;
    this.y = vector.y;
    return this;
  }

  clone() {
    return new Vec2(this.x, this.y);
  }

  add(vector) {
    this.x += vector.x;
    this.y += vector.y;
    return this;
  }

  addScaledVector(vector, scale) {
    this.x += vector.x * scale;
    this.y += vector.y * scale;
    return this;
  }

  sub(vector) {
    this.x -= vector.x;
    this.y -= vector.y;
    return this;
  }

  multiplyScalar(scale) {
    this.x *= scale;
    this.y *= scale;
    return this;
  }

  dot(vector) {
    return this.x * vector.x + this.y * vector.y;
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  length() {
    return Math.sqrt(this.lengthSq());
  }

  normalize() {
    const length = this.length();
    if (length > 0) {
      this.multiplyScalar(1 / length);
    }

    return this;
  }

  clampLength(minLength, maxLength) {
    const length = this.length();
    if (length === 0) {
      return this;
    }

    const nextLength = clamp(length, minLength, maxLength);
    return this.multiplyScalar(nextLength / length);
  }

  lerp(target, alpha) {
    this.x += (target.x - this.x) * alpha;
    this.y += (target.y - this.y) * alpha;
    return this;
  }

  distanceTo(target) {
    return Math.sqrt(this.distanceToSquared(target));
  }

  distanceToSquared(target) {
    const deltaX = this.x - target.x;
    const deltaY = this.y - target.y;
    return deltaX * deltaX + deltaY * deltaY;
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
}

export function euclideanModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}