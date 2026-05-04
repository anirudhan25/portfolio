import cv from '$lib/CV.md?raw';
import { chunkMarkdown } from './chunker.js';
import { buildTfidf } from './tfidf.js';
import type { RagStore } from './types.js';

export const ragStore: RagStore = buildTfidf(chunkMarkdown(cv, 'CV.md', 'cv'));

export const CV_FULL_CHAR_COUNT = cv.length;
