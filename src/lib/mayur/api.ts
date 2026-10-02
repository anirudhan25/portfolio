// MayurGPT HTTP client. The API lives on another origin (the Cloudflare tunnel), so auth is a bearer
// token kept in localStorage — cookies aren't sent on cross-site fetch.
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';

export type Smart = 'auto' | 'on' | 'off';
export type LiveState = 'queued' | 'thinking' | 'writing';

export type User = { id: string; name: string | null; created_at: string; conversations: number };

export type Conversation = {
	id: string;
	title: string;
	starred: boolean;
	current_leaf_id: string | null;
	created_at: string;
	updated_at: string;
	generating: boolean;
};

export type Thinking = { summary: string; text: string; seconds: number | null };

export type Message = {
	id: string;
	conversation_id: string;
	parent_id: string | null;
	role: 'user' | 'assistant';
	content: string;
	status: 'complete' | 'pending' | 'stopped' | 'error';
	created_at: string;
	parts?: string[];
	smart?: boolean;
	preface?: string | null;
	thinking?: Thinking | null;
	source?: string | null;
	// client-only, while a reply streams
	live?: { state: LiveState; position?: number } | null;
	error?: string | null;
};

export type Health = {
	status: 'loading' | 'ready' | 'error';
	queue: number;
	invite_required: boolean;
	smart_mode?: boolean;
	base_model?: string;
};

export type StreamEvent =
	| { type: 'message_start'; conversation_id: string; assistant_message: Message; user_message?: Message }
	| { type: 'snapshot'; state: LiveState; text: string; preface: string | null; thinking: Thinking | null; position?: number }
	| { type: 'status'; state: LiveState; position?: number; smart?: boolean }
	| { type: 'preface'; text: string }
	| { type: 'thinking_delta'; text: string }
	| { type: 'thinking_done'; summary: string; seconds: number }
	| { type: 'delta'; text: string }
	| { type: 'replace'; text: string }
	| { type: 'error'; message: string }
	| { type: 'message_stop'; message: Message | null; conversation: Conversation | null };

export const MAX_CHARS = 8000;

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

// ---- config: where the API lives
// PUBLIC_MAYUR_API (Vercel env) is the default. `?api=<url>` overrides it for this tab, which is handy with
// a quick tunnel whose URL changes on every restart.
const API_OVERRIDE_KEY = 'mayurgpt.api';
const TOKEN_KEY = 'mayurgpt.token';

function store(kind: 'local' | 'session') {
	try {
		return kind === 'local' ? localStorage : sessionStorage;
	} catch {
		return null;
	}
}

function cleanBase(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const u = new URL(url.trim());
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
		return u.origin;
	} catch {
		return null;
	}
}

const configuredBase = cleanBase(env.PUBLIC_MAYUR_API) ?? (dev ? 'http://127.0.0.1:8000' : null);

export function setApiOverride(url: string | null) {
	const base = cleanBase(url);
	if (base && base !== configuredBase) store('session')?.setItem(API_OVERRIDE_KEY, base);
	else store('session')?.removeItem(API_OVERRIDE_KEY);
}

export function apiBase(): string | null {
	return cleanBase(store('session')?.getItem(API_OVERRIDE_KEY)) ?? configuredBase;
}

// Tokens for an overridden API are kept separately, so a crafted `?api=` link can never be handed the
// token for the real server.
function tokenKey() {
	const base = apiBase();
	return base && base !== configuredBase ? `${TOKEN_KEY}@${base}` : TOKEN_KEY;
}

export function getToken(): string | null {
	return store('local')?.getItem(tokenKey()) ?? null;
}

export function setToken(token: string | null) {
	const s = store('local');
	if (!s) return;
	if (token) s.setItem(tokenKey(), token);
	else s.removeItem(tokenKey());
}

// ---- requests
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
	onUnauthorized = fn;
}

function headers(json: boolean): HeadersInit {
	const h: Record<string, string> = {};
	if (json) h['Content-Type'] = 'application/json';
	const token = getToken();
	if (token) h.Authorization = `Bearer ${token}`;
	return h;
}

async function errorFrom(res: Response): Promise<ApiError> {
	let detail = res.statusText;
	try {
		const body = await res.json();
		if (typeof body?.detail === 'string') detail = body.detail;
	} catch {
		/* not JSON */
	}
	if (res.status === 401) onUnauthorized();
	return new ApiError(res.status, detail);
}

function url(path: string): string {
	const base = apiBase();
	if (!base) throw new ApiError(0, 'no API configured');
	return base + path;
}

export async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url(path), {
			method,
			headers: headers(body !== undefined),
			body: body === undefined ? undefined : JSON.stringify(body)
		});
	} catch (e) {
		if (e instanceof ApiError) throw e;
		throw new ApiError(0, 'network');
	}
	if (!res.ok) throw await errorFrom(res);
	return res.json();
}

/** POST/GET an SSE endpoint and call onEvent for each event. Resolves when the stream ends (or on 204). */
export async function streamSSE(
	path: string,
	method: 'GET' | 'POST',
	body: unknown,
	onEvent: (e: StreamEvent) => void,
	signal?: AbortSignal
): Promise<void> {
	let res: Response;
	try {
		res = await fetch(url(path), {
			method,
			headers: headers(body !== undefined),
			body: body === undefined ? undefined : JSON.stringify(body),
			signal
		});
	} catch (e) {
		if (e instanceof ApiError || (e as Error)?.name === 'AbortError') throw e;
		throw new ApiError(0, 'network');
	}
	if (res.status === 204) return;
	if (!res.ok) throw await errorFrom(res);
	const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
	let buf = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += value;
		let i: number;
		while ((i = buf.indexOf('\n\n')) >= 0) {
			const block = buf.slice(0, i);
			buf = buf.slice(i + 2);
			const data = block
				.split('\n')
				.filter((l) => l.startsWith('data: '))
				.map((l) => l.slice(6))
				.join('\n');
			if (data) onEvent(JSON.parse(data)); // ": ping" keep-alives have no data line
		}
	}
}

export async function health(): Promise<Health> {
	let res: Response;
	try {
		res = await fetch(url('/api/health'), { cache: 'no-store' });
	} catch (e) {
		if (e instanceof ApiError) throw e;
		throw new ApiError(0, 'network');
	}
	if (!res.ok) throw new ApiError(res.status, res.statusText);
	return res.json();
}
