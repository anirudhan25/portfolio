<script lang="ts">
	import '$lib/mayur/mayur.css';
	import { onMount, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { BASE, MayurApp } from '$lib/mayur/app.svelte';
	import ChatView from '$lib/mayur/components/ChatView.svelte';
	import Dialog from '$lib/mayur/components/Dialog.svelte';
	import Icon from '$lib/mayur/components/Icon.svelte';
	import InviteScreen from '$lib/mayur/components/InviteScreen.svelte';
	import Mark, { HEAD } from '$lib/mayur/components/Mark.svelte';
	import Settings from '$lib/mayur/components/Settings.svelte';
	import Sidebar from '$lib/mayur/components/Sidebar.svelte';

	let { children } = $props();

	const app = new MayurApp();
	const COLLAPSE_KEY = 'mayurgpt.sidebar';

	let mounted = $state(false);
	let mobile = $state(false);
	let expanded = $state(true); // desktop sidebar
	let drawer = $state(false); // phone sidebar
	let settingsOpen = $state(false);
	let root = $state<HTMLElement>();

	const title = $derived(app.current?.conv.title || '');
	const conv = $derived(app.current?.conv ?? null);

	// the title dropdown in the header (like Claude's): star, rename, delete
	let titleMenu = $state(false);
	let renaming = $state(false);
	let renameText = $state('');
	let renameInput = $state<HTMLInputElement>();
	let confirmDelete = $state(false);

	async function startRename() {
		titleMenu = false;
		renameText = title;
		renaming = true;
		await tick();
		renameInput?.select();
	}

	function commitRename() {
		if (!renaming) return;
		renaming = false;
		const t = renameText.trim();
		if (conv && t && t !== title) app.patchConversation(conv.id, { title: t });
	}

	function outside(node: HTMLElement) {
		const close = (e: Event) => {
			if (!node.contains(e.target as Node)) titleMenu = false;
		};
		document.addEventListener('pointerdown', close, true);
		return { destroy: () => document.removeEventListener('pointerdown', close, true) };
	}

	$effect(() => {
		app.setCurrent(page.params.cid ?? null);
	});

	onMount(() => {
		mounted = true;
		document.documentElement.classList.add('mg-lock');
		try {
			expanded = localStorage.getItem(COLLAPSE_KEY) !== 'collapsed';
		} catch {
			/* storage blocked */
		}

		const mq = matchMedia('(max-width: 767px)');
		const syncMq = () => {
			mobile = mq.matches;
			if (!mobile) drawer = false;
		};
		syncMq();
		mq.addEventListener('change', syncMq);

		// pin the app to the visual viewport so the composer rides above the on-screen keyboard
		const vv = window.visualViewport;
		const syncVv = () => {
			if (!vv || !root) return;
			root.style.setProperty('--mg-vh', `${vv.height}px`);
			root.style.setProperty('--mg-vtop', `${vv.offsetTop}px`);
		};
		vv?.addEventListener('resize', syncVv);
		vv?.addEventListener('scroll', syncVv);
		syncVv();

		const onVisible = () => document.visibilityState === 'visible' && app.onVisible();
		document.addEventListener('visibilitychange', onVisible);

		app.boot(page.url);

		return () => {
			document.documentElement.classList.remove('mg-lock');
			mq.removeEventListener('change', syncMq);
			vv?.removeEventListener('resize', syncVv);
			vv?.removeEventListener('scroll', syncVv);
			document.removeEventListener('visibilitychange', onVisible);
			app.destroy();
		};
	});

	function setExpanded(v: boolean) {
		expanded = v;
		try {
			localStorage.setItem(COLLAPSE_KEY, v ? 'open' : 'collapsed');
		} catch {
			/* storage blocked */
		}
	}

	function newChat() {
		drawer = false;
		app.draft = '';
		goto(BASE);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && drawer) drawer = false;
		// ⌘⇧O / Ctrl⇧O: new chat, like Claude
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
			e.preventDefault();
			newChat();
		}
	}

</script>

<svelte:head>
	<title>{title ? `${title} · MayurGPT` : 'MayurGPT'}</title>
	<meta name="description" content="Text Mayur, whenever." />
	<meta property="og:title" content="MayurGPT" />
	<meta property="og:description" content="Text Mayur, whenever." />
	<meta property="og:type" content="website" />
	<meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#1a1917" media="(prefers-color-scheme: dark)" />
	<link rel="icon" type="image/png" href={HEAD} />
	<link rel="apple-touch-icon" href={HEAD} />
	<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin="anonymous" />
</svelte:head>

<svelte:window {onkeydown} />

<div class="mg" bind:this={root}>
	{#if !mounted}
		<div class="boot"><Mark size={40} /></div>
	{:else if app.phase === 'invite'}
		<InviteScreen {app} />
	{:else}
		{#if mobile}
			{#if drawer}
				<button class="scrim" aria-label="Close sidebar" transition:fade={{ duration: 180 }} onclick={() => (drawer = false)}></button>
			{/if}
			<div class="drawer" class:open={drawer} inert={!drawer}>
				<Sidebar {app} mobile onclose={() => (drawer = false)} onnewchat={newChat} onsettings={() => (settingsOpen = true)} />
			</div>
		{:else if expanded}
			<div class="side">
				<Sidebar {app} mobile={false} onclose={() => setExpanded(false)} onnewchat={newChat} onsettings={() => (settingsOpen = true)} />
			</div>
		{:else}
			<div class="rail">
				<button class="icon-btn" aria-label="Open sidebar" title="Open sidebar" onclick={() => setExpanded(true)}>
					<Icon name="sidebar" />
				</button>
				<button class="icon-btn rail-new" aria-label="New chat" title="New chat" onclick={newChat}>
					<Icon name="newChat" size={16} />
				</button>
			</div>
		{/if}

		<main class="main">
			<header class="top">
				{#if mobile}
					<button class="icon-btn" aria-label="Open sidebar" onclick={() => (drawer = true)}><Icon name="menu" /></button>
				{/if}
				<div class="title">
					{#if renaming}
						<input
							class="rename"
							bind:this={renameInput}
							bind:value={renameText}
							maxlength="120"
							aria-label="Chat title"
							onblur={commitRename}
							onkeydown={(e) => {
								if (e.key === 'Enter') commitRename();
								if (e.key === 'Escape') renaming = false;
							}}
						/>
					{:else if title && conv}
						<div class="title-wrap" use:outside>
							<button
								class="title-btn"
								aria-haspopup="menu"
								aria-expanded={titleMenu}
								onclick={() => (titleMenu = !titleMenu)}
							>
								<span>{title}</span>
								<Icon name="down" size={16} />
							</button>
							{#if titleMenu}
								<div class="menu title-menu" role="menu" transition:fade={{ duration: 120 }}>
									<button
										role="menuitem"
										onclick={() => {
											titleMenu = false;
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
											titleMenu = false;
											confirmDelete = true;
										}}
									>
										<Icon name="trash" size={16} /> Delete
									</button>
								</div>
							{/if}
						</div>
					{:else if mobile}
						<span class="brand"><Mark size={22} /> MayurGPT</span>
					{/if}
				</div>
				{#if mobile}
					<button class="icon-btn" aria-label="New chat" onclick={newChat}><Icon name="newChat" /></button>
				{/if}
			</header>

			{#if app.health === 'offline' || app.health === 'loading' || app.health === 'error'}
				<div class="banner" class:waking={app.health === 'loading'} role="status" transition:fade={{ duration: 200 }}>
					{#if app.health === 'loading'}
						<span class="pulse"></span> Mayur's waking up…
					{:else if app.phase === 'unconfigured'}
						Mayur isn't set up here yet 😴
					{:else if app.health === 'error'}
						Mayur's having trouble waking up. Try again in a bit.
					{:else}
						Mayur's offline right now (his laptop's asleep) 😴
					{/if}
				</div>
			{/if}

			<ChatView {app} />
		</main>
		<Settings {app} bind:open={settingsOpen} />
		<Dialog bind:open={confirmDelete} title="Delete chat?">
			<p class="confirm-text">“{title || 'New chat'}” will be deleted for good, along with every message in it.</p>
			<div class="confirm-actions">
				<button class="pill pill-outline" onclick={() => (confirmDelete = false)}>Cancel</button>
				<button
					class="pill pill-danger"
					onclick={() => {
						if (conv) app.deleteConversation(conv.id);
						confirmDelete = false;
					}}
				>
					Delete
				</button>
			</div>
		</Dialog>
	{/if}
</div>

{@render children()}

<style>
	.boot {
		flex: 1;
		display: grid;
		place-items: center;
		opacity: 0.6;
	}
	.side {
		width: 272px;
		flex-shrink: 0;
		animation: slide-in 200ms var(--ease);
	}
	.rail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 56px;
		flex-shrink: 0;
		padding: 12px 0;
		border-right: 1px solid var(--border);
		background: var(--bg-sidebar);
	}
	.rail-new {
		background: var(--accent);
		color: var(--accent-fg) !important;
		border-radius: 9999px !important;
		width: 30px !important;
		height: 30px !important;
		margin-top: 4px;
	}
	.rail-new:hover {
		background: var(--accent-hover) !important;
	}
	.drawer {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		z-index: 30;
		width: min(86vw, 300px);
		transform: translateX(-100%);
		transition: transform 240ms var(--ease);
		box-shadow: none;
	}
	.drawer.open {
		transform: none;
		box-shadow: var(--shadow-pop);
	}
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 20;
		background: var(--scrim);
	}
	.main {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 52px;
		flex-shrink: 0;
		padding: 0 12px;
	}
	.title {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		color: var(--text);
		font-size: 15.5px;
	}
	.title-wrap {
		position: relative;
		min-width: 0;
	}
	.title-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		height: 34px;
		padding: 0 8px;
		border-radius: 8px;
		transition: background 150ms var(--ease);
	}
	.title-btn:hover,
	.title-btn[aria-expanded='true'] {
		background: var(--bg-hover);
	}
	.title-btn span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.title-btn :global(svg) {
		color: var(--text-muted);
	}
	.title-menu {
		left: 0;
		top: calc(100% + 4px);
	}
	.rename {
		width: min(420px, 100%);
		height: 34px;
		padding: 0 10px;
		border-radius: 8px;
		border: 1px solid var(--accent);
		background: var(--surface);
		font-size: 16px;
		outline: none;
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
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-serif);
		font-size: 20px;
		font-weight: 400;
	}
	@media (max-width: 767px) {
		.title {
			justify-content: center;
		}
		.title-menu {
			left: 50%;
			transform: translateX(-50%);
		}
	}
	.banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin: 0 16px 8px;
		padding: 9px 14px;
		border-radius: 12px;
		background: var(--bg-raised);
		color: var(--text-muted);
		font-size: 14px;
		text-align: center;
	}
	.banner.waking {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.pulse {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 1.4s var(--ease) infinite;
		flex-shrink: 0;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateX(-8px);
		}
	}
</style>
