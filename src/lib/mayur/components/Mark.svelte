<script lang="ts">
	// MayurGPT's mark: a terracotta tile with a hand-drawn "m" and a speech-bubble tail.
	let { size = 24 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style="flex-shrink:0">
	<path d="M8 2h16a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H13l-6 4v-4.3A6 6 0 0 1 2 20V8a6 6 0 0 1 6-6Z" fill="var(--accent, #c05b2e)" />
	<path
		d="M9 20v-6.2a2.8 2.8 0 0 1 5.6 0V20m0-6.2a2.8 2.8 0 0 1 5.6 0V20"
		fill="none"
		stroke="var(--accent-fg, #fff)"
		stroke-width="2.4"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<circle cx="23.6" cy="19.6" r="1.6" fill="var(--accent-fg, #fff)" />
</svg>
