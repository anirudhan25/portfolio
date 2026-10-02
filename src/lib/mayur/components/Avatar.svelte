<script lang="ts">
	// Mayur's head beside his latest reply. While he's working on it, a ring spins around it and the head
	// bobs, like Claude's or ChatGPT's working indicator; queued replies just breathe.
	import { HEAD } from './Mark.svelte';

	let { state }: { state: 'idle' | 'busy' | 'queued' } = $props();
</script>

<span class="avatar {state}" role={state === 'idle' ? undefined : 'status'} aria-label={state === 'idle' ? undefined : 'Mayur is replying'}>
	<img src={HEAD} alt="" draggable="false" />
</span>

<style>
	.avatar {
		position: relative;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		flex-shrink: 0;
	}
	img {
		width: 26px;
		height: 26px;
		object-fit: contain;
		user-select: none;
	}
	/* a short accent arc that orbits the head */
	.avatar::before {
		content: '';
		position: absolute;
		inset: -3px;
		border-radius: 50%;
		background: conic-gradient(from 0deg, transparent 0 62%, var(--accent) 100%);
		-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
		mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
		opacity: 0;
		transition: opacity 200ms var(--ease);
	}
	.busy::before {
		opacity: 1;
		animation: orbit 0.9s linear infinite;
	}
	.busy img {
		animation: bob 1.2s var(--ease) infinite;
	}
	.queued img {
		animation: breathe 2s var(--ease) infinite;
	}
	@keyframes orbit {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes bob {
		0%,
		100% {
			transform: translateY(0) rotate(0deg);
		}
		30% {
			transform: translateY(-1.5px) rotate(-4deg);
		}
		60% {
			transform: translateY(0.5px) rotate(3deg);
		}
	}
	@keyframes breathe {
		50% {
			opacity: 0.55;
			transform: scale(0.94);
		}
	}
</style>
