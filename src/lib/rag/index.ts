export type { RagChunk, RagStore, RetrievalResult, RequestTrace, LatencyTrace, TokenTrace } from './types.js';
export { tokenize, estimateTokens, STOP } from './tokenize.js';
export { chunkMarkdown } from './chunker.js';
export { buildTfidf } from './tfidf.js';
export { retrieve, formatForPrompt } from './retriever.js';
export { addTrace, getTraces, clearTraces } from './tracer.js';
export { ragStore, CV_FULL_CHAR_COUNT } from './loader.js';

// Legacy compat (old index built these in one function)
import { buildTfidf } from './tfidf.js';
import { chunkMarkdown } from './chunker.js';

/** @deprecated use ragStore from loader.ts directly */
export function buildIndex(markdown: string) {
	return buildTfidf(chunkMarkdown(markdown, 'CV.md', 'cv'));
}
