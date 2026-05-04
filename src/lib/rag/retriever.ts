import type { RagStore, RetrievalResult } from './types.js';
import { tokenize } from './tokenize.js';

export function retrieve(store: RagStore, query: string, topK = 4): RetrievalResult[] {
	const qTokens = tokenize(query);
	if (!qTokens.length) return [];

	return store.chunks
		.map(chunk => {
			const chunkTf = store.tf[chunk.id] ?? {};
			let score = 0;
			for (const t of qTokens) score += (chunkTf[t] ?? 0) * (store.idf[t] ?? 0);
			return { chunk, score };
		})
		.filter(r => r.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);
}

export function formatForPrompt(results: RetrievalResult[]): string {
	return results.map(r => `[${r.chunk.heading}]\n${r.chunk.text}`).join('\n\n');
}
