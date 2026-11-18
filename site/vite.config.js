import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// The shared Passalong tokens live one level up, in ../styles.
export default defineConfig({ plugins: [tailwindcss()], server: { fs: { allow: ['..'] } } });
