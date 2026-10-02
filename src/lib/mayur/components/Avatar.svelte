<script lang="ts">
	// Mayur's head under his latest reply, where Claude shows its spark. While he's working the head bobs
	// and tilts, like he's typing; queued replies just breathe.
	import { HEAD } from './Mark.svelte';

	let { state, size = 30 }: { state: 'idle' | 'busy' | 'queued'; size?: number } = $props();
</script>

<span class="avatar {state}" style="--size:{size}px" role={state === 'idle' ? undefined : 'status'} aria-label={state === 'idle' ? undefined : 'Mayur is replying'}>
	<img src={HEAD} alt="" draggable="false" />
</span>

<style>
	.avatar {
		position: relative;
		display: grid;
		place-items: center;
		width: var(--size);
		height: var(--size);
		flex-shrink: 0;
	}
	img {
		width: var(--size);
		height: var(--size);
		transform-origin: 50% 85%;
		object-fit: contain;
		user-select: none;
	}
	.busy img {
		animation: bob 1.1s ease-in-out infinite;
	}
	.queued img {
		animation: breathe 2s var(--ease) infinite;
	}
	/* a nod-and-tilt, like he's thinking it over */
	@keyframes bob {
		0%,
		100% {
			transform: translateY(0) rotate(0deg) scale(1);
		}
		25% {
			transform: translateY(-4px) rotate(-8deg) scale(1.04);
		}
		50% {
			transform: translateY(0) rotate(0deg) scale(1);
		}
		75% {
			transform: translateY(-4px) rotate(8deg) scale(1.04);
		}
	}
	@keyframes breathe {
		50% {
			opacity: 0.55;
			transform: scale(0.94);
		}
	}
</style>
