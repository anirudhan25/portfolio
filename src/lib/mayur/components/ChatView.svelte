<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { MayurApp } from '../app.svelte';
	import { FOOTNOTE, greeting, SUGGESTIONS } from '../copy';
	import { buildThread } from '../tree';
	import AssistantMessage from './AssistantMessage.svelte';
	import Composer from './Composer.svelte';
	import Icon from './Icon.svelte';
	import UserMessage from './UserMessage.svelte';

	let { app }: { app: MayurApp } = $props();

	let scroller = $state<HTMLElement>();
	let pinned = $state(true);
	let composer = $state<ReturnType<typeof Composer>>();
	let nameDraft = $state('');

	const chat = $derived(app.current);
	const items = $derived(chat ? buildThread(chat.messages, chat.conv.current_leaf_id) : []);
	const empty = $derived(!app.currentId || (!!chat && items.length === 0));
	const locked = $derived(!!chat?.streaming);
	const hello = $derived(greeting(app.user?.name));

	function onscroll() {
		if (!scroller) return;
		pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
	}

	function toBottom(smooth = false) {
		scroller?.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
	}

	// stay pinned to the newest text while it streams, unless the reader has scrolled up
	$effect(() => {
		app.tick;
		items.length;
		if (pinned) requestAnimationFrame(() => toBottom());
	});

	// a new chat, or a new reply of our own: jump to the bottom
	$effect(() => {
		app.currentId;
		app.activeReply?.cid;
		pinned = true;
		requestAnimationFrame(() => toBottom());
	});

	// focus the composer when opening a chat on desktop
	$effect(() => {
		app.currentId;
		if (!matchMedia('(pointer: coarse)').matches) composer?.focus();
	});
</script>

<div class="view" class:empty>
	<div class="scroll" bind:this={scroller} {onscroll}>
		{#if empty}
			<div class="hero" in:fade={{ duration: 200 }}>
				<h1>{hello}</h1>
				{#if app.phase === 'ready' && app.user && !app.user.name}
					<form
						class="name"
						onsubmit={(e) => {
							e.preventDefault();
							if (nameDraft.trim()) app.setName(nameDraft);
						}}
					>
						<div class="name-box">
							<input bind:value={nameDraft} maxlength="60" placeholder="What should Mayur call you?" aria-label="Your name" />
							{#if nameDraft.trim()}<button class="name-save" aria-label="Save name"><Icon name="check" size={16} /></button>{/if}
						</div>
					</form>
				{/if}
			</div>
		{:else if app.loadingChat && !chat}
			<div class="column loading"><span class="spinner"></span></div>
		{:else}
			<div class="column">
				{#each items as item, i (item.msg.id)}
					{#if item.msg.role === 'user'}
						<UserMessage {app} {item} {locked} />
					{:else}
						<AssistantMessage {app} {item} {locked} isLast={i === items.length - 1} />
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<div class="dock">
		{#if !pinned && !empty}
			<button class="jump" aria-label="Jump to latest" transition:fade={{ duration: 150 }} onclick={() => toBottom(true)}>
				<Icon name="arrowDown" size={18} />
			</button>
		{/if}
		{#if app.notice}
			{#key app.notice.id}
				<div class="toast" role="status" transition:fade={{ duration: 150 }}>{app.notice.text}</div>
			{/key}
		{/if}
		<div class="column">
			<Composer bind:this={composer} {app} onsend={() => (pinned = true)} />
			{#if empty}
				<div class="chips">
					{#each SUGGESTIONS as s (s)}
						<button class="chip" disabled={app.phase !== 'ready' || app.busy} onclick={() => app.send(s)}>{s}</button>
					{/each}
				</div>
			{/if}
			<p class="note">{FOOTNOTE}</p>
		</div>
	</div>
</div>

<style>
	.view {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		scrollbar-gutter: stable both-edges;
	}
	.column {
		width: 100%;
		max-width: 768px;
		margin: 0 auto;
		padding: 0 16px;
	}
	.scroll > .column {
		padding-top: 12px;
		padding-bottom: 28px;
	}
	.loading {
		display: grid;
		place-items: center;
		height: 100%;
	}
	.spinner {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 2px solid var(--border-strong);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
	}

	/* empty state: greeting with the composer under it (centred on desktop, docked on phones) */
	.view.empty .scroll {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.hero {
		width: 100%;
		padding: 24px 16px;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: clamp(36px, 8vw, 46px);
		font-weight: 400;
		line-height: 1.1;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}
	.name {
		display: flex;
		justify-content: center;
		margin-top: 14px;
	}
	.name-box {
		position: relative;
		width: min(320px, 100%);
	}
	.name input {
		width: 100%;
		height: 38px;
		padding: 0 38px;
		border-radius: 9999px;
		border: 1px solid var(--border);
		background: var(--surface);
		outline: none;
		font-size: 16px;
		text-align: center;
	}
	.name input:focus {
		border-color: var(--border-strong);
	}
	.name input::placeholder {
		color: var(--text-faint);
	}
	.name-save {
		position: absolute;
		top: 4px;
		right: 4px;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 9999px;
		background: var(--accent);
		color: var(--accent-fg);
	}
	@media (min-width: 768px) {
		.view.empty {
			justify-content: center;
			padding-bottom: 8vh;
		}
		.view.empty .scroll {
			flex: 0 0 auto;
			overflow: visible;
		}
		.view.empty .hero {
			padding-bottom: 28px;
		}
	}

	.dock {
		position: relative;
		flex-shrink: 0;
		padding-bottom: max(8px, env(safe-area-inset-bottom));
	}
	.dock::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 100%;
		height: 24px;
		background: linear-gradient(to bottom, transparent, var(--bg));
		pointer-events: none;
	}
	.view.empty .dock::before {
		display: none;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin-top: 14px;
	}
	.chip {
		height: 34px;
		padding: 0 14px;
		border-radius: 9999px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
		font-size: 13.5px;
		transition:
			background 150ms var(--ease),
			color 150ms var(--ease),
			border-color 150ms var(--ease);
	}
	.chip:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.chip:disabled {
		opacity: 0.5;
	}
	.note {
		margin: 8px 0 0;
		color: var(--text-faint);
		font-size: 12px;
		text-align: center;
	}
	.jump {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 10px);
		z-index: 5;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		margin-left: -18px;
		border-radius: 9999px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
		box-shadow: var(--shadow-card);
	}
	.jump:hover {
		color: var(--text);
	}
	.toast {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 56px);
		z-index: 6;
		max-width: calc(100% - 32px);
		padding: 8px 14px;
		border-radius: 9999px;
		background: var(--text);
		color: var(--bg);
		font-size: 13.5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transform: translateX(-50%);
		box-shadow: var(--shadow-pop);
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
