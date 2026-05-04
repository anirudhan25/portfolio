export const STOP = new Set([
	'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from',
	'as','is','was','are','were','been','be','have','has','had','do','does','did',
	'will','would','could','should','may','might','shall','not','this','that','these',
	'those','it','its','my','your','his','her','our','their','i','we','you','he','she',
	'they','me','him','us','them','so','if','then','than','when','where','who','which',
	'how','what','all','also','more','about','into','over','after','just','up','out',
	'use','used','using','via','built','build','including'
]);

export function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter(t => t.length > 1 && !STOP.has(t));
}

/** Rough token estimate: ~4 chars per token */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
