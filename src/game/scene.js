import * as THREE from 'three';
import { ARENA_RADIUS } from './config';

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8ad6ff');
  scene.fog = new THREE.Fog('#8ad6ff', 45, 110);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 7, 12);

  const clock = new THREE.Clock();

  const hemisphereLight = new THREE.HemisphereLight('#ffffff', '#6c8b51', 1.6);
  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight('#fff5df', 2.3);
  sunLight.position.set(20, 25, 12);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -50;
  sunLight.shadow.camera.right = 50;
  sunLight.shadow.camera.top = 50;
  sunLight.shadow.camera.bottom = -50;
  scene.add(sunLight);

  const arenaFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 1.4, 64),
    new THREE.MeshStandardMaterial({ color: '#e5f6ff', roughness: 0.24, metalness: 0.08 })
  );
  arenaFloor.receiveShadow = true;
  arenaFloor.position.y = -0.7;
  scene.add(arenaFloor);

  const arenaRing = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_RADIUS - 0.25, 1.6, 22, 120),
    new THREE.MeshStandardMaterial({ color: '#ff8155', roughness: 0.5, metalness: 0.15 })
  );
  arenaRing.rotation.x = Math.PI / 2;
  arenaRing.position.y = 0.45;
  scene.add(arenaRing);

  const grid = new THREE.GridHelper(ARENA_RADIUS * 2.1, 28, '#4b6f88', '#8ebfd3');
  grid.position.y = 0.02;
  scene.add(grid);

  const skyAccent = new THREE.Mesh(
    new THREE.SphereGeometry(140, 32, 32),
    new THREE.MeshBasicMaterial({ color: '#b8efff', side: THREE.BackSide })
  );
  scene.add(skyAccent);

  return { renderer, scene, camera, clock };
}