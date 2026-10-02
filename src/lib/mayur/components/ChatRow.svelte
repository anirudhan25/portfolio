<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { Conversation } from '../api';
	import { BASE, type MayurApp } from '../app.svelte';
	import Icon from './Icon.svelte';

	let {
		app,
		conv,
		ondelete,
		onnavigate
	}: { app: MayurApp; conv: Conversation; ondelete: (c: Conversation) => void; onnavigate: () => void } = $props();

	let menuOpen = $state(false);
	let up = $state(false);
	let rowEl = $state<HTMLElement>();
	let renaming = $state(false);
	let title = $state('');
	let input = $state<HTMLInputElement>();

	const active = $derived(app.currentId === conv.id);

	async function startRename() {
		menuOpen = false;
		title = conv.title;
		renaming = true;
		await tick();
		input?.select();
	}

	function commit() {
		if (!renaming) return;
		renaming = false;
		const t = title.trim();
		if (t && t !== conv.title) app.patchConversation(conv.id, { title: t });
	}

	function outside(node: HTMLElement) {
		const close = (e: Event) => {
			if (!node.contains(e.target as Node)) menuOpen = false;
		};
		document.addEventListener('pointerdown', close, true);
		return { destroy: () => document.removeEventListener('pointerdown', close, true) };
	}
</script>

<div class="row" class:active class:menu-open={menuOpen} bind:this={rowEl}>
	{#if renaming}
		<input
			class="rename"
			bind:this={input}
			bind:value={title}
			maxlength="120"
			aria-label="Chat title"
			onblur={commit}
			onkeydown={(e) => {
				if (e.key === 'Enter') commit();
				if (e.key === 'Escape') renaming = false;
			}}
		/>
	{:else}
		<a href="{BASE}/c/{conv.id}" onclick={onnavigate} aria-current={active ? 'page' : undefined}>
			<span class="title">{conv.title || 'New chat'}</span>
			{#if conv.generating}<span class="dot" title="Mayur's replying"></span>{/if}
		</a>
		<div class="more" use:outside>
			<button
				class="icon-btn"
				aria-label="Chat options"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onclick={() => {
					up = !!rowEl && window.innerHeight - rowEl.getBoundingClientRect().bottom < 160;
					menuOpen = !menuOpen;
				}}
			>
				<Icon name="more" size={16} />
			</button>
			{#if menuOpen}
				<div class="menu" class:up role="menu" transition:fade={{ duration: 120 }}>
					<button
						role="menuitem"
						onclick={() => {
							menuOpen = false;
							app.patchConversation(conv.id, { starred: !conv.starred });
						}}
					>
						<Icon name="star" size={16} filled={conv.starred} />
						{conv.starred ? 'Unstar' : 'Star'}
					</button>
					<button role="menuitem" onclick={startRename}><Icon name="pencil" size={16} /> Rename</button>
					<button
						role="menuitem"
						class="danger"
						onclick={() => {
							menuOpen = false;
							ondelete(conv);
						}}
					>
						<Icon name="trash" size={16} /> Delete
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.row {
		position: relative;
		display: flex;
		align-items: center;
		height: 36px;
		border-radius: 9px;
		transition: background 150ms var(--ease);
	}
	.row:hover,
	.row.menu-open {
		background: var(--bg-hover);
	}
	.row.active {
		background: var(--bg-active);
	}
	a {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 100%;
		padding: 0 4px 0 10px;
		font-size: 15px;
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		-webkit-mask-image: linear-gradient(90deg, #000 85%, transparent);
		mask-image: linear-gradient(90deg, #000 85%, transparent);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
		animation: pulse 1.4s var(--ease) infinite;
	}
	.more {
		position: relative;
		opacity: 0;
		transition: opacity 150ms var(--ease);
	}
	.row:hover .more,
	.row.active .more,
	.row.menu-open .more,
	.more:focus-within {
		opacity: 1;
	}
	@media (hover: none) {
		.more {
			opacity: 1;
		}
	}
	.more .icon-btn {
		width: 28px;
		height: 28px;
		margin-right: 4px;
	}
	.menu {
		right: 0;
		top: calc(100% + 4px);
	}
	.menu.up {
		top: auto;
		bottom: calc(100% + 4px);
	}
	.rename {
		flex: 1;
		height: 32px;
		margin: 0 2px;
		padding: 0 8px;
		border-radius: 8px;
		border: 1px solid var(--accent);
		background: var(--surface);
		font-size: 16px;
		outline: none;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.35;
			transform: scale(0.8);
		}
	}
</style>
