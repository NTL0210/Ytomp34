import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [
    electron([
      {
        // Main process entry
        entry: resolve(__dirname, 'src/main/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        // Preload script entry
        entry: resolve(__dirname, 'src/preload/index.ts'),
        onstart(options) {
          // Notify the Renderer process to reload the page when the Preload scripts build is complete
          options.reload();
        },
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/preload'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@preload': resolve(__dirname, 'src/preload')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true
  }
});
