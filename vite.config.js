import { cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));

const copyMusicAssets = {
    name: 'copy-velorider-music',
    apply: 'build',
    async closeBundle() {
        await cp(
            resolve(projectRoot, 'music'),
            resolve(projectRoot, 'dist/music'),
            { recursive: true, force: true }
        );
    }
};

export default defineConfig({
    root: projectRoot,
    base: '/',
    plugins: [tailwindcss(), copyMusicAssets],
    build: {
        outDir: 'dist',
        emptyOutDir: true
    }
});
