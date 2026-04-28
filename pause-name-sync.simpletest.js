// pause-name-sync.simpletest.js

// Mock lobby state
const lobbyRef = {
  state: {
    players: new Map([
      ['peer1', { name: 'Alice', ready: true }],
      ['peer2', { name: 'Bob', ready: true }]
    ])
  }
};

// Simulate pause event handler
function applyPauseNetworkEvent({ type, peerId, displayName }) {
  // Prefer displayName from payload, otherwise look up from lobbyRef
  let nameToShow = displayName;
  if ((!nameToShow || nameToShow.trim() === '') && lobbyRef && lobbyRef.state && lobbyRef.state.players && lobbyRef.state.players.get) {
    const playerObj = lobbyRef.state.players.get(peerId);
    if (playerObj && playerObj.name && playerObj.name.trim() !== '') {
      nameToShow = playerObj.name;
    } else {
      nameToShow = 'Player';
    }
  }
  return nameToShow;
}

// Simulate sending a pause event as Bob
const bobPause = {
  type: 'pause',
  peerId: 'peer2',
  displayName: lobbyRef.state.players.get('peer2').name
};
const resultBob = applyPauseNetworkEvent(bobPause);
console.log('Pause triggered by Bob, shown name:', resultBob);

// Simulate sending a pause event as Alice
const alicePause = {
  type: 'pause',
  peerId: 'peer1',
  displayName: lobbyRef.state.players.get('peer1').name
};
const resultAlice = applyPauseNetworkEvent(alicePause);
console.log('Pause triggered by Alice, shown name:', resultAlice);

// Test output
if (resultBob === 'Bob' && resultAlice === 'Alice') {
  console.log('Test passed: Pause menu shows correct player names.');
} else {
  console.error('Test failed: Pause menu does not show correct names.');
}