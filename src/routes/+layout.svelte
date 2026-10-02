<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { fade } from 'svelte/transition';

	let { children } = $props();
</script>

<svelte:head>
	{#if !$page.url.pathname.startsWith('/MayurGPT')}
		<title>Anirudhan Vijay</title>
	{/if}
</svelte:head>

<!-- MayurGPT is a full-screen app with its own chrome; it skips the diary's page frame and transitions -->
{#if $page.url.pathname.startsWith('/MayurGPT')}
	{@render children()}
{:else}
	<div class="vignette"></div>

	<div style="min-height: 100vh; display: flex; flex-direction: column;">
		<main style="flex: 1; display: flex; flex-direction: column; max-width: 580px; width: 100%; margin: 0 auto; padding: 4rem clamp(1.2rem, 5vw, 2.5rem) 2rem; position: relative; overflow: visible;">
			{#key $page.url.pathname}
				<div in:fade={{ duration: 250, delay: 80 }} style="flex: 1; display: flex; flex-direction: column;">
					{@render children()}
				</div>
			{/key}
		</main>
	</div>
{/if}
