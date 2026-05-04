import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Security headers on all responses
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	// Extra headers on debug routes — no caching, no referrer leakage
	if (event.url.pathname.startsWith('/debug') || event.url.pathname.startsWith('/api/debug')) {
		response.headers.set('Cache-Control', 'private, no-store');
		response.headers.set('Referrer-Policy', 'no-referrer');
	}

	return response;
};
