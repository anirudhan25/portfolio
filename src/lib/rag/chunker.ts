import type { RagChunk } from './types.js';
import { estimateTokens } from './tokenize.js';

const OVERLAP_CHARS = 120;
const SPLIT_THRESHOLD = 600;

function splitAtSentences(text: string, threshold: number, overlap: number): string[] {
	if (text.length <= threshold) return [text];

	const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [text];
	const chunks: string[] = [];
	let current = '';
	let tail = '';

	for (const s of sentences) {
		if (current.length + s.length > threshold && current.length > 0) {
			chunks.push((tail + current).trim());
			tail = current.slice(-overlap);
			current = s;
		} else {
			current += s;
		}
	}
	if (current.trim()) chunks.push((tail + current).trim());
	return chunks;
}

export function chunkMarkdown(markdown: string, source: string, sourceType: 'cv' | 'doc' = 'cv'): RagChunk[] {
	const result: RagChunk[] = [];
	const sections = markdown.split(/^# /m);
	let globalIdx = 0;

	for (const section of sections) {
		const trimmed = section.trim();
		if (!trimmed) continue;

		const nlIdx = trimmed.indexOf('\n');
		const heading = nlIdx === -1 ? trimmed : trimmed.slice(0, nlIdx).trim();
		const body = nlIdx === -1 ? '' : trimmed.slice(nlIdx + 1).trim();
		if (!heading) continue;

		const parts = splitAtSentences(body || heading, SPLIT_THRESHOLD, OVERLAP_CHARS);

		for (let i = 0; i < parts.length; i++) {
			const text = parts[i];
			result.push({
				id: `${source}::${heading}::${i}`,
				heading,
				headingPath: [heading],
				text,
				chunkIndex: globalIdx++,
				source,
				sourceType,
				tags: inferTags(heading),
				charCount: text.length,
				tokenCount: estimateTokens(text),
			});
		}
	}

	return result;
}

function inferTags(heading: string): string[] {
	const h = heading.toLowerCase();
	if (h.includes('project')) return ['projects'];
	if (h.includes('skill')) return ['skills', 'technical'];
	if (h.includes('education')) return ['education'];
	if (h.includes('experience') || h.includes('work')) return ['experience', 'work'];
	if (h.includes('extra') || h.includes('hobbies')) return ['personal', 'extra-curricular'];
	if (h.includes('contact')) return ['contact'];
	return [];
}
