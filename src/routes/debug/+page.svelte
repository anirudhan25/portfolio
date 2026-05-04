<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let queryInput = $state('');
	let queryResults = $state<null | Awaited<ReturnType<typeof runQuery>>>(null);
	let querying = $state(false);

	type QueryResult = {
		query: string;
		results: { id: string; heading: string; score: number; charCount: number; tokenCount: number; text: string }[];
		formattedPreview: string;
		retrievedTokens: number;
		fullCvTokens: number;
	};

	async function runQuery(): Promise<QueryResult | null> {
		if (!queryInput.trim()) return null;
		querying = true;
		try {
			const res = await fetch('/api/debug', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: queryInput }),
			});
			return await res.json();
		} finally {
			querying = false;
		}
	}

	async function submitQuery() {
		queryResults = await runQuery();
	}

	async function clearTraces() {
		await fetch('/api/debug', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'clear_traces' }),
		});
		location.reload();
	}

	function fmtMs(n: number) { return n < 1 ? '<1ms' : `${n}ms`; }
	function fmtDate(ts: number) { return new Date(ts).toLocaleTimeString(); }
</script>

<svelte:head><title>RAG Debug Dashboard</title></svelte:head>

<main style="font-family: monospace; max-width: 900px; margin: 2rem auto; padding: 1rem; color: #1c1008; background: #eeede7; min-height: 100vh;">

<h1 style="font-size: 1.4rem; margin: 0 0 0.25rem;">RAG Debug Dashboard</h1>
<p style="margin: 0 0 2rem; color: #6b5240; font-size: 0.85rem;">
	TF-IDF lexical index · in-memory traces (cleared on server restart)
</p>

<!-- System status -->
<section style="margin-bottom: 2rem; border: 1px solid #c0b59a; padding: 1rem;">
	<h2 style="margin: 0 0 0.75rem; font-size: 1rem;">System Status</h2>
	<table style="border-collapse: collapse; width: 100%; font-size: 0.85rem;">
		<tr><td style="padding: 2px 12px 2px 0; color: #6b5240;">Chunks indexed</td><td>{data.chunkCount}</td></tr>
		<tr><td style="padding: 2px 12px 2px 0; color: #6b5240;">Full CV tokens (est.)</td><td>{data.fullCvTokens}</td></tr>
		<tr><td style="padding: 2px 12px 2px 0; color: #6b5240;">Index built at</td><td>{new Date(data.builtAt).toLocaleString()}</td></tr>
		<tr><td style="padding: 2px 12px 2px 0; color: #6b5240;">Traces recorded</td><td>{data.traceCount}</td></tr>
		<tr><td style="padding: 2px 12px 2px 0; color: #6b5240;">Avg tokens saved / request</td><td>{data.avgSavedTokens}</td></tr>
	</table>
</section>

<!-- Query inspector -->
<section style="margin-bottom: 2rem; border: 1px solid #c0b59a; padding: 1rem;">
	<h2 style="margin: 0 0 0.75rem; font-size: 1rem;">Query Inspector</h2>
	<div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
		<input
			bind:value={queryInput}
			onkeydown={e => e.key === 'Enter' && submitQuery()}
			placeholder="Enter a query to test retrieval..."
			style="flex: 1; font-family: monospace; padding: 0.4rem; border: 1px solid #c0b59a; background: #f8f4ec; color: #1c1008;"
		/>
		<button onclick={submitQuery} disabled={querying}
			style="padding: 0.4rem 1rem; font-family: monospace; cursor: pointer; background: #1c1008; color: #eeede7; border: none;">
			{querying ? '...' : 'Run'}
		</button>
	</div>

	{#if queryResults}
	<div style="font-size: 0.82rem; color: #6b5240; margin-bottom: 0.75rem;">
		Retrieved {queryResults.results.length} chunks · {queryResults.retrievedTokens} tokens
		(vs {queryResults.fullCvTokens} full CV · saved {queryResults.fullCvTokens - queryResults.retrievedTokens})
	</div>
	{#each queryResults.results as r, i}
	<details style="margin-bottom: 0.5rem; border: 1px solid #d4c9b0; padding: 0.5rem;">
		<summary style="cursor: pointer; font-size: 0.88rem;">
			#{i+1} [{r.heading}] · score {r.score.toFixed(4)} · {r.tokenCount} tokens
		</summary>
		<pre style="margin: 0.5rem 0 0; font-size: 0.78rem; white-space: pre-wrap; color: #3d2b18;">{r.text}</pre>
	</details>
	{/each}
	{/if}
</section>

<!-- Chunk browser -->
<section style="margin-bottom: 2rem; border: 1px solid #c0b59a; padding: 1rem;">
	<h2 style="margin: 0 0 0.75rem; font-size: 1rem;">Chunk Browser</h2>
	{#each data.chunks as c}
	<details style="margin-bottom: 0.4rem; border: 1px solid #d4c9b0; padding: 0.4rem 0.5rem;">
		<summary style="cursor: pointer; font-size: 0.85rem;">
			[{c.heading}] chunk {c.chunkIndex} · {c.charCount} chars · {c.tokenCount} tokens
			{#if c.tags.length}<span style="color: #6b5240;"> · {c.tags.join(', ')}</span>{/if}
		</summary>
		<pre style="margin: 0.4rem 0 0; font-size: 0.78rem; white-space: pre-wrap; color: #3d2b18;">{c.textPreview}{c.charCount > 150 ? '…' : ''}</pre>
	</details>
	{/each}
</section>

<!-- Recent traces -->
<section style="margin-bottom: 2rem; border: 1px solid #c0b59a; padding: 1rem;">
	<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
		<h2 style="margin: 0; font-size: 1rem;">Recent Traces</h2>
		<button onclick={clearTraces} style="font-family: monospace; font-size: 0.78rem; padding: 0.2rem 0.6rem; cursor: pointer; background: none; border: 1px solid #c91616; color: #c91616;">
			Clear
		</button>
	</div>

	{#if data.recentTraces.length === 0}
		<p style="color: #6b5240; font-size: 0.85rem; margin: 0;">No traces yet. Send a chat message to record one.</p>
	{/if}

	{#each data.recentTraces as t}
	<details style="margin-bottom: 0.5rem; border: 1px solid #d4c9b0; padding: 0.5rem;">
		<summary style="cursor: pointer; font-size: 0.85rem;">
			{fmtDate(t.timestamp)}
			{#if t.blocked}<span style="color: #c91616;"> [BLOCKED: {t.blockReason}]</span>
			{:else if t.navigated}<span style="color: #888;"> [NAV]</span>
			{/if}
			· "{t.query.slice(0, 60)}{t.query.length > 60 ? '…' : ''}"
			· {t.latency.total}ms total
		</summary>
		<div style="margin-top: 0.5rem; font-size: 0.8rem; color: #3d2b18;">
			<b>Latency:</b>
			sanitize {fmtMs(t.latency.sanitize)} ·
			inject-check {fmtMs(t.latency.injectionCheck)} ·
			retrieve {fmtMs(t.latency.retrieve)} ·
			assemble {fmtMs(t.latency.promptAssembly)} ·
			groq {fmtMs(t.latency.groq)} ·
			stream {fmtMs(t.latency.stream)}
			<br>
			<b>Tokens:</b>
			system {t.tokens.systemPromptTokens} ·
			retrieved {t.tokens.retrievedChunkTokens} ·
			user {t.tokens.userMessageTokens} ·
			output {t.tokens.outputTokens} ·
			<span style="color: #2a7a2a;">saved {t.tokens.savedTokens} vs full CV</span>
			<br>
			<b>Chunks:</b>
			{#if t.retrievedChunks.length === 0}<span style="color: #6b5240;">none</span>
			{:else}{t.retrievedChunks.map(c => `${c.heading} (${c.score.toFixed(3)})`).join(', ')}
			{/if}
		</div>
	</details>
	{/each}
</section>

</main>
