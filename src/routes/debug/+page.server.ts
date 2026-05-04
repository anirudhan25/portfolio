import { redirect } from '@sveltejs/kit';
import { timingSafeEqual } from 'crypto';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { ragStore, CV_FULL_CHAR_COUNT } from '$lib/rag/loader';
import { getTraces } from '$lib/rag/tracer';
import type { PageServerLoad } from './$types';

function safeEqual(a: string, b: string): boolean {
	if (!a || !b || a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const COOKIE = 'dash_auth';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const dashKey = env['DASHBOARD_KEY'];
	if (!dashKey) throw redirect(302, '/');

	// First-time auth via ?key= — validate, set HttpOnly cookie, redirect to clean URL
	const queryKey = url.searchParams.get('key');
	if (queryKey) {
		if (!safeEqual(queryKey, dashKey)) throw redirect(302, '/');
		cookies.set(COOKIE, dashKey, {
			path: '/debug',
			httpOnly: true,
			sameSite: 'strict',
			secure: !dev,
			maxAge: 60 * 60 * 8,
		});
		throw redirect(302, '/debug');
	}

	// Subsequent visits — check cookie
	const cookieVal = cookies.get(COOKIE) ?? '';
	if (!safeEqual(cookieVal, dashKey)) throw redirect(302, '/');

	const traces = getTraces();
	const totalSaved = traces.reduce((a, t) => a + (t.tokens.savedTokens ?? 0), 0);

	return {
		builtAt: ragStore.builtAt,
		fullCvTokens: Math.ceil(CV_FULL_CHAR_COUNT / 4),
		chunkCount: ragStore.chunks.length,
		chunks: ragStore.chunks.map(c => ({
			id: c.id,
			heading: c.heading,
			chunkIndex: c.chunkIndex,
			charCount: c.charCount,
			tokenCount: c.tokenCount,
			tags: c.tags,
			textPreview: c.text.slice(0, 150),
		})),
		traceCount: traces.length,
		avgSavedTokens: traces.length ? Math.round(totalSaved / traces.length) : 0,
		recentTraces: traces.slice(0, 15),
	};
};
