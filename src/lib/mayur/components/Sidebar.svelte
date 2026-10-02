<script lang="ts">
	import type { Conversation } from '../api';
	import { BASE, type MayurApp } from '../app.svelte';
	import ChatRow from './ChatRow.svelte';
	import Dialog from './Dialog.svelte';
	import Icon from './Icon.svelte';
	import Mark from './Mark.svelte';

	let {
		app,
		mobile,
		onclose,
		onnewchat,
		onsettings
	}: {
		app: MayurApp;
		mobile: boolean;
		onclose: () => void;
		onnewchat: () => void;
		onsettings: () => void;
	} = $props();

	let q = $state('');
	let results = $state<Conversation[] | null>(null);
	let searching = $state(false);
	let toDelete = $state<Conversation | null>(null);
	let confirmOpen = $state(false);
	let list = $state<HTMLElement>();

	const starred = $derived(app.conversations.filter((c) => c.starred));
	const recents = $derived(app.conversations.filter((c) => !c.starred));

	// Recents grouped by day, like Claude: Today, Yesterday, then "Sep 30"
	function dayLabel(iso: string) {
		const d = new Date(iso);
		const today = new Date();
		const days = Math.round(
			(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
				new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
				86400000
		);
		if (days <= 0) return 'Today';
		if (days === 1) return 'Yesterday';
		return d.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
		});
	}
	const groups = $derived.by(() => {
		const out: { label: string; items: Conversation[] }[] = [];
		for (const c of recents) {
			const label = dayLabel(c.updated_at);
			if (out[out.length - 1]?.label === label) out[out.length - 1].items.push(c);
			else out.push({ label, items: [c] });
		}
		return out;
	});

	// debounced search
	$effect(() => {
		const query = q.trim();
		if (!query) {
			results = null;
			searching = false;
			return;
		}
		searching = true;
		const t = setTimeout(async () => {
			try {
				const r = await app.search(query);
				if (q.trim() === query) results = r;
			} catch {
				if (q.trim() === query) results = [];
			} finally {
				if (q.trim() === query) searching = false;
			}
		}, 250);
		return () => clearTimeout(t);
	});

	function sentinel(node: HTMLElement) {
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) app.loadMore();
			},
			{ root: list, rootMargin: '200px' }
		);
		io.observe(node);
		return { destroy: () => io.disconnect() };
	}

	function navigated() {
		if (mobile) onclose();
	}

	function askDelete(c: Conversation) {
		toDelete = c;
		confirmOpen = true;
	}

	const initials = $derived(
		(app.user?.name?.trim() || 'You')
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w.charAt(0).toUpperCase())
			.join('')
	);
</script>

<aside class="sidebar">
	<div class="head">
		<button class="icon-btn" aria-label={mobile ? 'Close sidebar' : 'Collapse sidebar'} onclick={onclose}>
			<Icon name={mobile ? 'x' : 'sidebar'} />
		</button>
		<a class="brand" href={BASE} onclick={navigated}>
			<Mark size={26} />
			<span>MayurGPT</span>
		</a>
	</div>

	<label class="search">
		<Icon name="search" size={17} />
		<input type="search" placeholder="Search" bind:value={q} aria-label="Search chats" />
	</label>

	<button class="new" onclick={onnewchat}>
		<span class="new-icon"><Icon name="plus" size={16} /></span>
		New
	</button>

	<nav class="list" bind:this={list} aria-label="Chats">
		{#if results !== null || searching}
			<h3>Results</h3>
			{#if results}
				{#each results as c (c.id)}
					<ChatRow {app} conv={c} ondelete={askDelete} onnavigate={navigated} />
				{:else}
					<p class="empty">Nothing matches “{q.trim()}”</p>
				{/each}
			{:else}
				<p class="empty">Searching…</p>
			{/if}
		{:else}
			{#if starred.length}
				<h3>Starred</h3>
				{#each starred as c (c.id)}
					<ChatRow {app} conv={c} ondelete={askDelete} onnavigate={navigated} />
				{/each}
			{/if}
			{#each groups as g (g.label)}
				<h3>{g.label}</h3>
				{#each g.items as c (c.id)}
					<ChatRow {app} conv={c} ondelete={askDelete} onnavigate={navigated} />
				{/each}
			{/each}
			{#if !recents.length && app.phase === 'ready' && !starred.length}
				<p class="empty">Your chats with Mayur will show up here.</p>
			{/if}
			{#if app.hasMore}
				<div class="sentinel" use:sentinel>{app.loadingMore ? 'Loading…' : ''}</div>
			{/if}
		{/if}
	</nav>

	<button class="me" onclick={onsettings} disabled={app.phase !== 'ready'}>
		<span class="avatar">{initials}</span>
		<span class="me-name">{app.user?.name || 'You'}</span>
		<Icon name="down" size={16} />
	</button>
</aside>

<Dialog bind:open={confirmOpen} title="Delete chat?">
	<p class="confirm-text">
		“{toDelete?.title || 'New chat'}” will be deleted for good, along with every message in it.
	</p>
	<div class="confirm-actions">
		<button class="pill pill-outline" onclick={() => (confirmOpen = false)}>Cancel</button>
		<button
			class="pill pill-danger"
			onclick={() => {
				if (toDelete) app.deleteConversation(toDelete.id);
				confirmOpen = false;
				if (results) results = results.filter((r) => r.id !== toDelete?.id);
			}}
		>
			Delete
		</button>
	</div>
</Dialog>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		padding: 10px 8px 8px;
		background: var(--bg-sidebar);
		border-right: 1px solid var(--border);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 4px 12px 2px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-serif);
		font-size: 22px;
		line-height: 1;
		letter-spacing: -0.01em;
	}
	.new {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 38px;
		margin-top: 6px;
		padding: 0 8px;
		border-radius: 9px;
		font-size: 15px;
		transition: background 150ms var(--ease);
	}
	.new:hover {
		background: var(--bg-hover);
	}
	.new-icon {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 9999px;
		background: var(--bg-active);
		color: var(--text);
	}
	.search {
		display: flex;
		align-items: center;
		gap: 9px;
		height: 38px;
		margin: 0;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
		transition: border-color 150ms var(--ease);
	}
	.search:focus-within {
		border-color: var(--border-strong);
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--text);
		font-size: 16px;
	}
	@media (min-width: 768px) {
		.search input {
			font-size: 14px;
		}
	}
	.search input::placeholder {
		color: var(--text-faint);
	}
	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0 -4px;
		padding: 0 4px 12px;
	}
	h3 {
		margin: 18px 0 4px;
		padding: 0 10px;
		color: var(--text-faint);
		font-size: 13px;
		font-weight: 400;
	}
	.empty {
		margin: 8px 10px;
		color: var(--text-faint);
		font-size: 13px;
	}
	.sentinel {
		height: 24px;
		padding: 4px 10px;
		color: var(--text-faint);
		font-size: 12px;
	}
	.me {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		margin-top: 6px;
		padding: 8px;
		border-radius: 10px;
		border-top: 1px solid var(--border);
		color: var(--text-muted);
		text-align: left;
		transition: background 150ms var(--ease);
	}
	.me:hover:not(:disabled) {
		background: var(--bg-hover);
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 9999px;
		border: 1px solid var(--border-strong);
		background: var(--bg-raised);
		color: var(--text);
		font-size: 12px;
		flex-shrink: 0;
	}
	.me-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--text);
		font-size: 15px;
	}
	.confirm-text {
		margin: 0 0 18px;
		color: var(--text-muted);
		font-size: 14.5px;
		overflow-wrap: anywhere;
	}
	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
