<script lang="ts">
	import type { MayurApp } from '../app.svelte';
	import type { ThreadItem } from '../tree';
	import Icon from './Icon.svelte';

	let { app, item, locked }: { app: MayurApp; item: ThreadItem; locked: boolean } = $props();
	const n = $derived(item.siblings.length);
</script>

{#if n > 1}
	<div class="branches">
		<button
			class="icon-btn"
			aria-label="Previous version"
			disabled={locked || item.index === 0}
			onclick={() => app.switchBranch(item.siblings[item.index - 1])}
		>
			<Icon name="left" size={15} />
		</button>
		<span>{item.index + 1} / {n}</span>
		<button
			class="icon-btn"
			aria-label="Next version"
			disabled={locked || item.index === n - 1}
			onclick={() => app.switchBranch(item.siblings[item.index + 1])}
		>
			<Icon name="right" size={15} />
		</button>
	</div>
{/if}

<style>
	.branches {
		display: inline-flex;
		align-items: center;
		color: var(--text-muted);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	.branches .icon-btn {
		width: 26px;
		height: 26px;
	}
	span {
		padding: 0 2px;
	}
</style>
