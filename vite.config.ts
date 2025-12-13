import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		fs: {
			// Allow importing workspace packages from /packages during local dev.
			// Without this, Vite may block requests as "outside of Vite serving allow list".
			allow: [path.resolve(__dirname, 'packages'), path.resolve(__dirname)]
		}
	}
});
