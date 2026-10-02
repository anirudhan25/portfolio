<script lang="ts">
	import { fade } from 'svelte/transition';
	import { MAX_CHARS, type Smart } from '../api';
	import type { MayurApp } from '../app.svelte';
	import Icon from './Icon.svelte';

	let { app, onsend }: { app: MayurApp; onsend?: () => void } = $props();

	let area = $state<HTMLTextAreaElement>();
	let thinkOpen = $state(false);

	const replyingHere = $derived(!!app.activeReply && app.activeReply.cid === app.currentId);
	const canSend = $derived(app.phase === 'ready' && !app.busy && !!app.draft.trim() && app.draft.length <= MAX_CHARS);
	const count = $derived(app.draft.length);

	const SMART: { value: Smart; label: string; hint: string }[] = [
		{ value: 'auto', label: 'Auto', hint: 'Mayur thinks when a question needs it' },
		{ value: 'on', label: 'Always think', hint: 'Reason first on every message' },
		{ value: 'off', label: 'Never think', hint: 'Just text back' }
	];
	const smartLabel = $derived(app.smart === 'auto' ? 'Auto' : app.smart === 'on' ? 'Think' : 'Quick');

	// auto-grow
	$effect(() => {
		app.draft;
		if (!area) return;
		area.style.height = 'auto';
		area.style.height = Math.min(area.scrollHeight, 240) + 'px';
	});

	export function focus() {
		area?.focus();
	}

	function submit() {
		if (!canSend) return;
		const text = app.draft;
		onsend?.();
		app.send(text, undefined, true);
	}

	function onkeydown(e: KeyboardEvent) {
		// on phones Return makes a new line (like WhatsApp); the send button sends
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {
			e.preventDefault();
			submit();
		}
	}

	function outside(node: HTMLElement) {
		const close = (e: Event) => {
			if (!node.contains(e.target as Node)) thinkOpen = false;
		};
		document.addEventListener('pointerdown', close, true);
		return { destroy: () => document.removeEventListener('pointerdown', close, true) };
	}
</script>

<form class="composer" onsubmit={(e) => (e.preventDefault(), submit())}>
	<textarea
		bind:this={area}
		bind:value={app.draft}
		{onkeydown}
		rows="1"
		maxlength={MAX_CHARS}
		placeholder={app.phase === 'ready' ? 'Text Mayur…' : 'Waiting for Mayur…'}
		aria-label="Message Mayur"
		enterkeyhint="enter"
	></textarea>
	<div class="bar">
		<div class="think" use:outside>
			<button
				type="button"
				class="think-btn"
				class:on={app.smart === 'on'}
				class:off={app.smart === 'off'}
				aria-haspopup="menu"
				aria-expanded={thinkOpen}
				title="Thinking"
				onclick={() => (thinkOpen = !thinkOpen)}
			>
				<Icon name="bulb" size={16} />
				<span>{smartLabel}</span>
			</button>
			{#if thinkOpen}
				<div class="menu think-menu" role="menu" transition:fade={{ duration: 120 }}>
					{#each SMART as s (s.value)}
						<button
							type="button"
							role="menuitemradio"
							aria-checked={app.smart === s.value}
							onclick={() => {
								app.setSmart(s.value);
								thinkOpen = false;
								area?.focus();
							}}
						>
							<span class="opt">
								<span class="opt-label">{s.label}</span>
								<span class="opt-hint">{s.hint}</span>
							</span>
							{#if app.smart === s.value}<Icon name="check" size={16} />{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<div class="right">
			{#if count > MAX_CHARS - 1000}
				<span class="count" class:over={count >= MAX_CHARS}>{count} / {MAX_CHARS}</span>
			{/if}
			{#if replyingHere}
				<button type="button" class="send stop" aria-label="Stop" title="Stop" onclick={() => app.stop()}>
					<span class="square"></span>
				</button>
			{:else}
				<button
					type="submit"
					class="send"
					aria-label="Send"
					title={app.busy ? "Mayur's replying in another chat" : 'Send'}
					disabled={!canSend}
				>
					<Icon name="arrowUp" size={18} />
				</button>
			{/if}
		</div>
	</div>
</form>

<style>
	.composer {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 12px 10px 16px;
		border-radius: 22px;
		border: 1px solid var(--border);
		background: var(--surface);
		box-shadow: var(--shadow-composer);
		transition: border-color 150ms var(--ease);
	}
	.composer:focus-within {
		border-color: var(--border-strong);
	}
	textarea {
		display: block;
		width: 100%;
		min-height: 26px;
		max-height: 240px;
		padding: 2px 0;
		border: 0;
		outline: none;
		resize: none;
		background: transparent;
		font-size: 16px;
		line-height: 1.5;
	}
	textarea::placeholder {
		color: var(--text-faint);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.think {
		position: relative;
		margin-left: -6px;
	}
	.think-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 10px;
		border-radius: 9999px;
		border: 1px solid var(--border);
		color: var(--text-muted);
		font-size: 13px;
		font-weight: 500;
		transition:
			background 150ms var(--ease),
			color 150ms var(--ease),
			border-color 150ms var(--ease);
	}
	.think-btn:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.think-btn.on {
		background: var(--accent-soft);
		border-color: transparent;
		color: var(--accent);
	}
	.think-menu {
		left: 0;
		bottom: calc(100% + 8px);
		width: 260px;
	}
	.think-menu button {
		justify-content: space-between;
	}
	.opt {
		display: flex;
		flex-direction: column;
	}
	.opt-label {
		font-weight: 500;
	}
	.opt-hint {
		color: var(--text-muted);
		font-size: 12.5px;
	}
	.count {
		color: var(--text-faint);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.count.over {
		color: var(--danger);
	}
	.send {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 9999px;
		background: var(--accent);
		color: var(--accent-fg);
		transition:
			background 150ms var(--ease),
			opacity 150ms var(--ease),
			transform 150ms var(--ease);
	}
	.send:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.send:active:not(:disabled) {
		transform: scale(0.94);
	}
	.send:disabled {
		opacity: 0.35;
	}
	.stop {
		background: var(--text);
		color: var(--bg);
	}
	.stop:hover {
		background: var(--text-muted) !important;
	}
	.square {
		width: 11px;
		height: 11px;
		border-radius: 2.5px;
		background: currentColor;
	}
</style>
