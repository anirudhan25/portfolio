<script lang="ts">
	import Icon from './Icon.svelte';

	let { text }: { text: string } = $props();
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard blocked */
		}
	}
</script>

<button class="icon-btn" aria-label={copied ? 'Copied' : 'Copy'} title={copied ? 'Copied' : 'Copy'} onclick={copy}>
	<Icon name={copied ? 'check' : 'copy'} size={15} />
</button>
