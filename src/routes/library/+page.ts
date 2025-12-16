import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

export function load() {
	// Legacy path — docs moved to /gol.
	throw redirect(302, `${base}/gol`);
}


