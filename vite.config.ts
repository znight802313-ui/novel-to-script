import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/novel-to-script/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'https://once.novai.su',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, '/v1'),
            secure: false,
          },
          '/mixai': {
            target: 'https://mixai.cc',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/mixai/, '/v1'),
            secure: false,
          }
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) {
                return undefined;
              }

              if (id.includes('/node_modules/lucide-react/')) {
                return 'icon-vendor';
              }

              if (
                id.includes('/node_modules/react/') ||
                id.includes('/node_modules/react-dom/') ||
                id.includes('/node_modules/scheduler/')
              ) {
                return 'react-vendor';
              }

              if (
                id.includes('/node_modules/jszip/') ||
                id.includes('/node_modules/pako/') ||
                id.includes('/node_modules/safe-buffer/')
              ) {
                return 'zip-vendor';
              }

              if (
                id.includes('/node_modules/docx/') ||
                id.includes('/node_modules/file-saver/') ||
                id.includes('/node_modules/nanoid/') ||
                id.includes('/node_modules/xml/') ||
                id.includes('/node_modules/xml-js/')
              ) {
                return 'export-vendor';
              }

              if (
                id.includes('/node_modules/mammoth/') ||
                id.includes('/node_modules/@xmldom/xmldom/') ||
                id.includes('/node_modules/argparse/') ||
                id.includes('/node_modules/base64-js/') ||
                id.includes('/node_modules/bluebird/') ||
                id.includes('/node_modules/dingbat-to-unicode/') ||
                id.includes('/node_modules/lop/') ||
                id.includes('/node_modules/path-is-absolute/') ||
                id.includes('/node_modules/sax/') ||
                id.includes('/node_modules/underscore/') ||
                id.includes('/node_modules/xmlbuilder/')
              ) {
                return 'parser-vendor';
              }

              if (id.includes('/node_modules/diff/')) {
                return 'diff-vendor';
              }

              return 'vendor';
            },
          },
        },
      },
      plugins: [react()],
      // 不再需要 define，直接使用 import.meta.env.VITE_API_KEY
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
