import { createHighlighter } from 'shiki';

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

async function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ['github-dark'],
			langs: ['ts', 'tsx', 'js', 'svelte', 'wgsl', 'bash', 'json']
		});
	}
	return await highlighterPromise;
}

export async function highlight(code: string, lang: string) {
	const highlighter = await getHighlighter();
	return highlighter.codeToHtml(code, { lang, theme: 'github-dark' });
}


