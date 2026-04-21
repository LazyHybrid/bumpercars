import * as THREE from 'three';
import {
  CAR_COLLISION_DISTANCE_MULTIPLIER,
  BUMPER_ZONE_RESTITUTION,
  BUMPER_ZONE_TRANSFER,
  CAR_RADIUS,
  COLLISION_POSITION_PERCENT,
  COLLISION_POSITION_SLOP,
  IMPACT_VELOCITY_DECAY,
  PLAYER_MASS,
  WALL_BOUNCE,
  BASE_SPEED_SCALE,
  BOOSTED_SPEED_SCALE,
  SPEED_RAMP_TIME_SECONDS,
} from './config';
import { getActiveMap, mapWallToWorldRect } from './map-data';

const inversePlayerMass = 1 / PLAYER_MASS;
const wallContactThreshold = 0.18;
const wallTouchPush = 5.5;
const wallPenetrationPush = 18;

export function simulateMovement(player, input, delta) {
  const traction = 0.82;
  const lateralGrip = 4.8;
  const strafeGrip = 1.2;
  player.previousPosition.copy(player.position);
  const throttlePressed = input.forward || input.backward;
  player.speedRamp = throttlePressed
    ? Math.min(1, player.speedRamp + delta / SPEED_RAMP_TIME_SECONDS)
    : Math.max(0, player.speedRamp - delta / (SPEED_RAMP_TIME_SECONDS * 0.5));

  const speedScale = THREE.MathUtils.lerp(BASE_SPEED_SCALE, BOOSTED_SPEED_SCALE, player.speedRamp);
  const acceleration = (input.forward ? 22 : input.backward ? -15 : 0) * speedScale;
  const speed = player.velocity.length();
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const strafeInput = (input.strafeRight ? 1 : 0) - (input.strafeLeft ? 1 : 0);
  const steerStrength = THREE.MathUtils.lerp(1.7, 2.8, Math.min(speed / 14, 1));

  player.heading -= steerInput * steerStrength * delta * (speed > 0.2 ? 1 : 0.45);

  const forward = new THREE.Vector2(Math.sin(player.heading), -Math.cos(player.heading));
  const right = new THREE.Vector2(-forward.y, forward.x);
  player.velocity.addScaledVector(forward, acceleration * delta);
  player.velocity.addScaledVector(right, strafeInput * 22 * speedScale * delta);

  const forwardSpeed = player.velocity.dot(forward);
  const sideSpeed = player.velocity.dot(right);
  const lateral = right.clone().multiplyScalar(sideSpeed);
  const appliedLateralGrip = strafeInput === 0 ? lateralGrip : strafeGrip;

  player.velocity.addScaledVector(lateral, -Math.min(1, appliedLateralGrip * delta));
  player.velocity.multiplyScalar(1 - (1 - traction) * delta * 8);
  player.velocity.clampLength(0, 19 * speedScale);
  player.impactVelocity.multiplyScalar(Math.max(0, 1 - IMPACT_VELOCITY_DECAY * delta));

  const totalVelocity = player.velocity.clone().add(player.impactVelocity);
  player.position.addScaledVector(totalVelocity, delta);

  const safeDelta = Math.max(delta, 0.0001);
  player.collisionMotion
    .copy(player.position)
    .sub(player.previousPosition)
    .multiplyScalar(1 / safeDelta);
}

export function resolveArenaCollision() {
}

export function resolveMapWallCollisions(player) {
  const activeMap = getActiveMap();

  for (const wall of activeMap.walls) {
    resolveStaticRectCollision(player, mapWallToWorldRect(wall));
  }
}

export function resolvePlayerCollision(playerA, playerB) {
  const delta = playerA.position.clone().sub(playerB.position);
  const distance = delta.length();
  const minDistance = CAR_RADIUS * CAR_COLLISION_DISTANCE_MULTIPLIER;
  const penetration = minDistance - distance;

  if (penetration <= 0) {
    return;
  }

  const normal = distance > 0.0001
    ? delta.normalize()
    : getCollisionFallbackNormal(playerA, playerB);

  applyPositionCorrection(playerA, playerB, normal, penetration);

  const motionA = getCollisionMotion(playerA);
  const motionB = getCollisionMotion(playerB);
  const relativeMotion = motionA.clone().sub(motionB);
  const separatingSpeed = relativeMotion.dot(normal);

  if (separatingSpeed >= -0.0001) {
    return;
  }

  const impulseMagnitude = -(1 + BUMPER_ZONE_RESTITUTION)
    * separatingSpeed
    * BUMPER_ZONE_TRANSFER
    / (inversePlayerMass + inversePlayerMass);
  const impulse = normal.clone().multiplyScalar(impulseMagnitude);

  playerA.impactVelocity.addScaledVector(impulse, inversePlayerMass);
  playerB.impactVelocity.addScaledVector(impulse, -inversePlayerMass);

  resolveArenaCollision(playerA);
  resolveArenaCollision(playerB);
}

function applyPositionCorrection(playerA, playerB, normal, penetration) {
  const correctionMagnitude = Math.max(penetration - COLLISION_POSITION_SLOP, 0)
    / (inversePlayerMass + inversePlayerMass)
    * COLLISION_POSITION_PERCENT;
  const correction = normal.clone().multiplyScalar(correctionMagnitude);

  playerA.position.addScaledVector(correction, inversePlayerMass);
  playerB.position.addScaledVector(correction, -inversePlayerMass);
}

function getCollisionFallbackNormal(playerA, playerB) {
  const relativeMotion = getCollisionMotion(playerA).clone().sub(getCollisionMotion(playerB));
  if (relativeMotion.lengthSq() > 0.0001) {
    return relativeMotion.normalize();
  }

  return getForwardVector(playerA.heading);
}

function getForwardVector(heading) {
  return new THREE.Vector2(Math.sin(heading), -Math.cos(heading)).normalize();
}

function getCollisionMotion(player) {
  if (player.collisionMotion.lengthSq() > 0.0001) {
    return player.collisionMotion;
  }

  return player.velocity.clone().add(player.impactVelocity);
}

function resolveStaticRectCollision(player, rect) {
  const expandedMinX = rect.minX - CAR_RADIUS;
  const expandedMaxX = rect.maxX + CAR_RADIUS;
  const expandedMinY = rect.minY - CAR_RADIUS;
  const expandedMaxY = rect.maxY + CAR_RADIUS;

  if (
    player.position.x < expandedMinX
    || player.position.x > expandedMaxX
    || player.position.y < expandedMinY
    || player.position.y > expandedMaxY
  ) {
    return;
  }

  const nearestX = THREE.MathUtils.clamp(player.position.x, rect.minX, rect.maxX);
  const nearestY = THREE.MathUtils.clamp(player.position.y, rect.minY, rect.maxY);
  const delta = player.position.clone().sub(new THREE.Vector2(nearestX, nearestY));
  let normal = delta;
  let distance = delta.length();

  if (distance <= 0.0001) {
    const distancesToFaces = [
      { value: Math.abs(player.position.x - rect.minX), normal: new THREE.Vector2(-1, 0) },
      { value: Math.abs(rect.maxX - player.position.x), normal: new THREE.Vector2(1, 0) },
      { value: Math.abs(player.position.y - rect.minY), normal: new THREE.Vector2(0, -1) },
      { value: Math.abs(rect.maxY - player.position.y), normal: new THREE.Vector2(0, 1) },
    ];
    distancesToFaces.sort((a, b) => a.value - b.value);
    normal = distancesToFaces[0].normal;
    distance = 0;
  } else {
    normal = normal.normalize();
  }

  const penetration = CAR_RADIUS - distance;
  if (penetration <= -wallContactThreshold) {
    return;
  }

  const touchAmount = THREE.MathUtils.clamp((penetration + wallContactThreshold) / wallContactThreshold, 0, 1);
  const clampedPenetration = Math.max(0, penetration);

  if (clampedPenetration > 0) {
    player.position.addScaledVector(normal, clampedPenetration);
  }

  const driveVelocityAlongWall = player.velocity.dot(normal);
  const impactVelocityAlongWall = player.impactVelocity.dot(normal);
  const totalVelocityAlongWall = driveVelocityAlongWall + impactVelocityAlongWall;

  if (driveVelocityAlongWall < 0) {
    player.velocity.addScaledVector(normal, -driveVelocityAlongWall);
  }

  if (impactVelocityAlongWall < 0) {
    player.impactVelocity.addScaledVector(normal, -impactVelocityAlongWall);
  }

  const inwardPush = touchAmount * wallTouchPush
    + clampedPenetration * wallPenetrationPush
    + Math.max(0, -totalVelocityAlongWall) * WALL_BOUNCE;

  player.impactVelocity.addScaledVector(normal, inwardPush);
}