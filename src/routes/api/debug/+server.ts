import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { ragStore, CV_FULL_CHAR_COUNT } from '$lib/rag/loader';
import { getTraces, clearTraces } from '$lib/rag/tracer';
import { retrieve, formatForPrompt } from '$lib/rag/retriever';

function authorized(request: Request): boolean {
	if (dev) return true;
	const key = env['DASHBOARD_KEY'];
	if (!key) return false;
	const header = request.headers.get('x-dashboard-key');
	return header === key;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!authorized(request)) throw error(403, 'Forbidden');

	const chunks = ragStore.chunks;
	const traces = getTraces();

	const totalSaved = traces.reduce((acc, t) => acc + (t.tokens.savedTokens ?? 0), 0);
	const avgSaved = traces.length ? Math.round(totalSaved / traces.length) : 0;

	return json({
		index: {
			chunkCount: chunks.length,
			builtAt: ragStore.builtAt,
			fullCvTokens: Math.ceil(CV_FULL_CHAR_COUNT / 4),
			chunks: chunks.map(c => ({
				id: c.id,
				heading: c.heading,
				chunkIndex: c.chunkIndex,
				charCount: c.charCount,
				tokenCount: c.tokenCount,
				tags: c.tags,
				textPreview: c.text.slice(0, 120),
			})),
		},
		traces: {
			count: traces.length,
			avgSavedTokens: avgSaved,
			recent: traces.slice(0, 20),
		},
	});
};

export const POST: RequestHandler = async ({ request }) => {
	if (!authorized(request)) throw error(403, 'Forbidden');

	let body: { query?: string; action?: string };
	try { body = await request.json(); } catch { throw error(400, 'bad_request'); }

	if (body.action === 'clear_traces') {
		clearTraces();
		return json({ ok: true });
	}

	if (!body.query || typeof body.query !== 'string') throw error(400, 'missing query');
	const query = body.query.slice(0, 200);

	const results = retrieve(ragStore, query, 4);
	const formatted = formatForPrompt(results);

	return json({
		query,
		results: results.map(r => ({
			id: r.chunk.id,
			heading: r.chunk.heading,
			score: r.score,
			charCount: r.chunk.charCount,
			tokenCount: r.chunk.tokenCount,
			text: r.chunk.text,
		})),
		formattedPreview: formatted.slice(0, 600),
		retrievedTokens: results.reduce((a, r) => a + r.chunk.tokenCount, 0),
		fullCvTokens: Math.ceil(CV_FULL_CHAR_COUNT / 4),
	});
};
