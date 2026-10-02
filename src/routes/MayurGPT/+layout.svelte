<script lang="ts">
	import '$lib/mayur/mayur.css';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { BASE, MayurApp } from '$lib/mayur/app.svelte';
	import ChatView from '$lib/mayur/components/ChatView.svelte';
	import Icon from '$lib/mayur/components/Icon.svelte';
	import InviteScreen from '$lib/mayur/components/InviteScreen.svelte';
	import Mark from '$lib/mayur/components/Mark.svelte';
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

	const FAVICON =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M8 2h16a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H13l-6 4v-4.3A6 6 0 0 1 2 20V8a6 6 0 0 1 6-6Z" fill="#c05b2e"/><path d="M9 20v-6.2a2.8 2.8 0 0 1 5.6 0V20m0-6.2a2.8 2.8 0 0 1 5.6 0V20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23.6" cy="19.6" r="1.6" fill="#fff"/></svg>'
		);
</script>

<svelte:head>
	<title>{title ? `${title} · MayurGPT` : 'MayurGPT'}</title>
	<meta name="description" content="Text Mayur, whenever." />
	<meta property="og:title" content="MayurGPT" />
	<meta property="og:description" content="Text Mayur, whenever." />
	<meta property="og:type" content="website" />
	<meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#1a1917" media="(prefers-color-scheme: dark)" />
	<link rel="icon" href={FAVICON} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap"
	/>
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
					{#if title}
						<span>{title}</span>
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
		font-size: 14.5px;
		font-weight: 500;
	}
	.title > span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-serif);
		font-size: 21px;
		font-weight: 400;
	}
	@media (max-width: 767px) {
		.title {
			justify-content: center;
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
