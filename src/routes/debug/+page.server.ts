import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { ragStore, CV_FULL_CHAR_COUNT } from '$lib/rag/loader';
import { getTraces } from '$lib/rag/tracer';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
	const authorized = dev || (() => {
		const key = env['DASHBOARD_KEY'];
		return key && request.headers.get('x-dashboard-key') === key;
	})();

	if (!authorized) throw redirect(302, '/');

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
