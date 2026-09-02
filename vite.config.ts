import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the heavy collaborative-editor stack in its own chunk so it
          // loads only with the lazy /coordination view.
          if (
            /node_modules\/(@tiptap\/|prosemirror-|tiptap-markdown\/|yjs\/|y-protocols\/|y-prosemirror\/|lib0\/)/.test(
              id,
            )
          ) {
            return 'board-editor';
          }
          if (id.includes('node_modules/firebase/')) {
            return 'firebase';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'lucide-icons';
          }
        },
      },
    },
  },
  resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
});
