// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// WGSL shader files
declare module '*.wgsl?raw' {
	const content: string;
	export default content;
}

declare module '*.wgsl' {
	const content: string;
	export default content;
}

export {};
