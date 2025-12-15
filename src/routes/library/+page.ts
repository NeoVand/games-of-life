import { redirect } from '@sveltejs/kit';

export function load() {
	// Legacy path — docs moved to /gol.
	throw redirect(302, '/gol');
}


