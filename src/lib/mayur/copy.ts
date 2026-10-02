// User-facing wording in one place, so it's easy to tweak.

/** The small print under the composer. */
export const FOOTNOTE = "Mayur's an AI so don't take him too seriously";

export const SUGGESTIONS = ['you pulling up later?', 'explain how vaccines work', "what's 17 times 23"];

export function greeting(name: string | null | undefined, date = new Date()) {
	const h = date.getHours();
	const part = h < 5 ? 'Up late' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 22 ? 'Evening' : 'Up late';
	return name?.trim() ? `${part}, ${name.trim()}` : part;
}
