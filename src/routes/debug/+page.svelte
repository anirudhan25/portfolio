<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ── Tab (class-based hide/show so the map div never unmounts) ────────────────
	let tab = $state<'overview' | 'requests' | 'flagged' | 'rag'>('overview');

	// ── Requests filter ───────────────────────────────────────────────────────────
	let reqFilter = $state<'all' | 'safe' | 'nav' | 'malicious'>('all');
	let reqSearch = $state('');
	let expandedRows = $state(new Set<number>());

	// ── RAG inspector ─────────────────────────────────────────────────────────────
	let qInput = $state('');
	let qResults = $state<null | { results: { heading: string; score: number; tokenCount: number; text: string }[]; retrievedTokens: number; fullCvTokens: number }>(null);
	let qRunning = $state(false);

	// ── Map ───────────────────────────────────────────────────────────────────────
	let mapEl: HTMLElement;
	let leafletMap: import('leaflet').Map | null = null;

	// ── Derived stats ─────────────────────────────────────────────────────────────
	const log = $derived(data.queryLog as Array<{
		ts: number; q: string; output?: string; blocked: boolean; navigated: boolean;
		tokensOut: number; ip?: string; country?: string; countryCode?: string;
		city?: string; lat?: number; lng?: number; category?: string;
		modelUsed?: string; isAdmin?: boolean; latencyMs?: number;
	}>);

	const total     = $derived(log.length);
	const blocked   = $derived(log.filter(r => r.blocked).length);
	const navCount  = $derived(log.filter(r => r.navigated && !r.blocked).length);
	const safeCount = $derived(log.filter(r => !r.blocked && !r.navigated).length);
	const blockRate = $derived(total ? Math.round((blocked / total) * 100) : 0);
	const uniqueIps = $derived(new Set(log.map(r => r.ip).filter(Boolean)).size);

	const avgLatency = $derived((() => {
		const vals = log.map(r => r.latencyMs).filter((n): n is number => typeof n === 'number');
		return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
	})());

	// Hourly buckets (last 24h)
	const hourly = $derived((() => {
		const now = Date.now();
		const buckets = Array.from({ length: 24 }, () => ({ total: 0, blocked: 0 }));
		for (const r of log) {
			const h = Math.floor((now - r.ts) / 3_600_000);
			if (h < 24) { buckets[23 - h].total++; if (r.blocked) buckets[23 - h].blocked++; }
		}
		return buckets;
	})());
	const hourlyMax = $derived(Math.max(...hourly.map(b => b.total), 1));

	// Country breakdown
	const countries = $derived((() => {
		const m = new Map<string, { country: string; countryCode: string; count: number; blocked: number }>();
		for (const r of log) {
			if (!r.country) continue;
			const ex = m.get(r.country);
			if (ex) { ex.count++; if (r.blocked) ex.blocked++; }
			else m.set(r.country, { country: r.country, countryCode: r.countryCode ?? '??', count: 1, blocked: r.blocked ? 1 : 0 });
		}
		return [...m.values()].sort((a, b) => b.count - a.count);
	})());

	// Model usage
	const modelUsage = $derived((() => {
		const m = new Map<string, number>();
		for (const r of log) if (r.modelUsed) m.set(r.modelUsed, (m.get(r.modelUsed) ?? 0) + 1);
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	})());

	// Filtered request lists
	const filteredRequests = $derived((() => {
		let items = log;
		if (reqFilter === 'safe')     items = items.filter(r => !r.blocked && !r.navigated);
		else if (reqFilter === 'nav') items = items.filter(r => r.navigated);
		else if (reqFilter === 'malicious') items = items.filter(r => r.blocked);
		if (reqSearch.trim()) {
			const s = reqSearch.toLowerCase();
			items = items.filter(r => r.q.toLowerCase().includes(s) || (r.ip ?? '').includes(s) || (r.country ?? '').toLowerCase().includes(s));
		}
		return items;
	})());

	const flaggedRequests = $derived(log.filter(r => r.blocked));

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
	function statusLabel(r: { blocked: boolean; navigated: boolean }) {
		if (r.blocked) return 'BLOCKED';
		if (r.navigated) return 'NAV';
		return 'OK';
	}
	function latencyColor(ms: number) {
		if (ms <= 0) return '#52525b';
		if (ms > 5000) return '#ef4444';
		if (ms > 2000) return '#f59e0b';
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
		try {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
			document.head.appendChild(link);

			const L = (await import('leaflet')).default;
			const lMap = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([30, 0], 2);

			L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
				subdomains: 'abcd', maxZoom: 19,
			}).addTo(lMap);

			// Aggregate nearby points into clusters
			const pts = new Map<string, { lat: number; lng: number; total: number; blocked: number; cities: string[] }>();
			for (const r of log) {
				if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
				const key = `${(Math.round(r.lat * 2) / 2).toFixed(1)},${(Math.round(r.lng * 2) / 2).toFixed(1)}`;
				const p = pts.get(key);
				if (p) { p.total++; if (r.blocked) p.blocked++; if (r.city && !p.cities.includes(r.city)) p.cities.push(r.city); }
				else pts.set(key, { lat: r.lat, lng: r.lng, total: 1, blocked: r.blocked ? 1 : 0, cities: r.city ? [r.city] : [] });
			}

			for (const [, p] of pts) {
				const ratio = p.blocked / p.total;
				const color = ratio > 0.5 ? '#ef4444' : ratio > 0 ? '#f59e0b' : '#22c55e';
				L.circleMarker([p.lat, p.lng], {
					radius: Math.min(5 + p.total * 3, 28),
					fillColor: color, color: '#000', weight: 1, opacity: 0.9, fillOpacity: 0.65,
				}).bindPopup(
					`<b style="font-family:monospace;font-size:12px">${p.cities.join(', ') || 'Unknown'}</b>` +
					`<br><span style="font-family:monospace;font-size:11px">${p.total} req · ${p.blocked} blocked</span>`
				).addTo(lMap);
			}

			leafletMap = lMap;
			// RAF ensures the fixed container has settled its dimensions
			requestAnimationFrame(() => lMap.invalidateSize());
		} catch (e) {
			console.warn('Map init failed:', e);
		}
	});

	// Invalidate map when switching back to overview (map div was hidden, Leaflet cached stale dims)
	$effect(() => {
		if (tab === 'overview' && leafletMap) {
			requestAnimationFrame(() => leafletMap!.invalidateSize());
		}
	});

	function zoomUK()    { leafletMap?.fitBounds([[49.9, -8.2], [60.9, 1.8]]); }
	function zoomWorld() { leafletMap?.setView([30, 0], 2); }

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
		await fetch('/api/debug', { method: 'POST', credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_traces' }) });
		location.reload();
	}
	async function clearLog() {
		if (!confirm('Clear all query history from Redis?')) return;
		await fetch('/api/debug', { method: 'POST', credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_query_log' }) });
		location.reload();
	}

	function exportCsv() {
		const rows = [
			['ts','date','ip','country','city','status','category','model','latencyMs','tokensOut','query','response'].join(','),
			...log.map(r => [
				r.ts, new Date(r.ts).toISOString(), r.ip ?? '', r.country ?? '', r.city ?? '',
				statusLabel(r), r.category ?? '', r.modelUsed ?? '', r.latencyMs ?? '', r.tokensOut,
				JSON.stringify(r.q), JSON.stringify(r.output ?? ''),
			].join(',')),
		].join('\n');
		const a = Object.assign(document.createElement('a'), {
			href: URL.createObjectURL(new Blob([rows], { type: 'text/csv' })),
			download: `diary-requests-${new Date().toISOString().slice(0,10)}.csv`,
		});
		a.click();
	}
</script>

<svelte:head><title>Analytics Dashboard</title></svelte:head>

<style>
	/* ── Reset: escape the 580px layout constraint ─────────────────────────────── */
	.root {
		position: fixed;
		inset: 0;
		overflow-y: auto;
		overflow-x: hidden;
		z-index: 200;
		background: #09090b;
		color: #fafafa;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
		font-size: 14px;
		line-height: 1.5;
	}

	/* ── Tab visibility (keep map div always mounted) ──────────────────────────── */
	.tab-panel { display: none; }
	.tab-panel.active { display: block; }

	/* ── Header ─────────────────────────────────────────────────────────────────── */
	.header {
		position: sticky;
		top: 0;
		z-index: 100;
		background: #09090b;
		border-bottom: 1px solid #27272a;
		padding: 0 24px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-width: 0;
	}
	.header-left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
	.header-title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
	.live-wrap { display: flex; align-items: center; gap: 5px; }
	.live-dot {
		width: 7px; height: 7px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
		animation: pulse 2s infinite;
	}
	@keyframes pulse {
		0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.4); }
		50%      { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
	}
	.live-label { font-size: 11px; color: #22c55e; font-weight: 500; letter-spacing: .05em; text-transform: uppercase; }
	.header-actions { display: flex; gap: 6px; flex-shrink: 0; }
	.btn {
		padding: 5px 11px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;
		border: 1px solid #3f3f46; background: #18181b; color: #a1a1aa;
		transition: color .1s, border-color .1s; white-space: nowrap;
	}
	.btn:hover { color: #fafafa; border-color: #52525b; }
	.btn-danger { border-color: #7f1d1d; color: #fca5a5; }
	.btn-danger:hover { border-color: #ef4444; color: #fafafa; background: #450a0a; }

	/* ── Tab nav ─────────────────────────────────────────────────────────────────── */
	.tab-nav {
		display: flex;
		border-bottom: 1px solid #27272a;
		padding: 0 24px;
		background: #09090b;
		position: sticky;
		top: 56px;
		z-index: 90;
		gap: 0;
	}
	.tab-btn {
		padding: 12px 14px; font-size: 13px; font-weight: 500; cursor: pointer;
		background: none; border: none; color: #71717a;
		border-bottom: 2px solid transparent; margin-bottom: -1px;
		transition: color .1s, border-color .1s; white-space: nowrap;
	}
	.tab-btn:hover { color: #d4d4d8; }
	.tab-btn.active { color: #fafafa; border-bottom-color: #fafafa; }
	.tab-badge {
		display: inline-flex; align-items: center; justify-content: center;
		min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
		background: #27272a; font-size: 11px; color: #a1a1aa; margin-left: 5px;
	}
	.tab-badge.red { background: rgba(239,68,68,.15); color: #ef4444; }

	/* ── Content wrapper ─────────────────────────────────────────────────────────── */
	.content { padding: 20px 24px; max-width: 1440px; margin: 0 auto; }

	/* ── Stat cards ─────────────────────────────────────────────────────────────── */
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 12px;
		margin-bottom: 20px;
	}
	.stat-card {
		background: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 16px 18px;
		min-width: 0;
	}
	.stat-label {
		font-size: 11px; font-weight: 500; text-transform: uppercase;
		letter-spacing: .06em; color: #71717a; margin-bottom: 8px;
	}
	.stat-value { font-size: 30px; font-weight: 700; letter-spacing: -.03em; line-height: 1; }
	.stat-sub { font-size: 11px; color: #52525b; margin-top: 5px; }

	/* ── Map + countries ─────────────────────────────────────────────────────────── */
	.map-row { display: grid; grid-template-columns: 1fr 260px; gap: 12px; margin-bottom: 20px; }
	.card { background: #18181b; border: 1px solid #27272a; border-radius: 10px; overflow: hidden; }
	.card-header {
		padding: 14px 16px 12px; display: flex; align-items: baseline;
		justify-content: space-between; gap: 8px;
	}
	.card-title { font-size: 13px; font-weight: 600; white-space: nowrap; }
	.card-sub { font-size: 11px; color: #71717a; text-align: right; }
	.map-wrap { height: 320px; }
	#map { width: 100%; height: 100%; }
	.map-actions { padding: 10px 14px; border-top: 1px solid #27272a; display: flex; gap: 6px; }
	.country-list { overflow-y: auto; max-height: 370px; padding: 4px 0; }
	.country-row {
		display: grid; grid-template-columns: 24px 1fr 56px 32px;
		align-items: center; gap: 6px; padding: 6px 14px; font-size: 12px;
	}
	.country-row:hover { background: #27272a; }
	.country-flag { font-size: 15px; }
	.country-name { color: #d4d4d8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.country-bar-wrap { height: 4px; background: #27272a; border-radius: 2px; overflow: hidden; }
	.country-bar { height: 100%; border-radius: 2px; background: #3b82f6; }
	.country-count { text-align: right; color: #71717a; font-variant-numeric: tabular-nums; font-size: 11px; }

	/* ── Bottom row: 24h chart + model usage ─────────────────────────────────────── */
	.bottom-row { display: grid; grid-template-columns: 1fr 320px; gap: 12px; margin-bottom: 20px; }
	.hourly-chart { padding: 14px 16px; display: flex; align-items: flex-end; gap: 2px; height: 72px; }
	.hourly-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 1px; min-width: 0; }
	.hourly-bar {
		width: 100%; border-radius: 2px 2px 0 0; min-height: 1px;
		background: linear-gradient(to top, #3b82f6 var(--safe-pct), #ef4444 var(--safe-pct));
	}
	.hourly-tick { font-size: 9px; color: #3f3f46; font-variant-numeric: tabular-nums; }
	.model-chips { padding: 12px 16px; display: flex; flex-wrap: wrap; gap: 6px; }
	.model-chip {
		padding: 4px 10px; border-radius: 5px; background: #27272a; border: 1px solid #3f3f46;
		font-size: 11px; font-family: monospace; color: #a1a1aa;
	}
	.model-chip b { color: #fafafa; }

	/* ── Request list ─────────────────────────────────────────────────────────────── */
	.filter-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
	.filter-tabs {
		display: flex; gap: 2px; background: #18181b; border: 1px solid #27272a;
		border-radius: 7px; padding: 3px;
	}
	.filter-tab {
		padding: 4px 11px; border-radius: 5px; font-size: 12px; cursor: pointer;
		background: none; border: none; color: #71717a; font-weight: 500; transition: background .1s, color .1s;
	}
	.filter-tab.active { background: #27272a; color: #fafafa; }
	.search-input {
		flex: 1; min-width: 160px; padding: 6px 10px; background: #18181b;
		border: 1px solid #27272a; border-radius: 6px; color: #fafafa; font-size: 12px;
	}
	.search-input::placeholder { color: #52525b; }
	.search-input:focus { outline: none; border-color: #52525b; }

	.req-list { display: flex; flex-direction: column; gap: 3px; }
	.req-row {
		background: #18181b; border: 1px solid #27272a; border-radius: 7px;
		overflow: hidden; cursor: pointer; transition: border-color .1s;
	}
	.req-row:hover { border-color: #3f3f46; }
	.req-row.open { border-color: #52525b; }
	.req-summary {
		display: grid;
		grid-template-columns: 75px 110px 120px 84px 160px 68px 1fr;
		align-items: center; gap: 10px; padding: 9px 14px; font-size: 12px; min-width: 0;
	}
	.col-time   { color: #52525b; font-family: monospace; font-size: 11px; white-space: nowrap; }
	.col-ip     { color: #a1a1aa; font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.col-loc    { color: #71717a; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.col-model  { color: #71717a; font-size: 10px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.col-lat    { color: #71717a; font-size: 11px; font-family: monospace; font-variant-numeric: tabular-nums; }
	.col-q      { color: #d4d4d8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.badge {
		display: inline-block; padding: 2px 7px; border-radius: 4px;
		font-size: 10px; font-weight: 700; letter-spacing: .03em; font-family: monospace; white-space: nowrap;
	}
	.req-detail { border-top: 1px solid #27272a; padding: 10px 14px 12px; }
	.req-detail-output {
		background: #09090b; border: 1px solid #27272a; border-radius: 5px;
		padding: 10px; font-size: 11px; font-family: monospace; white-space: pre-wrap;
		color: #d4d4d8; max-height: 180px; overflow-y: auto; margin: 6px 0;
	}
	.req-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11px; color: #52525b; margin-top: 6px; }

	/* ── Flagged attack summary ───────────────────────────────────────────────────── */
	.attack-summary {
		display: flex; gap: 0; margin-bottom: 14px;
		background: #18181b; border: 1px solid #3f1212; border-radius: 10px; overflow: hidden;
	}
	.attack-stat { padding: 16px 24px; border-right: 1px solid #27272a; }
	.attack-stat:last-child { border-right: none; }
	.attack-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #71717a; margin-bottom: 6px; }
	.attack-value { font-size: 26px; font-weight: 700; letter-spacing: -.03em; }

	/* ── RAG inspector ─────────────────────────────────────────────────────────────── */
	.rag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.rag-full { grid-column: 1 / -1; }
	.status-table { width: 100%; border-collapse: collapse; font-size: 12px; }
	.status-table td { padding: 5px 0; vertical-align: baseline; }
	.status-table td:first-child { color: #71717a; padding-right: 16px; white-space: nowrap; }
	.rag-input-row { display: flex; gap: 8px; padding: 12px 16px; }
	.rag-input {
		flex: 1; padding: 7px 10px; background: #09090b; border: 1px solid #3f3f46;
		border-radius: 6px; color: #fafafa; font-size: 12px; font-family: monospace;
	}
	.rag-input:focus { outline: none; border-color: #71717a; }
	.btn-run {
		padding: 7px 16px; background: #fafafa; color: #09090b; border: none;
		border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
	}
	.btn-run:disabled { opacity: .4; cursor: not-allowed; }
	.rag-result-meta { font-size: 11px; color: #71717a; padding: 0 16px 10px; }
	.empty-state { text-align: center; padding: 40px 20px; color: #52525b; font-size: 13px; }

	@media (max-width: 1024px) {
		.stat-grid  { grid-template-columns: repeat(3, 1fr); }
		.map-row    { grid-template-columns: 1fr; }
		.bottom-row { grid-template-columns: 1fr; }
		.rag-grid   { grid-template-columns: 1fr; }
		.req-summary {
			grid-template-columns: 70px 100px 80px 1fr;
		}
		.req-summary .col-model,
		.req-summary .col-lat { display: none; }
	}
	@media (max-width: 640px) {
		.content { padding: 12px; }
		.header  { padding: 0 12px; }
		.tab-nav { padding: 0 12px; }
		.stat-grid { grid-template-columns: repeat(2, 1fr); }
		.req-summary { grid-template-columns: 70px 80px 1fr; }
		.req-summary .col-ip { display: none; }
	}
</style>

<div class="root">

<!-- ── Header ── -->
<header class="header">
	<div class="header-left">
		<span class="header-title">Analytics Dashboard</span>
		<div class="live-wrap">
			<div class="live-dot"></div>
			<span class="live-label">Live</span>
		</div>
	</div>
	<div class="header-actions">
		<button class="btn" onclick={exportCsv}>Export CSV</button>
		<button class="btn btn-danger" onclick={clearTraces}>Clear Traces</button>
		<button class="btn btn-danger" onclick={clearLog}>Clear History</button>
	</div>
</header>

<!-- ── Tab nav ── -->
<nav class="tab-nav">
	<button class="tab-btn" class:active={tab === 'overview'}  onclick={() => tab = 'overview'}>Overview</button>
	<button class="tab-btn" class:active={tab === 'requests'}  onclick={() => tab = 'requests'}>
		Requests <span class="tab-badge">{total}</span>
	</button>
	<button class="tab-btn" class:active={tab === 'flagged'}   onclick={() => tab = 'flagged'}>
		Flagged <span class="tab-badge red">{blocked}</span>
	</button>
	<button class="tab-btn" class:active={tab === 'rag'}       onclick={() => tab = 'rag'}>RAG Inspector</button>
</nav>

<div class="content">

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- OVERVIEW — always mounted so the map div never unmounts                   -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="tab-panel" class:active={tab === 'overview'}>

	<!-- Stat cards -->
	<div class="stat-grid">
		<div class="stat-card">
			<div class="stat-label">Total Requests</div>
			<div class="stat-value" style="color:#fafafa">{total}</div>
			<div class="stat-sub">{safeCount} safe · {navCount} nav</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Block Rate</div>
			<div class="stat-value" style="color:{blockRate > 20 ? '#ef4444' : blockRate > 5 ? '#f59e0b' : '#22c55e'}">{blockRate}%</div>
			<div class="stat-sub">{blocked} blocked total</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Unique IPs</div>
			<div class="stat-value" style="color:#fafafa">{uniqueIps}</div>
			<div class="stat-sub">{countries.length} {countries.length === 1 ? 'country' : 'countries'}</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Avg Latency</div>
			<div class="stat-value" style="color:{latencyColor(avgLatency)}">{avgLatency > 0 ? `${avgLatency}ms` : '—'}</div>
			<div class="stat-sub">end-to-end</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Tokens Saved</div>
			<div class="stat-value" style="color:{data.avgSavedTokens > 0 ? '#3b82f6' : '#52525b'}">{data.avgSavedTokens > 0 ? data.avgSavedTokens : '—'}</div>
			<div class="stat-sub">avg vs full CV</div>
		</div>
	</div>

	<!-- Map + countries — map div is ALWAYS in DOM (class hide/show, never {#if}) -->
	<div class="map-row">
		<div class="card">
			<div class="card-header">
				<span class="card-title">Request Origins</span>
				<span class="card-sub">{total} total · ip-api.com · 🟢 safe 🟡 mixed 🔴 blocked</span>
			</div>
			<div class="map-wrap">
				<div id="map" bind:this={mapEl}></div>
			</div>
			<div class="map-actions">
				<button class="btn" onclick={zoomUK}>🇬🇧 Zoom UK</button>
				<button class="btn" onclick={zoomWorld}>🌍 World</button>
			</div>
		</div>

		<div class="card">
			<div class="card-header">
				<span class="card-title">Top Countries</span>
				<span class="card-sub">{countries.length} total</span>
			</div>
			{#if countries.length === 0}
				<div class="empty-state" style="padding:24px 16px; font-size:12px">No geo data yet.<br>Future requests will appear here.</div>
			{:else}
				<div class="country-list">
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
				</div>
			{/if}
		</div>
	</div>

	<!-- 24h chart + model usage -->
	<div class="bottom-row">
		<div class="card">
			<div class="card-header">
				<span class="card-title">24h Activity</span>
				<span class="card-sub">hourly · 🔵 safe · 🔴 blocked</span>
			</div>
			<div class="hourly-chart">
				{#each hourly as b, i}
				{@const safePct = b.total > 0 ? Math.round(((b.total - b.blocked) / b.total) * 100) : 100}
				{@const barH = Math.max(Math.round((b.total / hourlyMax) * 52), b.total > 0 ? 2 : 0)}
				<div class="hourly-col" title="{b.total} req · {b.blocked} blocked">
					<div class="hourly-bar" style="height:{barH}px; --safe-pct:{safePct}%"></div>
					{#if i === 0}<span class="hourly-tick">24h</span>
					{:else if i === 11}<span class="hourly-tick">12h</span>
					{:else if i === 23}<span class="hourly-tick">now</span>
					{:else}<span class="hourly-tick" style="opacity:0">·</span>
					{/if}
				</div>
				{/each}
			</div>
		</div>

		<div class="card">
			<div class="card-header"><span class="card-title">Model Usage</span></div>
			{#if modelUsage.length === 0}
				<div class="empty-state" style="padding:20px; font-size:12px">No model data yet.</div>
			{:else}
				<div class="model-chips">
					{#each modelUsage as [model, count]}
					<div class="model-chip">{model.length > 22 ? model.slice(0,22) + '…' : model} <b>×{count}</b></div>
					{/each}
				</div>
				<div style="padding:0 16px 12px; font-size:11px; color:#52525b">
					{data.chunkCount} RAG chunks · built {new Date(data.builtAt).toLocaleString('en-GB')}
				</div>
			{/if}
		</div>
	</div>

</div><!-- /overview panel -->

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- REQUESTS                                                                   -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="tab-panel" class:active={tab === 'requests'}>

	<div class="filter-bar">
		<div class="filter-tabs">
			<button class="filter-tab" class:active={reqFilter === 'all'}       onclick={() => reqFilter = 'all'}>All ({total})</button>
			<button class="filter-tab" class:active={reqFilter === 'safe'}      onclick={() => reqFilter = 'safe'}>Safe ({safeCount + navCount})</button>
			<button class="filter-tab" class:active={reqFilter === 'nav'}       onclick={() => reqFilter = 'nav'}>Nav ({navCount})</button>
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
		<div class="req-row" class:open={expandedRows.has(i)}
			role="button" tabindex="0"
			onclick={() => toggleRow(i)}
			onkeydown={e => (e.key === 'Enter' || e.key === ' ') && toggleRow(i)}>
			<div class="req-summary">
				<span class="col-time">{fmtTime(r.ts)}</span>
				<span class="col-ip">{r.ip ?? '—'}</span>
				<span class="col-loc">{r.countryCode ? flag(r.countryCode) : ''} {r.city ?? r.country ?? '—'}</span>
				<span>
					<span class="badge" style="background:{statusColor(r)}1a; color:{statusColor(r)}; border:1px solid {statusColor(r)}44">
						{statusLabel(r)}
					</span>
				</span>
				<span class="col-model">{r.modelUsed ?? '—'}</span>
				<span class="col-lat">{r.latencyMs ? fmtMs(r.latencyMs) : '—'}</span>
				<span class="col-q">"{r.q}"</span>
			</div>
			{#if expandedRows.has(i)}
			<div class="req-detail" role="region"
				onclick={e => e.stopPropagation()}
				onkeydown={e => e.stopPropagation()}>
				<div style="font-size:12px; color:#a1a1aa; margin-bottom:4px"><b>Query:</b> {r.q}</div>
				{#if r.output}
					<div class="req-detail-output">{r.output}{(r.output?.length ?? 0) >= 1000 ? '\n…[truncated]' : ''}</div>
				{:else}
					<div style="font-size:11px; color:#52525b; margin:6px 0">{r.blocked ? 'Blocked — no response generated.' : 'No output recorded.'}</div>
				{/if}
				<div class="req-meta">
					<span>IP: <b style="color:#a1a1aa">{r.ip ?? '—'}</b></span>
					<span>Country: <b style="color:#a1a1aa">{r.country ?? '—'}</b></span>
					<span>City: <b style="color:#a1a1aa">{r.city ?? '—'}</b></span>
					<span>Category: <b style="color:#a1a1aa">{r.category ?? '—'}</b></span>
					<span>Model: <b style="color:#a1a1aa">{r.modelUsed ?? '—'}</b></span>
					<span>Tokens: <b style="color:#a1a1aa">{r.tokensOut}</b></span>
					<span>Time: <b style="color:#a1a1aa">{fmtDate(r.ts)}</b></span>
					{#if r.isAdmin}<span style="color:#f59e0b; font-weight:600">⚡ Admin</span>{/if}
				</div>
			</div>
			{/if}
		</div>
		{/each}
	</div>
	{/if}

</div><!-- /requests panel -->

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- FLAGGED                                                                    -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="tab-panel" class:active={tab === 'flagged'}>

	{#if flaggedRequests.length === 0}
		<div class="empty-state" style="padding:80px 20px">
			<div style="font-size:40px; margin-bottom:12px">🛡️</div>
			<div style="font-size:15px; color:#a1a1aa; margin-bottom:6px">No flagged requests</div>
			<div>The diary is clean.</div>
		</div>
	{:else}

	<div class="attack-summary">
		<div class="attack-stat">
			<div class="attack-label">Blocked</div>
			<div class="attack-value" style="color:#ef4444">{blocked}</div>
		</div>
		<div class="attack-stat">
			<div class="attack-label">Block Rate</div>
			<div class="attack-value" style="color:{blockRate > 20 ? '#ef4444' : '#f59e0b'}">{blockRate}%</div>
		</div>
		<div class="attack-stat">
			<div class="attack-label">Attacker IPs</div>
			<div class="attack-value" style="color:#fafafa">{new Set(flaggedRequests.map(r => r.ip).filter(Boolean)).size}</div>
		</div>
		<div class="attack-stat">
			<div class="attack-label">Countries</div>
			<div class="attack-value" style="color:#fafafa">{new Set(flaggedRequests.map(r => r.country).filter(Boolean)).size}</div>
		</div>
	</div>

	<div class="req-list">
		{#each flaggedRequests as r, i}
		{@const rowKey = 50000 + i}
		<div class="req-row" class:open={expandedRows.has(rowKey)} style="border-color:#3f1212"
			role="button" tabindex="0"
			onclick={() => toggleRow(rowKey)}
			onkeydown={e => (e.key === 'Enter' || e.key === ' ') && toggleRow(rowKey)}>
			<div class="req-summary">
				<span class="col-time">{fmtTime(r.ts)}</span>
				<span class="col-ip">{r.ip ?? '—'}</span>
				<span class="col-loc">{r.countryCode ? flag(r.countryCode) : ''} {r.city ?? r.country ?? '—'}</span>
				<span><span class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef444444">BLOCKED</span></span>
				<span class="col-model">{r.category ?? '—'}</span>
				<span class="col-lat">{r.latencyMs ? fmtMs(r.latencyMs) : '—'}</span>
				<span class="col-q" style="color:#fca5a5">"{r.q}"</span>
			</div>
			{#if expandedRows.has(rowKey)}
			<div class="req-detail" role="region"
				onclick={e => e.stopPropagation()}
				onkeydown={e => e.stopPropagation()}>
				<div style="font-size:12px; color:#fca5a5; margin-bottom:4px"><b>Blocked query:</b> {r.q}</div>
				<div class="req-meta">
					<span>IP: <b style="color:#a1a1aa">{r.ip ?? '—'}</b></span>
					<span>Country: <b style="color:#a1a1aa">{r.country ?? '—'}</b></span>
					<span>City: <b style="color:#a1a1aa">{r.city ?? '—'}</b></span>
					<span>Category: <b style="color:#ef4444">{r.category ?? '—'}</b></span>
					<span>Time: <b style="color:#a1a1aa">{fmtDate(r.ts)}</b></span>
					{#if r.isAdmin}<span style="color:#f59e0b; font-weight:600">⚡ Admin</span>{/if}
				</div>
			</div>
			{/if}
		</div>
		{/each}
	</div>
	{/if}

</div><!-- /flagged panel -->

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- RAG INSPECTOR                                                              -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="tab-panel" class:active={tab === 'rag'}>

	<div class="rag-grid">

		<!-- System status -->
		<div class="card" style="padding:0">
			<div class="card-header"><span class="card-title">System Status</span></div>
			<div style="padding:0 16px 16px">
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

		<!-- Query inspector -->
		<div class="card" style="padding:0">
			<div class="card-header"><span class="card-title">Query Inspector</span></div>
			<div class="rag-input-row">
				<input class="rag-input" bind:value={qInput}
					onkeydown={e => e.key === 'Enter' && runRagQuery()}
					placeholder="Test a query against the TF-IDF index…" />
				<button class="btn-run" onclick={runRagQuery} disabled={qRunning}>{qRunning ? '…' : 'Run'}</button>
			</div>
			{#if qResults}
			<div class="rag-result-meta">
				{qResults.results.length} chunks · {qResults.retrievedTokens} tokens
				(saved {qResults.fullCvTokens - qResults.retrievedTokens} vs full CV)
			</div>
			<div style="padding:0 16px 14px; display:flex; flex-direction:column; gap:4px">
				{#each qResults.results as r, i}
				<details style="border:1px solid #27272a; border-radius:5px; overflow:hidden">
					<summary style="padding:8px 12px; cursor:pointer; font-size:12px; color:#a1a1aa; display:flex; gap:8px; align-items:baseline; list-style:none">
						<span style="color:#71717a">#{i+1}</span>
						<span style="color:#d4d4d8">[{r.heading}]</span>
						<span style="color:#52525b">score {r.score.toFixed(4)} · {r.tokenCount} tok</span>
					</summary>
					<div style="padding:8px 12px; font-size:11px; font-family:monospace; white-space:pre-wrap; color:#d4d4d8; background:#09090b; border-top:1px solid #27272a">{r.text}</div>
				</details>
				{/each}
			</div>
			{/if}
		</div>

		<!-- Latency traces (full width) -->
		<div class="card rag-full" style="padding:0">
			<div class="card-header">
				<span class="card-title">Recent Latency Traces</span>
				<button class="btn btn-danger" onclick={clearTraces}>Clear</button>
			</div>
			{#if data.recentTraces.length === 0}
				<div class="empty-state">No traces yet — send a chat message to record one.</div>
			{:else}
			<div style="padding:0 16px 14px; display:flex; flex-direction:column; gap:2px">
				{#each data.recentTraces as t}
				<details style="border-bottom:1px solid #1f1f1f">
					<summary style="cursor:pointer; padding:7px 0; font-size:12px; color:#a1a1aa; display:flex; gap:8px; align-items:baseline; list-style:none">
						<span style="color:#52525b; font-family:monospace; font-size:11px; flex-shrink:0">{fmtTime(t.timestamp)}</span>
						{#if t.blocked}
							<span class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef444444; flex-shrink:0">BLOCKED: {t.blockReason}</span>
						{:else if t.navigated}
							<span class="badge" style="background:#3b82f622; color:#3b82f6; border:1px solid #3b82f644; flex-shrink:0">NAV</span>
						{/if}
						<span style="color:#d4d4d8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">"{t.query.slice(0,60)}{t.query.length > 60 ? '…' : ''}"</span>
						<span style="margin-left:auto; color:#52525b; font-family:monospace; font-size:11px; flex-shrink:0">{t.latency.total}ms</span>
					</summary>
					<div style="font-size:11px; color:#71717a; padding:4px 0 8px 8px; line-height:1.8">
						<b style="color:#52525b">Latency:</b>
						sanitize {fmtMs(t.latency.sanitize)} ·
						inject {fmtMs(t.latency.injectionCheck)} ·
						retrieve {fmtMs(t.latency.retrieve)} ·
						assembly {fmtMs(t.latency.promptAssembly)} ·
						groq {fmtMs(t.latency.groq)} ·
						stream {fmtMs(t.latency.stream)}
						<br>
						<b style="color:#52525b">Tokens:</b>
						sys {t.tokens.systemPromptTokens} ·
						retrieved {t.tokens.retrievedChunkTokens} ·
						user {t.tokens.userMessageTokens} ·
						out {t.tokens.outputTokens} ·
						<span style="color:#22c55e">saved {t.tokens.savedTokens}</span>
						<br>
						<b style="color:#52525b">Chunks:</b>
						{t.retrievedChunks.length === 0 ? 'none' : t.retrievedChunks.map((c: { heading: string; score: number }) => `${c.heading} (${c.score.toFixed(3)})`).join(', ')}
					</div>
				</details>
				{/each}
			</div>
			{/if}
		</div>

		<!-- Chunk browser (full width) -->
		<div class="card rag-full" style="padding:0">
			<div class="card-header"><span class="card-title">Chunk Browser <span style="font-weight:400;color:#71717a">({data.chunkCount} chunks)</span></span></div>
			<div style="padding:0 16px 14px; display:flex; flex-direction:column; gap:2px">
				{#each data.chunks as c}
				<details style="border-bottom:1px solid #1f1f1f">
					<summary style="cursor:pointer; padding:6px 0; font-size:12px; color:#a1a1aa; display:flex; gap:8px; align-items:baseline; list-style:none">
						<span style="color:#3b82f6">[{c.heading}]</span>
						<span style="color:#52525b">chunk {c.chunkIndex} · {c.charCount} chars · {c.tokenCount} tok</span>
						{#if c.tags.length}<span style="color:#3f3f46">{c.tags.join(', ')}</span>{/if}
					</summary>
					<div style="padding:8px 12px; font-size:11px; font-family:monospace; white-space:pre-wrap; color:#d4d4d8; background:#09090b; border-top:1px solid #27272a; border-radius:0 0 5px 5px">
						{c.textPreview}{c.charCount > 150 ? '…' : ''}
					</div>
				</details>
				{/each}
			</div>
		</div>

	</div><!-- /rag-grid -->

</div><!-- /rag panel -->

</div><!-- /content -->
</div><!-- /root -->
