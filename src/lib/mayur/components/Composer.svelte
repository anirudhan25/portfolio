<script lang="ts">
	import { fade } from 'svelte/transition';
	import { MAX_CHARS, type Smart } from '../api';
	import type { MayurApp } from '../app.svelte';
	import { FOOTNOTE, MODEL_NAME } from '../copy';
	import Icon from './Icon.svelte';

	let { app, onsend }: { app: MayurApp; onsend?: () => void } = $props();

	let area = $state<HTMLTextAreaElement>();
	let pickerOpen = $state(false);

	const replyingHere = $derived(!!app.activeReply && app.activeReply.cid === app.currentId);
	const hasText = $derived(!!app.draft.trim());
	const canSend = $derived(app.phase === 'ready' && !app.busy && hasText && app.draft.length <= MAX_CHARS);
	const count = $derived(app.draft.length);
	const placeholder = $derived(app.phase !== 'ready' ? 'Waiting for Mayur…' : app.currentId ? 'Reply' : 'Text Mayur…');

	// like Claude's effort level: "Smart" always thinks first, "Auto" lets Mayur decide
	const MODES: { value: Smart; label: string; hint: string }[] = [
		{ value: 'auto', label: 'Auto', hint: 'Mayur thinks when a question needs it' },
		{ value: 'on', label: 'Smart', hint: 'Mayur thinks before every reply' }
	];
	const modeLabel = $derived(app.smart === 'on' ? 'Smart' : 'Auto');

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
			if (!node.contains(e.target as Node)) pickerOpen = false;
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
		{placeholder}
		aria-label="Message Mayur"
		enterkeyhint="enter"
	></textarea>
	<div class="send-slot">
		{#if count > MAX_CHARS - 1000}
			<span class="count" class:over={count >= MAX_CHARS}>{count} / {MAX_CHARS}</span>
		{/if}
		{#if replyingHere}
			<button type="button" class="send stop" aria-label="Stop" title="Stop" onclick={() => app.stop()}>
				<span class="square"></span>
			</button>
		{:else if hasText}
			<button
				type="submit"
				class="send"
				aria-label="Send"
				title={app.busy ? "Mayur's replying in another chat" : 'Send'}
				disabled={!canSend}
			>
				<Icon name="arrowUp" size={17} />
			</button>
		{:else}
			<span class="enter" aria-hidden="true"><Icon name="enter" size={18} /></span>
		{/if}
	</div>
</form>

<div class="footer">
	<p class="note">{FOOTNOTE}</p>
	<div class="picker" use:outside>
		<button
			type="button"
			class="model"
			aria-haspopup="menu"
			aria-expanded={pickerOpen}
			onclick={() => (pickerOpen = !pickerOpen)}
		>
			<span class="model-name">{MODEL_NAME}</span>
			<span class="model-mode">{modeLabel}</span>
		</button>
		{#if pickerOpen}
			<div class="menu picker-menu" role="menu" transition:fade={{ duration: 120 }}>
				<p class="menu-head">{MODEL_NAME}</p>
				{#each MODES as m (m.value)}
					<button
						type="button"
						role="menuitemradio"
						aria-checked={app.smart === m.value}
						onclick={() => {
							app.setSmart(m.value);
							pickerOpen = false;
							area?.focus();
						}}
					>
						<span class="opt">
							<span>{m.label}</span>
							<span class="opt-hint">{m.hint}</span>
						</span>
						{#if app.smart === m.value}<Icon name="check" size={16} />{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.composer {
		display: flex;
		align-items: flex-end;
		gap: 10px;
		min-height: 58px;
		padding: 15px 12px 12px 20px;
		border-radius: 20px;
		border: 1px solid var(--border);
		background: var(--surface);
		box-shadow: var(--shadow-composer);
		transition: border-color 150ms var(--ease);
	}
	.composer:focus-within {
		border-color: var(--border-strong);
	}
	textarea {
		flex: 1;
		min-width: 0;
		min-height: 26px;
		max-height: 240px;
		padding: 0;
		margin-bottom: 3px;
		border: 0;
		outline: none;
		resize: none;
		background: transparent;
		font-size: 16px;
		line-height: 1.55;
	}
	textarea::placeholder {
		color: var(--text-faint);
	}
	.send-slot {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
		min-height: 32px;
	}
	.count {
		color: var(--text-faint);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.count.over {
		color: var(--danger);
	}
	.enter {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		color: var(--text-faint);
	}
	.send {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 9px;
		background: var(--accent);
		color: var(--accent-fg);
		animation: pop 150ms var(--ease);
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
		opacity: 0.4;
	}
	.stop {
		background: var(--text);
		color: var(--bg);
	}
	.stop:hover {
		background: var(--text-muted) !important;
	}
	.square {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		background: currentColor;
	}

	/* under the box: the disclaimer in the middle, the model picker on the right (like Claude) */
	.footer {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 4px 4px 0;
	}
	.note {
		grid-column: 2;
		margin: 0;
		color: var(--text-faint);
		font-size: 12.5px;
		text-align: center;
	}
	.picker {
		grid-column: 3;
		justify-self: end;
		position: relative;
	}
	.model {
		display: inline-flex;
		align-items: baseline;
		gap: 7px;
		height: 30px;
		padding: 0 8px;
		border-radius: 8px;
		font-size: 14px;
		white-space: nowrap;
		transition: background 150ms var(--ease);
	}
	.model:hover {
		background: var(--bg-hover);
	}
	.model-name {
		color: var(--text);
	}
	.model-mode {
		color: var(--text-faint);
	}
	.picker-menu {
		right: 0;
		bottom: calc(100% + 6px);
		width: 270px;
	}
	.menu-head {
		margin: 0;
		padding: 6px 10px 4px;
		color: var(--text-faint);
		font-size: 12.5px;
	}
	.picker-menu button {
		justify-content: space-between;
	}
	.opt {
		display: flex;
		flex-direction: column;
	}
	.opt-hint {
		color: var(--text-muted);
		font-size: 12.5px;
	}
	@media (max-width: 600px) {
		.footer {
			grid-template-columns: 1fr auto;
		}
		.note {
			grid-column: 1;
			text-align: left;
			padding-left: 6px;
			font-size: 12px;
		}
		.picker {
			grid-column: 2;
		}
	}
	@keyframes pop {
		from {
			transform: scale(0.85);
			opacity: 0;
		}
	}
</style>
