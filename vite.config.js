import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const useDevHttps = process.env.VITE_DEV_HTTPS === '1';

  return {
    plugins: useDevHttps ? [basicSsl()] : [],
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/bumpercars-app-[hash].js',
          chunkFileNames: 'assets/chunks/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'assets/bumpercars-styles-[hash][extname]';
            }

            return 'assets/[name]-[hash][extname]';
          },
        },
      },
    },
  };
});