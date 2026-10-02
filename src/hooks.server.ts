import { redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// /mayurgpt, /MAYURGPT/... → /MayurGPT/... (friends will type it however they like)
	const path = event.url.pathname;
	if (/^\/mayurgpt(\/|$)/i.test(path) && !path.startsWith('/MayurGPT')) {
		redirect(308, '/MayurGPT' + path.slice('/mayurgpt'.length) + event.url.search);
	}

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
