import { kv } from '@vercel/kv';

const KEY = 'query_log';
const MAX  = 500;

export interface QueryRecord {
	ts:        number;   // unix ms
	q:         string;   // query text (capped at 200 chars)
	blocked:   boolean;
	navigated: boolean;
	tokensOut: number;
}

export async function logQuery(record: QueryRecord): Promise<void> {
	try {
		await kv.lpush(KEY, record);
		await kv.ltrim(KEY, 0, MAX - 1);
	} catch {
		// KV env vars not configured — local dev without .env.local, silently skip
	}
}

export async function getQueryLog(limit = 200): Promise<QueryRecord[]> {
	try {
		return await kv.lrange<QueryRecord>(KEY, 0, limit - 1);
	} catch {
		return [];
	}
}

export async function clearQueryLog(): Promise<void> {
	try {
		await kv.del(KEY);
	} catch { /* ignore */ }
}
