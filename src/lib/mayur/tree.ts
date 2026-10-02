// Messages form a tree through parent_id; the visible thread is the path from the root to current_leaf_id.
import type { Message } from './api';

export type ThreadItem = { msg: Message; siblings: Message[]; index: number };

const ROOT = '\u0000root';

export function childrenOf(messages: Record<string, Message>): Map<string, Message[]> {
	const children = new Map<string, Message[]>();
	for (const m of Object.values(messages)) {
		const key = m.parent_id ?? ROOT;
		const list = children.get(key);
		if (list) list.push(m);
		else children.set(key, [m]);
	}
	for (const list of children.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
	return children;
}

/** Descend from a message to its most recent leaf by repeatedly picking the newest child. */
export function newestLeaf(children: Map<string, Message[]>, from: Message): Message {
	let m = from;
	for (;;) {
		const kids = children.get(m.id);
		if (!kids?.length) return m;
		m = kids[kids.length - 1];
	}
}

export function buildThread(messages: Record<string, Message>, leafId: string | null): ThreadItem[] {
	const children = childrenOf(messages);
	let leaf = leafId ? messages[leafId] : undefined;
	if (!leaf) {
		const roots = children.get(ROOT);
		if (!roots?.length) return [];
		leaf = newestLeaf(children, roots[roots.length - 1]);
	}
	const path: Message[] = [];
	const seen = new Set<string>();
	for (let m: Message | undefined = leaf; m && !seen.has(m.id); m = m.parent_id ? messages[m.parent_id] : undefined) {
		seen.add(m.id);
		path.push(m);
	}
	path.reverse();
	return path.map((msg) => {
		const siblings = children.get(msg.parent_id ?? ROOT) ?? [msg];
		return { msg, siblings, index: Math.max(0, siblings.findIndex((s) => s.id === msg.id)) };
	});
}
