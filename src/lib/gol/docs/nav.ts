export type GoLNavItem = {
	title: string;
	href: string;
};

export type GoLNavSection = {
	title: string;
	items: GoLNavItem[];
};

export const GOL_NAV: GoLNavSection[] = [
	{
		title: 'Getting started',
		items: [
			{ title: 'Overview', href: '/gol' },
			{ title: 'Quickstart (Svelte)', href: '/gol/quickstart/svelte' },
			{ title: 'Quickstart (WebGPU)', href: '/gol/quickstart/webgpu' }
		]
	},
	{
		title: 'Concepts',
		items: [
			{ title: 'Rules', href: '/gol/concepts/rules' },
			{ title: 'Rendering', href: '/gol/concepts/rendering' }
		]
	},
	{
		title: 'Demos',
		items: [{ title: 'Gallery (9 sims)', href: '/gol/demos/gallery' }]
	}
];


