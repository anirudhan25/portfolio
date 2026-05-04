import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { ragStore, CV_FULL_CHAR_COUNT } from '$lib/rag/loader';
import { getTraces } from '$lib/rag/tracer';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const dashKey = env['DASHBOARD_KEY'];
	const provided = url.searchParams.get('key') ?? '';
	if (!dashKey || provided !== dashKey) throw redirect(302, '/');
	const key = provided;

	const traces = getTraces();
	const totalSaved = traces.reduce((a, t) => a + (t.tokens.savedTokens ?? 0), 0);

	return {
		key,
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
