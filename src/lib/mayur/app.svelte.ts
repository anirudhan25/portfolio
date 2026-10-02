// All MayurGPT client state: session, health, sidebar list, loaded chats and live reply streams.
import { goto } from '$app/navigation';
import * as api from './api';
import { ApiError, type Conversation, type Message, type Smart, type StreamEvent, type User } from './api';
import { childrenOf, newestLeaf } from './tree';

export const BASE = '/MayurGPT';
const PAGE = 50;
const SMART_KEY = 'mayurgpt.smart';

type Chat = { conv: Conversation; messages: Record<string, Message>; streaming: boolean };
type Health = 'unknown' | 'offline' | 'loading' | 'ready' | 'error';

let seq = 0;
const tmpId = (kind: string) => `tmp-${kind}-${Date.now()}-${seq++}`;
const isTmp = (id: string) => id.startsWith('tmp-');
const now = () => new Date().toISOString();

export class MayurApp {
	phase = $state<'boot' | 'invite' | 'ready' | 'unconfigured'>('boot');
	health = $state<Health>('unknown');
	user = $state<User | null>(null);
	inviteError = $state<string | null>(null);
	authBusy = $state(false);

	conversations = $state<Conversation[]>([]);
	hasMore = $state(false);
	loadingMore = $state(false);

	chats = $state<Record<string, Chat>>({});
	currentId = $state<string | null>(null);
	loadingChat = $state(false);
	/** the reply this user has in flight (the server allows one at a time per user) */
	activeReply = $state<{ cid: string; mid: string | null } | null>(null);

	smart = $state<Smart>('auto');
	draft = $state('');
	notice = $state<{ text: string; id: number } | null>(null);
	/** bumped on every streamed change so the view can keep itself pinned to the bottom */
	tick = $state(0);

	current = $derived(this.currentId ? (this.chats[this.currentId] ?? null) : null);

	private abort = new AbortController();
	private healthTimer: ReturnType<typeof setTimeout> | undefined;
	private noticeTimer: ReturnType<typeof setTimeout> | undefined;
	private pendingInvite: string | null = null;
	private pendingTransfer: string | null = null;

	// ---- lifecycle
	async boot(url: URL) {
		try {
			const s = localStorage.getItem(SMART_KEY);
			if (s === 'on' || s === 'auto') this.smart = s;
		} catch {
			/* storage blocked */
		}
		const p = url.searchParams;
		this.pendingInvite = p.get('invite');
		this.pendingTransfer = p.get('device');
		if (p.has('api')) api.setApiOverride(p.get('api'));
		if (p.has('invite') || p.has('api') || p.has('device')) {
			const clean = new URL(url);
			for (const k of ['invite', 'api', 'device']) clean.searchParams.delete(k);
			goto(clean.pathname + clean.search + clean.hash, { replaceState: true, keepFocus: true, noScroll: true });
		}
		api.setUnauthorizedHandler(() => this.unauthorized());
		if (!api.apiBase()) {
			this.phase = 'unconfigured';
			this.health = 'offline';
			return;
		}
		await this.checkHealth();
		if (this.health !== 'offline') await this.signIn();
	}

	destroy() {
		this.abort.abort();
		clearTimeout(this.healthTimer);
		clearTimeout(this.noticeTimer);
		api.setUnauthorizedHandler(() => {});
	}

	setSmart(s: Smart) {
		this.smart = s;
		try {
			localStorage.setItem(SMART_KEY, s);
		} catch {
			/* storage blocked */
		}
	}

	notify(text: string) {
		clearTimeout(this.noticeTimer);
		this.notice = { text, id: Date.now() };
		this.noticeTimer = setTimeout(() => (this.notice = null), 4500);
	}

	/** Turn an API failure into something Mayur would say. Returns true if it was handled. */
	private explain(e: unknown, fallback = 'something went wrong, try again') {
		if (!(e instanceof ApiError)) {
			this.notify(fallback);
			return;
		}
		if (e.status === 0) this.markOffline();
		else if (e.status === 401) return; // unauthorized() takes over
		else if (e.status === 429) this.notify('slow down a bit');
		else if (e.status === 503) this.notify("Mayur's busy, try again in a minute");
		else if (e.status === 409) this.notify("Mayur's still replying to you, give him a sec");
		else this.notify(e.message || fallback);
	}

	// ---- health
	async checkHealth() {
		clearTimeout(this.healthTimer);
		const was = this.health;
		try {
			const h = await api.health();
			this.health = h.status === 'ready' ? 'ready' : h.status === 'loading' ? 'loading' : 'error';
		} catch {
			this.health = 'offline';
		}
		if (this.health !== 'ready') {
			this.healthTimer = setTimeout(() => this.checkHealth(), this.health === 'loading' ? 5000 : 15000);
		}
		if (was === 'offline' && this.health !== 'offline') this.recover();
	}

	markOffline() {
		if (this.health === 'offline') return;
		this.health = 'offline';
		clearTimeout(this.healthTimer);
		this.healthTimer = setTimeout(() => this.checkHealth(), 15000);
	}

	private recover() {
		if (this.phase === 'boot') this.signIn();
		else if (this.phase === 'ready') {
			this.refreshConversations();
			if (this.currentId) this.open(this.currentId);
		}
	}

	onVisible() {
		if (this.health === 'offline' || this.health === 'error') this.checkHealth();
		else if (this.phase === 'ready') this.refreshConversations();
	}

	// ---- session
	async signIn(invite = this.pendingInvite, transfer = this.pendingTransfer, name?: string) {
		this.authBusy = true;
		try {
			if (api.getToken() && !transfer) {
				try {
					this.user = await api.req<User>('/api/me');
					this.ready();
					return;
				} catch (e) {
					if (!(e instanceof ApiError && e.status === 401)) throw e;
					api.setToken(null);
				}
			}
			const body: Record<string, string> = {};
			if (invite) body.invite = invite.trim();
			if (transfer) body.transfer_code = transfer.trim().toUpperCase();
			if (name?.trim()) body.name = name.trim().slice(0, 60);
			const r = await api.req<{ user: User; token: string; new: boolean }>('/api/session', 'POST', body);
			api.setToken(r.token);
			this.user = r.user;
			this.pendingInvite = this.pendingTransfer = null;
			this.ready();
		} catch (e) {
			if (e instanceof ApiError && e.status === 403) {
				this.phase = 'invite';
				this.inviteError = invite || transfer ? e.message : null;
				this.pendingInvite = this.pendingTransfer = null;
			} else if (e instanceof ApiError && e.status === 0) {
				this.markOffline();
			} else {
				this.explain(e);
			}
		} finally {
			this.authBusy = false;
		}
	}

	private ready() {
		this.phase = 'ready';
		this.inviteError = null;
		this.refreshConversations();
		if (this.currentId) this.open(this.currentId);
	}

	private unauthorized() {
		if (this.phase !== 'ready') return;
		this.reset();
		this.signIn();
	}

	private reset() {
		api.setToken(null);
		this.abort.abort();
		this.abort = new AbortController();
		this.phase = 'boot';
		this.user = null;
		this.conversations = [];
		this.chats = {};
		this.activeReply = null;
		if (this.currentId) goto(BASE, { replaceState: true });
	}

	async redeemTransfer(code: string) {
		const prev = api.getToken();
		try {
			const r = await api.req<{ user: User; token: string }>('/api/session', 'POST', {
				transfer_code: code.trim().toUpperCase()
			});
			this.reset();
			api.setToken(r.token);
			this.user = r.user;
			this.ready();
			return null;
		} catch (e) {
			if (prev && !api.getToken()) api.setToken(prev);
			return e instanceof ApiError && e.status === 403 ? e.message : "couldn't use that code";
		}
	}

	async makeTransferCode() {
		return api.req<{ code: string; expires_in: number }>('/api/session/transfer', 'POST');
	}

	async setName(name: string) {
		try {
			this.user = await api.req<User>('/api/me', 'PATCH', { name: name.trim() || null });
		} catch (e) {
			this.explain(e);
		}
	}

	async forgetDevice() {
		try {
			await api.req('/api/session', 'DELETE');
		} catch {
			/* forget locally regardless */
		}
		this.reset();
		this.signIn(null, null);
	}

	async deleteEverything() {
		try {
			await api.req('/api/me', 'DELETE');
		} catch (e) {
			this.explain(e);
			return;
		}
		this.reset();
		this.signIn(null, null);
	}

	// ---- sidebar
	private upsertConv(c: Conversation) {
		const i = this.conversations.findIndex((x) => x.id === c.id);
		if (i >= 0) this.conversations[i] = c;
		else this.conversations.unshift(c);
		this.conversations.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	}

	private setGenerating(cid: string, on: boolean) {
		const c = this.conversations.find((x) => x.id === cid);
		if (c) c.generating = on;
	}

	async refreshConversations() {
		const limit = Math.min(200, Math.max(PAGE, this.conversations.length));
		try {
			const r = await api.req<{ conversations: Conversation[] }>(`/api/conversations?limit=${limit}&offset=0`);
			this.conversations = r.conversations;
			this.hasMore = r.conversations.length === limit;
		} catch (e) {
			this.explain(e);
		}
	}

	async loadMore() {
		if (this.loadingMore || !this.hasMore) return;
		this.loadingMore = true;
		try {
			const r = await api.req<{ conversations: Conversation[] }>(
				`/api/conversations?limit=${PAGE}&offset=${this.conversations.length}`
			);
			const known = new Set(this.conversations.map((c) => c.id));
			this.conversations.push(...r.conversations.filter((c) => !known.has(c.id)));
			this.hasMore = r.conversations.length === PAGE;
		} catch (e) {
			this.explain(e);
		} finally {
			this.loadingMore = false;
		}
	}

	async search(q: string) {
		const r = await api.req<{ conversations: Conversation[] }>(
			`/api/conversations?q=${encodeURIComponent(q)}&limit=50&offset=0`
		);
		return r.conversations;
	}

	async patchConversation(cid: string, patch: Partial<Pick<Conversation, 'title' | 'starred' | 'current_leaf_id'>>) {
		try {
			const c = await api.req<Conversation>(`/api/conversations/${cid}`, 'PATCH', patch);
			const i = this.conversations.findIndex((x) => x.id === c.id);
			if (i >= 0) this.conversations[i] = c;
			const chat = this.chats[cid];
			if (chat) chat.conv = { ...chat.conv, title: c.title, starred: c.starred };
		} catch (e) {
			this.explain(e);
		}
	}

	async deleteConversation(cid: string) {
		try {
			await api.req(`/api/conversations/${cid}`, 'DELETE');
		} catch (e) {
			this.explain(e);
			return;
		}
		this.conversations = this.conversations.filter((c) => c.id !== cid);
		delete this.chats[cid];
		if (this.activeReply?.cid === cid) this.activeReply = null;
		if (this.currentId === cid) goto(BASE);
	}

	// ---- the open chat
	setCurrent(cid: string | null) {
		if (cid === this.currentId) return;
		this.currentId = cid;
		if (cid && this.phase === 'ready') this.open(cid);
	}

	async open(cid: string, followPending = true) {
		if (this.chats[cid]?.streaming) return;
		this.loadingChat = !this.chats[cid];
		try {
			const r = await api.req<Conversation & { messages: Message[] }>(`/api/conversations/${cid}`);
			const { messages, ...conv } = r;
			if (this.chats[cid]?.streaming) return; // a reply started while this was loading
			const map: Record<string, Message> = {};
			for (const m of messages) map[m.id] = m;
			this.chats[cid] = { conv, messages: map, streaming: false };
			const i = this.conversations.findIndex((x) => x.id === cid);
			if (i >= 0) this.conversations[i] = conv;
			this.tick++;
			const pending = messages.find((m) => m.role === 'assistant' && m.status === 'pending');
			if (pending && followPending) this.follow(cid, pending.id);
		} catch (e) {
			if (e instanceof ApiError && (e.status === 404 || e.status === 422)) {
				this.notify("couldn't find that chat");
				if (this.currentId === cid) goto(BASE, { replaceState: true });
			} else this.explain(e);
		} finally {
			this.loadingChat = false;
		}
	}

	/** Re-attach to a reply that's still being written (page reload, another tab or device). */
	private async follow(cid: string, mid: string) {
		const chat = this.chats[cid];
		if (!chat || chat.streaming) return;
		chat.streaming = true;
		const ref = { mid: mid as string | null };
		if (!this.activeReply) this.activeReply = { cid, mid };
		this.setGenerating(cid, true);
		let ended = false;
		let events = 0;
		try {
			await api.streamSSE(
				`/api/conversations/${cid}/stream`,
				'GET',
				undefined,
				(e) => {
					events++;
					if (e.type === 'message_stop') ended = true;
					this.onEvent(cid, ref, e);
				},
				this.abort.signal
			);
		} catch (e) {
			if ((e as Error)?.name !== 'AbortError') this.explain(e);
		} finally {
			// 204: it finished between loading the chat and following it, so load it once more (without re-following)
			this.finishStream(cid, ended || events === 0);
			if (!events && !this.abort.signal.aborted && this.health !== 'offline') this.open(cid, false);
		}
	}

	private finishStream(cid: string, ended: boolean) {
		const chat = this.chats[cid];
		if (chat) chat.streaming = false;
		if (this.activeReply?.cid === cid) this.activeReply = null;
		this.setGenerating(cid, false);
		// the stream dropped (or was 204) before the reply finished: fetch the truth, and re-follow if still going
		if (!ended && chat && !this.abort.signal.aborted && this.health !== 'offline') this.open(cid);
	}

	private onEvent(cid: string, ref: { mid: string | null }, e: StreamEvent) {
		const chat = this.chats[cid];
		if (!chat) return;
		this.tick++;
		if (e.type === 'message_start') {
			for (const id of Object.keys(chat.messages)) if (isTmp(id)) delete chat.messages[id];
			if (e.user_message) chat.messages[e.user_message.id] = e.user_message;
			chat.messages[e.assistant_message.id] = { ...e.assistant_message, live: null };
			chat.conv.current_leaf_id = e.assistant_message.id;
			ref.mid = e.assistant_message.id;
			if (this.activeReply?.cid === cid) this.activeReply.mid = ref.mid;
			return;
		}
		if (e.type === 'message_stop') {
			const m = ref.mid ? chat.messages[ref.mid] : null;
			if (e.message) chat.messages[e.message.id] = { ...e.message, live: null, error: m?.error ?? null };
			else if (m) m.live = null;
			if (e.conversation) {
				chat.conv = e.conversation;
				this.upsertConv(e.conversation);
			}
			return;
		}
		const m = ref.mid ? chat.messages[ref.mid] : null;
		if (!m) return;
		switch (e.type) {
			case 'snapshot':
				m.content = e.text;
				m.preface = e.preface;
				m.thinking = e.thinking;
				m.live = { state: e.state, position: e.position };
				break;
			case 'status':
				m.live = { state: e.state, position: e.position };
				if (e.state === 'thinking' && !m.thinking) m.thinking = { summary: '', text: '', seconds: null };
				break;
			case 'preface':
				m.preface = e.text;
				break;
			case 'thinking_delta':
				if (!m.thinking) m.thinking = { summary: '', text: '', seconds: null };
				m.thinking.text += e.text;
				break;
			case 'thinking_done':
				if (!m.thinking) m.thinking = { summary: '', text: '', seconds: null };
				m.thinking.summary = e.summary;
				m.thinking.seconds = e.seconds;
				break;
			case 'delta':
				m.content += e.text;
				break;
			case 'replace':
				m.content = e.text;
				break;
			case 'error':
				m.error = e.message;
				break;
		}
	}

	/** Run a reply stream (send or retry) with optimistic placeholders that message_start replaces. */
	private async runReply(cid: string, path: string, body: unknown, prevLeaf: string | null) {
		const chat = this.chats[cid];
		chat.streaming = true;
		this.activeReply = { cid, mid: null };
		this.setGenerating(cid, true);
		const ref = { mid: null as string | null };
		let ended = false;
		try {
			await api.streamSSE(
				path,
				'POST',
				body,
				(e) => {
					if (e.type === 'message_stop') ended = true;
					this.onEvent(cid, ref, e);
				},
				this.abort.signal
			);
			return true;
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') return true;
			const c = this.chats[cid];
			if (c && !ref.mid) {
				// nothing was started: take the placeholders back out
				for (const id of Object.keys(c.messages)) if (isTmp(id)) delete c.messages[id];
				c.conv.current_leaf_id = prevLeaf;
			}
			this.explain(e);
			// a 503 still stored the message (with an errored reply), so show what the server has
			if (e instanceof ApiError && e.status === 503) ended = false;
			else ended = !ref.mid;
			return !!ref.mid;
		} finally {
			this.finishStream(cid, ended);
		}
	}

	get busy() {
		return !!this.activeReply;
	}

	/** Send a message. parentId: undefined continues the visible branch; 'root' or an id branches (edit). */
	async send(text: string, parentId?: string, fromComposer = false) {
		const content = text.trim();
		if (!content || this.busy || this.phase !== 'ready') return;
		if (fromComposer) this.draft = '';
		let cid = this.currentId;
		if (!cid) {
			try {
				const conv = await api.req<Conversation>('/api/conversations', 'POST', {});
				this.chats[conv.id] = { conv, messages: {}, streaming: false };
				this.upsertConv(conv);
				cid = conv.id;
				this.currentId = cid;
				goto(`${BASE}/c/${cid}`, { keepFocus: true, noScroll: true });
			} catch (e) {
				if (fromComposer && !this.draft) this.draft = text;
				this.explain(e);
				return;
			}
		}
		const chat = this.chats[cid];
		if (!chat) return;
		const prevLeaf = chat.conv.current_leaf_id;
		let parent: string | null;
		if (parentId === undefined) {
			const leaf = prevLeaf ? chat.messages[prevLeaf] : null;
			parent = leaf?.role === 'assistant' ? leaf.id : null;
			parentId = leaf ? (leaf.role === 'assistant' ? leaf.id : undefined) : 'root';
		} else parent = parentId === 'root' ? null : parentId;

		const u: Message = {
			id: tmpId('u'), conversation_id: cid, parent_id: parent, role: 'user',
			content, status: 'complete', created_at: now()
		};
		const a: Message = {
			id: tmpId('a'), conversation_id: cid, parent_id: u.id, role: 'assistant',
			content: '', status: 'pending', created_at: now(), live: null
		};
		chat.messages[u.id] = u;
		chat.messages[a.id] = a;
		chat.conv.current_leaf_id = a.id;
		this.tick++;

		const body: Record<string, string> = { content, smart: this.smart };
		if (parentId !== undefined) body.parent_id = parentId;
		const ok = await this.runReply(cid, `/api/conversations/${cid}/messages`, body, prevLeaf);
		if (!ok && fromComposer && !this.draft) this.draft = text;
	}

	async retry(mid: string) {
		const cid = this.currentId;
		const chat = cid ? this.chats[cid] : null;
		const m = chat?.messages[mid];
		if (!cid || !chat || !m || this.busy) return;
		const prevLeaf = chat.conv.current_leaf_id;
		const a: Message = {
			id: tmpId('a'), conversation_id: cid, parent_id: m.role === 'assistant' ? m.parent_id : m.id,
			role: 'assistant', content: '', status: 'pending', created_at: now(), live: null
		};
		chat.messages[a.id] = a;
		chat.conv.current_leaf_id = a.id;
		this.tick++;
		await this.runReply(cid, `/api/conversations/${cid}/messages/${mid}/retry`, { smart: this.smart }, prevLeaf);
	}

	async stop() {
		const cid = this.activeReply?.cid;
		if (!cid) return;
		try {
			await api.req(`/api/conversations/${cid}/stop`, 'POST');
		} catch (e) {
			this.explain(e);
		}
	}

	switchBranch(target: Message) {
		const chat = this.current;
		if (!chat || chat.streaming) return;
		const leaf = newestLeaf(childrenOf(chat.messages), target);
		chat.conv.current_leaf_id = leaf.id;
		this.tick++;
		this.patchConversation(chat.conv.id, { current_leaf_id: leaf.id });
	}
}
