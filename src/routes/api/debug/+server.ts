import { json, error } from '@sveltejs/kit';
import { timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { ragStore, CV_FULL_CHAR_COUNT } from '$lib/rag/loader';
import { getTraces, clearTraces } from '$lib/rag/tracer';
import { retrieve, formatForPrompt } from '$lib/rag/retriever';
import { clearQueryLog } from '$lib/queryLog';

const COOKIE = 'dash_auth';
const API_BODY_LIMIT = 512;

// Simple brute-force guard on the debug API
const debugRateMap = new Map<string, { count: number; reset: number }>();
function checkDebugRate(ip: string): boolean {
	const now = Date.now();
	const rec = debugRateMap.get(ip);
	if (!rec || now > rec.reset) { debugRateMap.set(ip, { count: 1, reset: now + 60_000 }); return true; }
	if (rec.count >= 30) return false;
	rec.count++;
	return true;
}

function safeEqual(a: string, b: string): boolean {
	if (!a || !b || a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function authorized(request: Request, cookies: Record<string, string | undefined>): boolean {
	const dashKey = env['DASHBOARD_KEY'];
	if (!dashKey) return false;
	const cookieVal = cookies[COOKIE] ?? '';
	return safeEqual(cookieVal, dashKey);
}

export const GET: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	if (!checkDebugRate(getClientAddress())) throw error(429, 'Too many requests');
	if (!authorized(request, Object.fromEntries(
		(request.headers.get('cookie') ?? '').split(';').map(c => { const [k, ...v] = c.trim().split('='); return [k, v.join('=')] })
	))) throw error(403, 'Forbidden');

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

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!checkDebugRate(getClientAddress())) throw error(429, 'Too many requests');

	// Cookie auth — read from Cookie header
	const cookieHeader = request.headers.get('cookie') ?? '';
	const cookies = Object.fromEntries(
		cookieHeader.split(';').map(c => { const [k, ...v] = c.trim().split('='); return [k, v.join('=')] })
	);
	if (!authorized(request, cookies)) throw error(403, 'Forbidden');

	const rawBody = await request.text();
	if (rawBody.length > API_BODY_LIMIT) throw error(413, 'too_large');

	let body: { query?: string; action?: string };
	try { body = JSON.parse(rawBody); } catch { throw error(400, 'bad_request'); }

	if (body.action === 'clear_traces') {
		clearTraces();
		return json({ ok: true });
	}

	if (body.action === 'clear_query_log') {
		await clearQueryLog();
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
