<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		title,
		children,
		width = 420
	}: { open: boolean; title: string; children: Snippet; width?: number } = $props();

	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	style="--w:{width}px"
	onclose={() => (open = false)}
	onclick={(e) => e.target === dialog && (open = false)}
>
	{#if open}
		<div class="inner">
			<header>
				<h2>{title}</h2>
				<button class="icon-btn" aria-label="Close" onclick={() => (open = false)}><Icon name="x" /></button>
			</header>
			{@render children()}
		</div>
	{/if}
</dialog>

<style>
	dialog {
		width: min(var(--w), calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--surface);
		box-shadow: var(--shadow-pop);
		overflow: auto;
	}
	dialog[open] {
		animation: pop 180ms var(--ease);
	}
	dialog::backdrop {
		background: var(--scrim, rgba(32, 30, 26, 0.32));
		animation: fade 180ms var(--ease);
	}
	.inner {
		padding: 18px 20px 20px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	h2 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 26px;
		font-weight: 400;
		line-height: 1.2;
	}
	header .icon-btn {
		margin-right: -6px;
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.98);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
