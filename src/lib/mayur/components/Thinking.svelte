<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { Thinking } from '../api';
	import Icon from './Icon.svelte';

	let { thinking, active }: { thinking: Thinking; active: boolean } = $props();

	let open = $state(false);
	let body = $state<HTMLElement>();

	const label = $derived.by(() => {
		if (active) return 'Thinking…';
		const s = thinking.seconds;
		const head = s == null ? 'Thought for a moment' : `Thought for ${Math.max(1, Math.round(s))}s`;
		return thinking.summary ? `${head} · ${thinking.summary}` : head;
	});

	// keep the live reasoning scrolled to its newest line while it streams
	$effect(() => {
		thinking.text;
		if (active && open && body) body.scrollTop = body.scrollHeight;
	});
</script>

<div class="thinking">
	<button class="row" class:active onclick={() => (open = !open)} aria-expanded={open}>
		<span class="label" class:shimmer={active}>{label}</span>
		<span class="chev" class:open><Icon name="down" size={15} /></span>
	</button>
	{#if open}
		<div class="body" bind:this={body} transition:slide={{ duration: 180 }}>
			{#if thinking.text}{thinking.text}{:else}<span class="empty">…</span>{/if}
		</div>
	{/if}
</div>

<style>
	.thinking {
		margin: 2px 0 10px;
	}
	.row {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		padding: 4px 8px 4px 0;
		border-radius: 8px;
		color: var(--text-muted);
		font-size: 14px;
		text-align: left;
		transition: color 150ms var(--ease);
	}
	.row:hover {
		color: var(--text);
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chev {
		display: inline-grid;
		transition: transform 180ms var(--ease);
	}
	.chev.open {
		transform: rotate(180deg);
	}
	.shimmer {
		background: linear-gradient(90deg, var(--text-muted) 0%, var(--text-muted) 40%, var(--text) 50%, var(--text-muted) 60%, var(--text-muted) 100%);
		background-size: 250% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		animation: shimmer 1.8s linear infinite;
	}
	.body {
		margin: 6px 0 4px 4px;
		padding: 2px 0 2px 14px;
		border-left: 2px solid var(--border-strong);
		max-height: 320px;
		overflow-y: auto;
		color: var(--text-muted);
		font-size: 13.5px;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.empty {
		color: var(--text-faint);
	}
	@keyframes shimmer {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: -150% 0;
		}
	}
</style>
