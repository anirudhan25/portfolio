interface Chunk { heading: string; text: string; tf: Record<string, number>; }
interface Store { chunks: Chunk[]; idf: Record<string, number>; }

const STOP = new Set([
	'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from',
	'as','is','was','are','were','been','be','have','has','had','do','does','did',
	'will','would','could','should','may','might','shall','not','this','that','these',
	'those','it','its','my','your','his','her','our','their','i','we','you','he','she',
	'they','me','him','us','them','so','if','then','than','when','where','who','which',
	'how','what','all','also','more','about','into','over','after','just','up','out',
	'use','used','using','via','built','build','including'
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter(t => t.length > 1 && !STOP.has(t));
}

function chunkByHeading(markdown: string): { heading: string; text: string }[] {
	const chunks: { heading: string; text: string }[] = [];
	const sections = markdown.split(/^# /m);
	for (const section of sections) {
		const trimmed = section.trim();
		if (!trimmed) continue;
		const nlIdx = trimmed.indexOf('\n');
		const heading = nlIdx === -1 ? trimmed : trimmed.slice(0, nlIdx).trim();
		const text = nlIdx === -1 ? heading : trimmed.slice(nlIdx + 1).trim();
		if (heading) chunks.push({ heading, text });
	}
	return chunks;
}

export function buildIndex(markdown: string): Store {
	const raw = chunkByHeading(markdown);
	const chunks: Chunk[] = raw.map(c => {
		const tokens = tokenize(c.heading + ' ' + c.text);
		const tf: Record<string, number> = {};
		for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
		const total = tokens.length || 1;
		for (const t in tf) tf[t] /= total;
		return { heading: c.heading, text: c.text, tf };
	});

	const N = chunks.length;
	const df: Record<string, number> = {};
	for (const c of chunks) for (const t of Object.keys(c.tf)) df[t] = (df[t] ?? 0) + 1;

	const idf: Record<string, number> = {};
	for (const [t, d] of Object.entries(df)) idf[t] = Math.log((N + 1) / (d + 1)) + 1;

	return { chunks, idf };
}

export function retrieve(store: Store, query: string, topK = 3): string[] {
	const qTokens = tokenize(query);
	if (!qTokens.length) return [];

	const scored = store.chunks
		.map(c => {
			let score = 0;
			for (const t of qTokens) score += (c.tf[t] ?? 0) * (store.idf[t] ?? 0);
			return { c, score };
		})
		.filter(s => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);

	return scored.map(s => `[${s.c.heading}]\n${s.c.text}`);
}
