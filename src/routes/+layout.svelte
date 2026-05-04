<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { fade } from 'svelte/transition';

	let { children } = $props();
</script>

<svelte:head>
	<title>Anirudhan Vijay</title>
</svelte:head>

<div class="vignette"></div>

<main style="max-width: 580px; margin: 0 auto; padding: 4rem 2.5rem 6rem; position: relative; overflow: visible;">
	{#key $page.url.pathname}
		<div in:fade={{ duration: 250, delay: 80 }}>
			{@render children()}
		</div>
	{/key}
</main>
