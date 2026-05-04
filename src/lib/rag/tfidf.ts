import type { RagChunk, RagStore } from './types.js';
import { tokenize } from './tokenize.js';

export function buildTfidf(chunks: RagChunk[]): RagStore {
	const N = chunks.length;

	const tf: Record<string, Record<string, number>> = {};
	const df: Record<string, number> = {};

	for (const chunk of chunks) {
		const tokens = tokenize(chunk.heading + ' ' + chunk.text);
		const freq: Record<string, number> = {};
		for (const t of tokens) freq[t] = (freq[t] ?? 0) + 1;
		const total = tokens.length || 1;
		tf[chunk.id] = {};
		for (const [t, c] of Object.entries(freq)) {
			tf[chunk.id][t] = c / total;
			df[t] = (df[t] ?? 0) + 1;
		}
	}

	const idf: Record<string, number> = {};
	for (const [t, d] of Object.entries(df)) {
		idf[t] = Math.log((N + 1) / (d + 1)) + 1;
	}

	return { chunks, tf, idf, builtAt: Date.now() };
}
