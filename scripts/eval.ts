#!/usr/bin/env tsx
/**
 * RAG eval harness — tests that expected CV sections are retrieved for given queries.
 * Run with: npm run eval
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const cvPath = resolve(import.meta.dirname, '../src/lib/CV.md');
const cvText = readFileSync(cvPath, 'utf8');

// Dynamic imports of the rag modules (they use .js extensions for ESM)
// We patch the $lib alias to a real path so tsx can resolve it.
process.env['TS_NODE_BASEURL'] = resolve(import.meta.dirname, '../src');

const { chunkMarkdown } = await import('../src/lib/rag/chunker.js');
const { buildTfidf } = await import('../src/lib/rag/tfidf.js');
const { retrieve } = await import('../src/lib/rag/retriever.js');

const store = buildTfidf(chunkMarkdown(cvText, 'CV.md', 'cv'));

interface TestCase {
	query: string;
	expectedHeadings: string[];
}

const TEST_CASES: TestCase[] = [
	{ query: 'chess engine minimax alpha-beta', expectedHeadings: ['Projects'] },
	{ query: 'university degree Southampton', expectedHeadings: ['Education'] },
	{ query: 'Google Cloud internship experience', expectedHeadings: ['Experience'] },
	{ query: 'Python JavaScript TypeScript skills', expectedHeadings: ['Skills'] },
	{ query: 'charity volunteering Duke of Edinburgh', expectedHeadings: ['Extra-curricular'] },
	{ query: 'email contact GitHub LinkedIn', expectedHeadings: ['Contact'] },
	{ query: 'Raspberry Pi Flask security camera', expectedHeadings: ['Projects'] },
	{ query: 'Monte Carlo simulation finance portfolio', expectedHeadings: ['Projects'] },
	{ query: 'kickboxing jiu-jitsu sport', expectedHeadings: ['Extra-curricular'] },
	{ query: 'Node.js REST API MySQL inventory', expectedHeadings: ['Experience', 'Projects'] },
];

let passed = 0;
let failed = 0;

console.log('\nRAG Eval Harness — TF-IDF lexical index\n' + '─'.repeat(50));

for (const tc of TEST_CASES) {
	const results = retrieve(store, tc.query, 4);
	const retrieved = results.map(r => r.chunk.heading);
	const hit = tc.expectedHeadings.some(h => retrieved.includes(h));

	if (hit) {
		console.log(`✓  "${tc.query}"`);
		console.log(`   → ${retrieved.slice(0, 3).join(', ')}`);
		passed++;
	} else {
		console.log(`✗  "${tc.query}"`);
		console.log(`   expected one of: ${tc.expectedHeadings.join(', ')}`);
		console.log(`   got: ${retrieved.length ? retrieved.join(', ') : '(none)'}`);
		failed++;
	}
}

console.log('\n' + '─'.repeat(50));
console.log(`Results: ${passed}/${TEST_CASES.length} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
