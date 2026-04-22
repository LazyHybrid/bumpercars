import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const mapMode = args.includes('-map');
const forceHttp = args.includes('--http');
const forwardedArgs = args.filter((arg) => arg !== '-map' && arg !== '--http');

if (!forwardedArgs.includes('--host')) {
  forwardedArgs.push('--host');
}

const viteExecutable = process.platform === 'win32'
  ? 'node_modules\\vite\\bin\\vite.js'
  : 'node_modules/vite/bin/vite.js';

const child = spawn(
  process.execPath,
  [viteExecutable, ...forwardedArgs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_APP_MODE: mapMode ? 'map' : (process.env.VITE_APP_MODE ?? 'play'),
      VITE_DEV_HTTPS: forceHttp ? '0' : '1',
    },
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
