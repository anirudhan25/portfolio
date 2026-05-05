<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ── Tab ──────────────────────────────────────────────────────────────────────
	let tab = $state<'overview' | 'requests' | 'flagged' | 'rag'>('overview');

	// ── Requests filter ───────────────────────────────────────────────────────────
	let reqFilter = $state<'all' | 'safe' | 'nav' | 'malicious'>('all');
	let reqSearch = $state('');
	let expandedRows = $state(new Set<number>());

	// ── RAG inspector ─────────────────────────────────────────────────────────────
	let qInput = $state('');
	let qResults = $state<null | { results: { heading: string; score: number; tokenCount: number; text: string }[]; retrievedTokens: number; fullCvTokens: number }>(null);
	let qRunning = $state(false);

	// ── Map ref ───────────────────────────────────────────────────────────────────
	let mapEl = $state<HTMLElement | undefined>();
	let leafletMap: { fitBounds: (b: [[number,number],[number,number]]) => void } | null = null;

	// ── Derived stats ─────────────────────────────────────────────────────────────
	const log = $derived(data.queryLog);
	const total  = $derived(log.length);
	const blocked   = $derived(log.filter((r: { blocked: boolean }) => r.blocked).length);
	const navCount  = $derived(log.filter((r: { navigated: boolean; blocked: boolean }) => r.navigated && !r.blocked).length);
	const safeCount = $derived(log.filter((r: { blocked: boolean; navigated: boolean }) => !r.blocked && !r.navigated).length);
	const blockRate = $derived(total ? Math.round((blocked / total) * 100) : 0);
	const uniqueIps = $derived(new Set(log.map((r: { ip?: string }) => r.ip).filter(Boolean)).size);
	const avgLatency = $derived((() => {
		const vals = log.map((r: { latencyMs?: number }) => r.latencyMs).filter((n): n is number => typeof n === 'number');
		return vals.length ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : 0;
	})());
	const totalTokensSaved = $derived(data.recentTraces.reduce((a: number, t: { tokens: { savedTokens?: number } }) => a + (t.tokens.savedTokens ?? 0), 0));

	// Hourly buckets (last 24h)
	const hourly = $derived((() => {
		const now = Date.now();
		const buckets = Array.from({ length: 24 }, () => ({ total: 0, blocked: 0 }));
		for (const r of log) {
			const h = Math.floor((now - (r as { ts: number }).ts) / 3_600_000);
			if (h < 24) {
				buckets[23 - h].total++;
				if ((r as { blocked: boolean }).blocked) buckets[23 - h].blocked++;
			}
		}
		return buckets;
	})());
	const hourlyMax = $derived(Math.max(...hourly.map((b: { total: number }) => b.total), 1));

	// Country breakdown
	const countries = $derived((() => {
		const m = new Map<string, { country: string; countryCode: string; count: number; blocked: number }>();
		for (const r of log) {
			if (!(r as { country?: string }).country) continue;
			const rec = r as { country: string; countryCode?: string; blocked: boolean };
			const existing = m.get(rec.country);
			if (existing) { existing.count++; if (rec.blocked) existing.blocked++; }
			else m.set(rec.country, { country: rec.country, countryCode: rec.countryCode ?? '??', count: 1, blocked: rec.blocked ? 1 : 0 });
		}
		return [...m.values()].sort((a, b) => b.count - a.count);
	})());

	// Model usage breakdown
	const modelUsage = $derived((() => {
		const m = new Map<string, number>();
		for (const r of log) {
			const model = (r as { modelUsed?: string }).modelUsed;
			if (model) m.set(model, (m.get(model) ?? 0) + 1);
		}
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	})());

	// Filtered requests
	const filteredRequests = $derived((() => {
		let items = log as Array<{ ts: number; q: string; output?: string; blocked: boolean; navigated: boolean; tokensOut: number; ip?: string; country?: string; countryCode?: string; city?: string; category?: string; modelUsed?: string; isAdmin?: boolean; latencyMs?: number }>;
		if (reqFilter === 'safe') items = items.filter(r => !r.blocked && !r.navigated);
		else if (reqFilter === 'nav') items = items.filter(r => r.navigated);
		else if (reqFilter === 'malicious') items = items.filter(r => r.blocked);
		if (reqSearch.trim()) {
			const s = reqSearch.toLowerCase();
			items = items.filter(r => r.q.toLowerCase().includes(s) || (r.ip ?? '').includes(s) || (r.country ?? '').toLowerCase().includes(s));
		}
		return items;
	})());

	const flaggedRequests = $derived(
		(log as Array<{ ts: number; q: string; output?: string; blocked: boolean; navigated: boolean; tokensOut: number; ip?: string; country?: string; countryCode?: string; city?: string; category?: string; modelUsed?: string; isAdmin?: boolean; latencyMs?: number }>)
			.filter(r => r.blocked)
	);

	// ── Helpers ───────────────────────────────────────────────────────────────────
	function flag(code: string) {
		if (!code || code.length !== 2) return '🌐';
		return code.toUpperCase().split('').map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');
	}

	function fmtTime(ts: number) {
		return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function fmtDate(ts: number) {
		return new Date(ts).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function fmtMs(n: number) { return n < 1 ? '<1ms' : `${n}ms`; }

	function statusColor(r: { blocked: boolean; navigated: boolean }) {
		if (r.blocked) return '#ef4444';
		if (r.navigated) return '#3b82f6';
		return '#22c55e';
	}

	function statusLabel(r: { blocked: boolean; navigated: boolean; category?: string }) {
		if (r.blocked) return r.category === 'malicious_injection' ? 'INJECTED' : 'BLOCKED';
		if (r.navigated) return 'NAV';
		return 'OK';
	}

	function catColor(cat?: string) {
		if (cat === 'malicious_injection') return '#ef4444';
		if (cat === 'navigation') return '#3b82f6';
		return '#22c55e';
	}

	function toggleRow(i: number) {
		const next = new Set(expandedRows);
		if (next.has(i)) next.delete(i); else next.add(i);
		expandedRows = next;
	}

	// ── Map ───────────────────────────────────────────────────────────────────────
	onMount(async () => {
		if (!mapEl) return;
		const hasGeo = (log as Array<{ lat?: number; lng?: number }>).some(r => typeof r.lat === 'number');
		try {
			// Leaflet CSS
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
			document.head.appendChild(link);

			const L = (await import('leaflet')).default;
			const lMap = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([30, 0], hasGeo ? 2 : 2);

			L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
				subdomains: 'abcd',
				maxZoom: 19,
			}).addTo(lMap);

			// Cluster by ~0.5° grid
			const points = new Map<string, { lat: number; lng: number; total: number; blocked: number; cities: string[] }>();
			for (const r of log as Array<{ lat?: number; lng?: number; blocked: boolean; city?: string }>) {
				if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
				const key = `${(Math.round(r.lat * 2) / 2).toFixed(1)},${(Math.round(r.lng * 2) / 2).toFixed(1)}`;
				const p = points.get(key);
				if (p) {
					p.total++;
					if (r.blocked) p.blocked++;
					if (r.city && !p.cities.includes(r.city)) p.cities.push(r.city);
				} else {
					points.set(key, { lat: r.lat, lng: r.lng, total: 1, blocked: r.blocked ? 1 : 0, cities: r.city ? [r.city] : [] });
				}
			}

			for (const [, p] of points) {
				const ratio = p.blocked / p.total;
				const color = ratio > 0.5 ? '#ef4444' : ratio > 0 ? '#f59e0b' : '#22c55e';
				const radius = Math.min(5 + p.total * 3, 28);
				L.circleMarker([p.lat, p.lng], {
					radius,
					fillColor: color,
					color: '#000',
					weight: 1,
					opacity: 0.9,
					fillOpacity: 0.65,
				}).bindPopup(
					`<div style="font-family:monospace;font-size:12px;color:#111">` +
					`<b>${p.cities.join(', ') || 'Unknown'}</b><br>` +
					`${p.total} request${p.total !== 1 ? 's' : ''} · ${p.blocked} blocked</div>`
				).addTo(lMap);
			}

			leafletMap = lMap as typeof leafletMap;
		} catch (e) {
			console.warn('Map init failed:', e);
		}
	});

	function zoomUK() {
		leafletMap?.fitBounds([[49.9, -8.2], [60.9, 1.8]]);
	}

	function zoomWorld() {
		(leafletMap as unknown as { setView: (v: [number, number], z: number) => void })?.setView([30, 0], 2);
	}

	// ── RAG actions ───────────────────────────────────────────────────────────────
	async function runRagQuery() {
		if (!qInput.trim() || qRunning) return;
		qRunning = true;
		try {
			const res = await fetch('/api/debug', {
				method: 'POST', credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: qInput }),
			});
			qResults = await res.json();
		} finally { qRunning = false; }
	}

	async function clearTraces() {
		await fetch('/api/debug', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_traces' }) });
		location.reload();
	}

	async function clearLog() {
		if (!confirm('Clear all query history from Redis?')) return;
		await fetch('/api/debug', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_query_log' }) });
		location.reload();
	}

	function exportCsv() {
		const rows = [
			['ts', 'date', 'ip', 'country', 'city', 'status', 'category', 'model', 'latencyMs', 'tokensOut', 'query', 'response'].join(','),
			...(log as Array<{ ts: number; ip?: string; country?: string; city?: string; blocked: boolean; navigated: boolean; category?: string; modelUsed?: string; latencyMs?: number; tokensOut: number; q: string; output?: string }>).map(r =>
				[
					r.ts,
					new Date(r.ts).toISOString(),
					r.ip ?? '',
					r.country ?? '',
					r.city ?? '',
					statusLabel(r),
					r.category ?? '',
					r.modelUsed ?? '',
					r.latencyMs ?? '',
					r.tokensOut,
					JSON.stringify(r.q),
					JSON.stringify(r.output ?? ''),
				].join(',')
			),
		].join('\n');
		const blob = new Blob([rows], { type: 'text/csv' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `diary-requests-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
	}
</script>

<svelte:head><title>Analytics Dashboard</title></svelte:head>

<style>
	:global(body) { margin: 0; background: #09090b; }
	* { box-sizing: border-box; }

	.root {
		min-height: 100vh;
		background: #09090b;
		color: #fafafa;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
		font-size: 14px;
	}

	/* Header */
	.header {
		border-bottom: 1px solid #27272a;
		padding: 0 24px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #09090b;
		position: sticky;
		top: 0;
		z-index: 50;
	}
	.header-left { display: flex; align-items: center; gap: 12px; }
	.header-title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
	.live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,0.4); animation: pulse 2s infinite; }
	@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } }
	.live-label { font-size: 11px; color: #22c55e; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
	.header-actions { display: flex; gap: 8px; }
	.btn { padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid #3f3f46; background: #18181b; color: #a1a1aa; transition: color 0.1s, border-color 0.1s; }
	.btn:hover { color: #fafafa; border-color: #52525b; }
	.btn-danger { border-color: #7f1d1d; color: #fca5a5; }
	.btn-danger:hover { border-color: #ef4444; color: #ef4444; }

	/* Tab nav */
	.tab-nav { display: flex; gap: 0; border-bottom: 1px solid #27272a; padding: 0 24px; background: #09090b; }
	.tab-btn {
		padding: 12px 16px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		background: none;
		border: none;
		color: #71717a;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 0.1s, border-color 0.1s;
	}
	.tab-btn:hover { color: #d4d4d8; }
	.tab-btn.active { color: #fafafa; border-bottom-color: #fafafa; }
	.tab-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #27272a; font-size: 11px; color: #a1a1aa; margin-left: 6px; }
	.tab-badge.red { background: rgba(239,68,68,0.15); color: #ef4444; }

	/* Content */
	.content { padding: 24px; max-width: 1400px; margin: 0 auto; }

	/* Stat cards */
	.stat-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
	.stat-card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px 20px; }
	.stat-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: #71717a; margin-bottom: 8px; }
	.stat-value { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; color: #fafafa; line-height: 1; }
	.stat-sub { font-size: 11px; color: #52525b; margin-top: 4px; }

	/* Map + countries row */
	.map-row { display: grid; grid-template-columns: 1fr 280px; gap: 16px; margin-bottom: 24px; }
	.card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; overflow: hidden; }
	.card-header { padding: 14px 16px 0; display: flex; align-items: center; justify-content: space-between; }
	.card-title { font-size: 13px; font-weight: 600; color: #fafafa; }
	.card-sub { font-size: 11px; color: #71717a; }
	.map-container { height: 340px; }
	#map { height: 100%; width: 100%; }
	.map-actions { padding: 10px 14px; border-top: 1px solid #27272a; display: flex; gap: 8px; }

	/* Country list */
	.country-list { padding: 8px 0; max-height: 390px; overflow-y: auto; }
	.country-row { display: flex; align-items: center; gap: 8px; padding: 7px 16px; font-size: 12px; }
	.country-row:hover { background: #27272a; }
	.country-flag { font-size: 16px; flex-shrink: 0; width: 22px; }
	.country-name { flex: 1; color: #d4d4d8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.country-bar-wrap { width: 60px; height: 4px; background: #27272a; border-radius: 2px; }
	.country-bar { height: 100%; border-radius: 2px; background: #3b82f6; }
	.country-count { width: 28px; text-align: right; color: #71717a; font-variant-numeric: tabular-nums; }

	/* Hourly chart */
	.hourly-card { margin-bottom: 24px; }
	.hourly-chart { padding: 16px; display: flex; align-items: flex-end; gap: 3px; height: 80px; }
	.hourly-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; justify-content: flex-end; }
	.hourly-bar-wrap { width: 100%; display: flex; flex-direction: column; justify-content: flex-end; }
	.hourly-bar-blocked { border-radius: 1px 1px 0 0; background: #ef4444; opacity: 0.8; min-height: 1px; }
	.hourly-bar-safe { border-radius: 1px 1px 0 0; background: #3b82f6; opacity: 0.7; min-height: 1px; }
	.hourly-label { font-size: 9px; color: #52525b; font-variant-numeric: tabular-nums; }

	/* Model usage */
	.model-chips { padding: 12px 16px; display: flex; flex-wrap: wrap; gap: 8px; }
	.model-chip { padding: 4px 10px; border-radius: 4px; background: #27272a; border: 1px solid #3f3f46; font-size: 11px; font-family: monospace; color: #a1a1aa; }
	.model-chip-count { font-weight: 700; color: #fafafa; margin-left: 4px; }

	/* Request table */
	.filter-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
	.filter-tabs { display: flex; gap: 2px; background: #18181b; border: 1px solid #27272a; border-radius: 6px; padding: 3px; }
	.filter-tab { padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; background: none; border: none; color: #71717a; font-weight: 500; transition: background 0.1s, color 0.1s; }
	.filter-tab.active { background: #27272a; color: #fafafa; }
	.search-input { flex: 1; min-width: 180px; padding: 6px 10px; background: #18181b; border: 1px solid #27272a; border-radius: 6px; color: #fafafa; font-size: 12px; }
	.search-input::placeholder { color: #52525b; }
	.search-input:focus { outline: none; border-color: #52525b; }

	.req-list { display: flex; flex-direction: column; gap: 4px; }
	.req-row { background: #18181b; border: 1px solid #27272a; border-radius: 6px; overflow: hidden; cursor: pointer; transition: border-color 0.1s; }
	.req-row:hover { border-color: #3f3f46; }
	.req-row.expanded { border-color: #52525b; }
	.req-summary { display: grid; grid-template-columns: 80px 100px 110px 80px 90px 60px 1fr; align-items: center; gap: 12px; padding: 10px 14px; font-size: 12px; }
	.req-time { color: #71717a; font-variant-numeric: tabular-nums; font-family: monospace; font-size: 11px; }
	.req-ip { color: #a1a1aa; font-family: monospace; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.req-location { color: #71717a; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.badge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; font-family: monospace; }
	.req-model { font-size: 10px; font-family: monospace; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.req-latency { font-size: 11px; font-family: monospace; color: #71717a; font-variant-numeric: tabular-nums; }
	.req-query { color: #d4d4d8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.req-detail { padding: 0 14px 12px; border-top: 1px solid #27272a; }
	.req-detail-q { margin: 10px 0 6px; font-size: 12px; color: #a1a1aa; }
	.req-detail-output { background: #09090b; border: 1px solid #27272a; border-radius: 4px; padding: 10px; font-size: 11px; font-family: monospace; white-space: pre-wrap; color: #d4d4d8; max-height: 200px; overflow-y: auto; margin-top: 4px; }
	.req-detail-meta { display: flex; gap: 16px; margin-top: 8px; font-size: 11px; color: #52525b; }

	/* RAG inspector */
	.rag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
	.rag-full { grid-column: 1 / -1; }
	.status-table { width: 100%; border-collapse: collapse; font-size: 12px; }
	.status-table td { padding: 5px 0; }
	.status-table td:first-child { color: #71717a; width: 180px; }
	.rag-input-row { display: flex; gap: 8px; padding: 14px 16px; }
	.rag-input { flex: 1; padding: 7px 10px; background: #09090b; border: 1px solid #3f3f46; border-radius: 6px; color: #fafafa; font-size: 12px; font-family: monospace; }
	.rag-input:focus { outline: none; border-color: #71717a; }
	.btn-run { padding: 7px 16px; background: #fafafa; color: #09090b; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
	.btn-run:disabled { opacity: 0.4; cursor: not-allowed; }
	.rag-result { padding: 0 16px 14px; }
	.rag-result-meta { font-size: 11px; color: #71717a; margin-bottom: 10px; }
	.rag-chunk { border: 1px solid #27272a; border-radius: 4px; margin-bottom: 6px; overflow: hidden; }
	.rag-chunk-header { padding: 8px 12px; display: flex; gap: 8px; align-items: baseline; cursor: pointer; font-size: 12px; }
	.rag-chunk-header:hover { background: #27272a; }

	/* Section header */
	.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
	.section-title { font-size: 13px; font-weight: 600; color: #fafafa; }
	.empty-state { text-align: center; padding: 40px 20px; color: #52525b; font-size: 13px; }

	/* Bottom row */
	.bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }

	@media (max-width: 900px) {
		.stat-grid { grid-template-columns: repeat(3, 1fr); }
		.map-row { grid-template-columns: 1fr; }
		.rag-grid { grid-template-columns: 1fr; }
		.bottom-grid { grid-template-columns: 1fr; }
		.req-summary { grid-template-columns: 70px 90px 80px 1fr; }
		.req-summary > :nth-child(4), .req-summary > :nth-child(5), .req-summary > :nth-child(6) { display: none; }
	}
</style>

<div class="root">

<!-- ── Header ── -->
<header class="header">
	<div class="header-left">
		<span class="header-title">Analytics Dashboard</span>
		<div class="live-dot"></div>
		<span class="live-label">Live</span>
	</div>
	<div class="header-actions">
		<button class="btn" onclick={exportCsv}>Export CSV</button>
		<button class="btn btn-danger" onclick={clearTraces}>Clear Traces</button>
		<button class="btn btn-danger" onclick={clearLog}>Clear History</button>
	</div>
</header>

<!-- ── Tab nav ── -->
<nav class="tab-nav">
	<button class="tab-btn" class:active={tab === 'overview'} onclick={() => tab = 'overview'}>Overview</button>
	<button class="tab-btn" class:active={tab === 'requests'} onclick={() => tab = 'requests'}>
		Requests <span class="tab-badge">{total}</span>
	</button>
	<button class="tab-btn" class:active={tab === 'flagged'} onclick={() => tab = 'flagged'}>
		Flagged <span class="tab-badge red">{blocked}</span>
	</button>
	<button class="tab-btn" class:active={tab === 'rag'} onclick={() => tab = 'rag'}>RAG Inspector</button>
</nav>

<div class="content">

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- Overview Tab -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if tab === 'overview'}

<!-- Stat cards -->
<div class="stat-grid">
	<div class="stat-card">
		<div class="stat-label">Total Requests</div>
		<div class="stat-value">{total}</div>
		<div class="stat-sub">{safeCount} safe · {navCount} nav</div>
	</div>
	<div class="stat-card">
		<div class="stat-label">Block Rate</div>
		<div class="stat-value" style="color:{blockRate > 20 ? '#ef4444' : blockRate > 5 ? '#f59e0b' : '#22c55e'}">{blockRate}%</div>
		<div class="stat-sub">{blocked} blocked total</div>
	</div>
	<div class="stat-card">
		<div class="stat-label">Unique IPs</div>
		<div class="stat-value">{uniqueIps}</div>
		<div class="stat-sub">{countries.length} countr{countries.length === 1 ? 'y' : 'ies'}</div>
	</div>
	<div class="stat-card">
		<div class="stat-label">Avg Latency</div>
		<div class="stat-value" style="color:{avgLatency > 5000 ? '#ef4444' : avgLatency > 2000 ? '#f59e0b' : '#22c55e'}">{avgLatency > 0 ? `${avgLatency}ms` : '—'}</div>
		<div class="stat-sub">end-to-end</div>
	</div>
	<div class="stat-card">
		<div class="stat-label">Tokens Saved</div>
		<div class="stat-value" style="color:#3b82f6">{data.avgSavedTokens > 0 ? data.avgSavedTokens : '—'}</div>
		<div class="stat-sub">avg per request vs full CV</div>
	</div>
</div>

<!-- Map + Country breakdown -->
<div class="map-row">
	<div class="card">
		<div class="card-header">
			<span class="card-title">Request Origins</span>
			<span class="card-sub">{total} total · geo via ip-api.com</span>
		</div>
		<div class="map-container">
			<div id="map" bind:this={mapEl}></div>
		</div>
		<div class="map-actions">
			<button class="btn" onclick={zoomUK}>Zoom UK</button>
			<button class="btn" onclick={zoomWorld}>World View</button>
		</div>
	</div>

	<div class="card">
		<div class="card-header" style="padding-bottom:8px">
			<span class="card-title">Top Countries</span>
		</div>
		<div class="country-list">
			{#if countries.length === 0}
				<div class="empty-state" style="padding:20px">No geo data yet.<br>New requests will appear here.</div>
			{:else}
				{#each countries as c}
				<div class="country-row">
					<span class="country-flag">{flag(c.countryCode)}</span>
					<span class="country-name">{c.country}</span>
					<div class="country-bar-wrap">
						<div class="country-bar" style="width:{Math.round((c.count / total) * 100)}%"></div>
					</div>
					<span class="country-count">{c.count}</span>
				</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<!-- Hourly activity + Model usage -->
<div class="bottom-grid">
	<div class="card hourly-card">
		<div class="card-header" style="padding-bottom:0">
			<span class="card-title">24h Activity</span>
			<span class="card-sub">hourly — blue safe · red blocked</span>
		</div>
		<div class="hourly-chart">
			{#each hourly as b, i}
			<div class="hourly-col" title="{b.total} req ({b.blocked} blocked)">
				<div class="hourly-bar-wrap" style="height:{Math.round((b.total / hourlyMax) * 52)}px; width:100%">
					<div class="hourly-bar-blocked" style="height:{b.total > 0 ? Math.round((b.blocked / b.total) * 100) : 0}%"></div>
					<div class="hourly-bar-safe" style="height:{b.total > 0 ? Math.round(((b.total - b.blocked) / b.total) * 100) : 0}%"></div>
				</div>
				{#if i === 0 || i === 11 || i === 23}
				<div class="hourly-label">{i === 23 ? 'now' : i === 0 ? '24h' : '12h'}</div>
				{/if}
			</div>
			{/each}
		</div>
	</div>

	<div class="card">
		<div class="card-header" style="padding-bottom:4px">
			<span class="card-title">Model Usage</span>
		</div>
		{#if modelUsage.length === 0}
			<div class="empty-state" style="padding:20px">No model data yet.</div>
		{:else}
			<div class="model-chips">
				{#each modelUsage as [model, count]}
				<div class="model-chip">
					{model.length > 24 ? model.slice(0, 24) + '…' : model}
					<span class="model-chip-count">×{count}</span>
				</div>
				{/each}
			</div>
			<div style="padding: 0 16px 12px; font-size:11px; color:#52525b;">
				{data.chunkCount} RAG chunks · index built {new Date(data.builtAt).toLocaleString('en-GB')}
			</div>
		{/if}
	</div>
</div>

{/if}

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- Requests Tab -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if tab === 'requests'}

<div class="filter-bar">
	<div class="filter-tabs">
		<button class="filter-tab" class:active={reqFilter === 'all'} onclick={() => reqFilter = 'all'}>All ({total})</button>
		<button class="filter-tab" class:active={reqFilter === 'safe'} onclick={() => reqFilter = 'safe'}>Safe ({safeCount + navCount})</button>
		<button class="filter-tab" class:active={reqFilter === 'nav'} onclick={() => reqFilter = 'nav'}>Nav ({navCount})</button>
		<button class="filter-tab" class:active={reqFilter === 'malicious'} onclick={() => reqFilter = 'malicious'}>Blocked ({blocked})</button>
	</div>
	<input class="search-input" bind:value={reqSearch} placeholder="Search query, IP, country…" />
	<button class="btn" onclick={exportCsv}>Export</button>
</div>

{#if filteredRequests.length === 0}
	<div class="empty-state">No requests match this filter.</div>
{:else}
<div class="req-list">
	{#each filteredRequests as r, i}
	<div class="req-row" class:expanded={expandedRows.has(i)} role="button" tabindex="0" onclick={() => toggleRow(i)} onkeydown={e => (e.key === 'Enter' || e.key === ' ') && toggleRow(i)}>
		<div class="req-summary">
			<span class="req-time">{fmtTime(r.ts)}</span>
			<span class="req-ip">{r.ip ?? '—'}</span>
			<span class="req-location">{r.countryCode ? flag(r.countryCode) : ''} {r.city ?? r.country ?? '—'}</span>
			<span>
				<span class="badge" style="background:{statusColor(r)}22; color:{statusColor(r)}; border:1px solid {statusColor(r)}44">
					{statusLabel(r)}
				</span>
			</span>
			<span class="req-model">{r.modelUsed ? r.modelUsed.split('-').slice(0,3).join('-') : '—'}</span>
			<span class="req-latency">{r.latencyMs ? fmtMs(r.latencyMs) : '—'}</span>
			<span class="req-query">"{r.q}"</span>
		</div>
		{#if expandedRows.has(i)}
		<div class="req-detail" role="region" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="req-detail-q"><b>Query:</b> {r.q}</div>
			{#if r.output}
				<div class="req-detail-output">{r.output}{(r.output?.length ?? 0) >= 1000 ? '\n…[truncated]' : ''}</div>
			{:else}
				<div style="font-size:11px; color:#52525b; margin-top:6px">{r.blocked ? 'Blocked — no response.' : 'No output recorded.'}</div>
			{/if}
			<div class="req-detail-meta">
				<span>IP: {r.ip ?? '—'}</span>
				<span>Country: {r.country ?? '—'}</span>
				<span>City: {r.city ?? '—'}</span>
				<span>Category: {r.category ?? '—'}</span>
				<span>Model: {r.modelUsed ?? '—'}</span>
				<span>Tokens out: {r.tokensOut}</span>
				{#if r.isAdmin}<span style="color:#f59e0b">⚡ Admin</span>{/if}
			</div>
		</div>
		{/if}
	</div>
	{/each}
</div>
{/if}

{/if}

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- Flagged Tab -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if tab === 'flagged'}

<div class="section-header">
	<span class="section-title" style="color:#ef4444">{blocked} Blocked / Flagged Requests</span>
	<button class="btn" onclick={exportCsv}>Export CSV</button>
</div>

{#if flaggedRequests.length === 0}
	<div class="empty-state" style="padding:60px 20px">
		<div style="font-size:32px; margin-bottom:12px">🛡️</div>
		No flagged requests yet. The diary is safe.
	</div>
{:else}

<!-- Attack pattern summary -->
<div class="card" style="margin-bottom:16px">
	<div class="card-header" style="padding-bottom:12px">
		<span class="card-title">Attack Summary</span>
	</div>
	<div style="padding: 0 16px 14px; display:flex; gap:24px; flex-wrap:wrap; font-size:12px">
		<div>
			<div style="color:#71717a; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:.05em">Total Blocked</div>
			<div style="font-size:24px; font-weight:700; color:#ef4444">{blocked}</div>
		</div>
		<div>
			<div style="color:#71717a; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:.05em">Block Rate</div>
			<div style="font-size:24px; font-weight:700; color:{blockRate > 20 ? '#ef4444' : '#f59e0b'}">{blockRate}%</div>
		</div>
		<div>
			<div style="color:#71717a; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:.05em">Unique Attacker IPs</div>
			<div style="font-size:24px; font-weight:700; color:#fafafa">{new Set(flaggedRequests.map(r => r.ip).filter(Boolean)).size}</div>
		</div>
		<div>
			<div style="color:#71717a; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:.05em">Countries</div>
			<div style="font-size:24px; font-weight:700; color:#fafafa">
				{new Set(flaggedRequests.map(r => r.country).filter(Boolean)).size}
			</div>
		</div>
	</div>
</div>

<div class="req-list">
	{#each flaggedRequests as r, i}
	{@const rowKey = 10000 + i}
	<div class="req-row" class:expanded={expandedRows.has(rowKey)} role="button" tabindex="0" onclick={() => toggleRow(rowKey)} onkeydown={e => (e.key === 'Enter' || e.key === ' ') && toggleRow(rowKey)} style="border-color:#3f1212">
		<div class="req-summary">
			<span class="req-time">{fmtDate(r.ts)}</span>
			<span class="req-ip">{r.ip ?? '—'}</span>
			<span class="req-location">{r.countryCode ? flag(r.countryCode) : ''} {r.city ?? r.country ?? '—'}</span>
			<span>
				<span class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef444444">BLOCKED</span>
			</span>
			<span class="req-model">{r.modelUsed ?? '—'}</span>
			<span class="req-latency">{r.latencyMs ? fmtMs(r.latencyMs) : '—'}</span>
			<span class="req-query" style="color:#fca5a5">"{r.q}"</span>
		</div>
		{#if expandedRows.has(rowKey)}
		<div class="req-detail" role="region" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="req-detail-q"><b>Query:</b> {r.q}</div>
			<div style="font-size:11px; color:#52525b; margin-top:6px">Blocked — no response generated.</div>
			<div class="req-detail-meta">
				<span>IP: {r.ip ?? '—'}</span>
				<span>Country: {r.country ?? '—'}</span>
				<span>City: {r.city ?? '—'}</span>
				<span>Category: {r.category ?? '—'}</span>
				{#if r.isAdmin}<span style="color:#f59e0b">⚡ Admin</span>{/if}
			</div>
		</div>
		{/if}
	</div>
	{/each}
</div>
{/if}

{/if}

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- RAG Inspector Tab -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if tab === 'rag'}

<div class="rag-grid">

<!-- System Status -->
<div class="card">
	<div class="card-header" style="padding-bottom:12px"><span class="card-title">System Status</span></div>
	<div style="padding: 0 16px 14px">
		<table class="status-table">
			<tbody>
				<tr><td>Chunks indexed</td><td style="color:#fafafa; font-weight:600">{data.chunkCount}</td></tr>
				<tr><td>Full CV tokens (est.)</td><td style="color:#fafafa">{data.fullCvTokens}</td></tr>
				<tr><td>Index built</td><td style="color:#fafafa">{new Date(data.builtAt).toLocaleString('en-GB')}</td></tr>
				<tr><td>In-memory traces</td><td style="color:#fafafa">{data.traceCount}</td></tr>
				<tr><td>Avg tokens saved</td><td style="color:#22c55e; font-weight:600">{data.avgSavedTokens}</td></tr>
			</tbody>
		</table>
	</div>
</div>

<!-- Query Inspector -->
<div class="card">
	<div class="card-header" style="padding-bottom:4px"><span class="card-title">Query Inspector</span></div>
	<div class="rag-input-row">
		<input
			class="rag-input"
			bind:value={qInput}
			onkeydown={e => e.key === 'Enter' && runRagQuery()}
			placeholder="Test a query against the TF-IDF index…"
		/>
		<button class="btn-run" onclick={runRagQuery} disabled={qRunning}>{qRunning ? '…' : 'Run'}</button>
	</div>
	{#if qResults}
	<div class="rag-result">
		<div class="rag-result-meta">
			{qResults.results.length} chunks · {qResults.retrievedTokens} tokens
			(saved {qResults.fullCvTokens - qResults.retrievedTokens} vs full CV)
		</div>
		{#each qResults.results as r, i}
		<details class="rag-chunk">
			<summary class="rag-chunk-header" style="list-style:none">
				<span style="color:#71717a">#{i+1}</span>
				<span style="color:#d4d4d8">[{r.heading}]</span>
				<span style="color:#52525b">score {r.score.toFixed(4)} · {r.tokenCount} tok</span>
			</summary>
			<div class="rag-chunk-pre">{r.text}</div>
		</details>
		{/each}
	</div>
	{/if}
</div>

<!-- Recent Traces (full width) -->
<div class="card rag-full">
	<div class="card-header" style="padding-bottom:4px">
		<span class="card-title">Recent Latency Traces</span>
		<button class="btn btn-danger" onclick={clearTraces}>Clear</button>
	</div>
	{#if data.recentTraces.length === 0}
		<div class="empty-state">No traces yet. Send a message to record one.</div>
	{:else}
	<div style="padding: 0 16px 14px; display:flex; flex-direction:column; gap:4px">
		{#each data.recentTraces as t}
		<details>
			<summary style="cursor:pointer; font-size:12px; color:#a1a1aa; padding:6px 0; display:flex; gap:8px; align-items:baseline; list-style:none">
				<span style="color:#52525b; font-family:monospace; font-size:11px">{fmtTime(t.timestamp)}</span>
				{#if t.blocked}
					<span class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef444444">BLOCKED: {t.blockReason}</span>
				{:else if t.navigated}
					<span class="badge" style="background:#3b82f622; color:#3b82f6; border:1px solid #3b82f644">NAV</span>
				{/if}
				<span style="color:#d4d4d8">"{t.query.slice(0, 60)}{t.query.length > 60 ? '…' : ''}"</span>
				<span style="margin-left:auto; color:#52525b; font-family:monospace; font-size:11px">{t.latency.total}ms</span>
			</summary>
			<div style="font-size:11px; color:#71717a; padding: 4px 0 8px; margin-left:8px">
				<span style="color:#52525b">Latency:</span>
				sanitize {fmtMs(t.latency.sanitize)} ·
				inject {fmtMs(t.latency.injectionCheck)} ·
				retrieve {fmtMs(t.latency.retrieve)} ·
				assembly {fmtMs(t.latency.promptAssembly)} ·
				groq {fmtMs(t.latency.groq)} ·
				stream {fmtMs(t.latency.stream)}
				<br>
				<span style="color:#52525b">Tokens:</span>
				system {t.tokens.systemPromptTokens} ·
				retrieved {t.tokens.retrievedChunkTokens} ·
				user {t.tokens.userMessageTokens} ·
				out {t.tokens.outputTokens} ·
				<span style="color:#22c55e">saved {t.tokens.savedTokens}</span>
				<br>
				<span style="color:#52525b">Chunks:</span>
				{t.retrievedChunks.length === 0 ? 'none' : t.retrievedChunks.map((c: { heading: string; score: number }) => `${c.heading} (${c.score.toFixed(3)})`).join(', ')}
			</div>
		</details>
		{/each}
	</div>
	{/if}
</div>

<!-- Chunk Browser (full width) -->
<div class="card rag-full">
	<div class="card-header" style="padding-bottom:8px"><span class="card-title">Chunk Browser ({data.chunkCount} chunks)</span></div>
	<div style="padding: 0 16px 14px; display:flex; flex-direction:column; gap:4px">
		{#each data.chunks as c}
		<details>
			<summary style="cursor:pointer; font-size:12px; color:#a1a1aa; padding:5px 0; display:flex; gap:8px; align-items:baseline; list-style:none">
				<span style="color:#3b82f6">[{c.heading}]</span>
				<span style="color:#52525b">chunk {c.chunkIndex} · {c.charCount} chars · {c.tokenCount} tok</span>
				{#if c.tags.length}<span style="color:#71717a">{c.tags.join(', ')}</span>{/if}
			</summary>
			<div style="font-size:11px; font-family:monospace; white-space:pre-wrap; color:#d4d4d8; background:#09090b; border:1px solid #27272a; border-radius:4px; padding:8px; margin-top:4px">
				{c.textPreview}{c.charCount > 150 ? '…' : ''}
			</div>
		</details>
		{/each}
	</div>
</div>

</div>
{/if}

</div><!-- /content -->
</div><!-- /root -->
