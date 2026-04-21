import * as THREE from 'three';
import { createInputState } from './input';

export function createPlayer(id, isLocal, color, spawnPosition) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.2 });
  const bumperMaterial = new THREE.MeshStandardMaterial({ color: '#21252c', roughness: 0.75, metalness: 0.1 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.62, 3.55), bodyMaterial);
  base.castShadow = true;
  base.receiveShadow = true;
  base.position.y = 0.72;
  group.add(base);

  const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.26, 0.28), bumperMaterial);
  bumperFront.position.set(0, 0.42, 1.92);
  bumperFront.castShadow = true;
  group.add(bumperFront);

  const bumperBack = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.26, 0.28), bumperMaterial);
  bumperBack.position.set(0, 0.42, -1.92);
  bumperBack.castShadow = true;
  group.add(bumperBack);

  const bumperLeft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 3.52), bumperMaterial);
  bumperLeft.position.set(-1.5, 0.42, 0);
  bumperLeft.castShadow = true;
  group.add(bumperLeft);

  const bumperRight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 3.52), bumperMaterial);
  bumperRight.position.set(1.5, 0.42, 0);
  bumperRight.castShadow = true;
  group.add(bumperRight);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 0.48), bodyMaterial);
  nose.position.set(0, 1, 1.48);
  nose.castShadow = true;
  group.add(nose);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.72, 1.5),
    new THREE.MeshStandardMaterial({ color: '#fff4d0', roughness: 0.78, metalness: 0.05 })
  );
  seat.position.set(0, 1.16, 0.05);
  seat.castShadow = true;
  group.add(seat);

  const steeringColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.42, 10),
    new THREE.MeshStandardMaterial({ color: '#5b6068', roughness: 0.6, metalness: 0.25 })
  );
  steeringColumn.position.set(0, 1.18, 0.84);
  steeringColumn.rotation.x = Math.PI / 7;
  steeringColumn.castShadow = true;
  group.add(steeringColumn);

  const steeringWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.04, 10, 20),
    new THREE.MeshStandardMaterial({ color: '#1d2026', roughness: 0.68, metalness: 0.12 })
  );
  steeringWheel.position.set(0, 1.34, 0.98);
  steeringWheel.rotation.x = Math.PI / 2.8;
  steeringWheel.castShadow = true;
  group.add(steeringWheel);

  const flagPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.1, 8),
    new THREE.MeshStandardMaterial({ color: '#4b4e53', roughness: 0.85 })
  );
  flagPole.position.set(-0.88, 1.95, -1.08);
  group.add(flagPole);

  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.3, 0.04),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 })
  );
  flag.position.set(0.28, 0.7, 0);
  flagPole.add(flag);

  group.position.copy(spawnPosition);

  return {
    id,
    isLocal,
    group,
    velocity: new THREE.Vector2(),
    impactVelocity: new THREE.Vector2(),
    position: new THREE.Vector2(spawnPosition.x, spawnPosition.z),
    previousPosition: new THREE.Vector2(spawnPosition.x, spawnPosition.z),
    collisionMotion: new THREE.Vector2(),
    heading: 0,
    speedRamp: 0,
    targetPosition: new THREE.Vector2(spawnPosition.x, spawnPosition.z),
    targetVelocity: new THREE.Vector2(),
    targetHeading: 0,
    input: createInputState(),
    hasSnapshot: isLocal,
    lastSeenAt: performance.now(),
  };
}

export function ensureRemotePlayer(remotePlayers, scene, peerId, spawnPosition = createSpawnPosition(remotePlayers.size + 1)) {
  let player = remotePlayers.get(peerId);

  if (!player) {
    player = createPlayer(peerId, false, colorFromId(peerId), spawnPosition);
    remotePlayers.set(peerId, player);
    scene.add(player.group);
  }

  return player;
}

export function createSpawnPosition(index) {
  const angle = index * 0.8;
  return new THREE.Vector3(Math.cos(angle) * 10, 0, Math.sin(angle) * 10);
}

export function syncPlayerTransform(player) {
  player.group.position.set(player.position.x, 0, player.position.y);
  player.group.rotation.y = player.heading;
}

export function colorFromId(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(index);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return new THREE.Color(`hsl(${hue} 78% 55%)`);
}