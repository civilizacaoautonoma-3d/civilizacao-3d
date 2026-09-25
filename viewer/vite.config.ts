import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, fs: { allow: ['..'] } },   // host: true = aceita o celular na mesma rede
});
