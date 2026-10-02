<script lang="ts">
	import type { MayurApp } from '../app.svelte';
	import type { ThreadItem } from '../tree';
	import Branches from './Branches.svelte';
	import CopyButton from './CopyButton.svelte';
	import Icon from './Icon.svelte';
	import Thinking from './Thinking.svelte';

	let { app, item, isLast, locked }: { app: MayurApp; item: ThreadItem; isLast: boolean; locked: boolean } =
		$props();

	const msg = $derived(item.msg);
	const pending = $derived(msg.status === 'pending');
	const state = $derived(msg.live?.state);
	// a reply is a burst of texts: one per line of content
	const parts = $derived(msg.content.split('\n').filter((l) => l.trim()));
	const thinkingActive = $derived(pending && !!msg.thinking && msg.thinking.seconds == null && !msg.content);
	const waiting = $derived(pending && !msg.content && !msg.preface && !msg.thinking && state !== 'queued');
	const writing = $derived(pending && state === 'writing');
	const failed = $derived(msg.status === 'error' || !!msg.error);
	const temp = $derived(msg.id.startsWith('tmp-'));
</script>

<div class="assistant" class:pending>
	{#if state === 'queued' && pending && !msg.content}
		<p class="queue">
			Mayur's replying to someone else…{#if msg.live?.position}&nbsp;({msg.live.position} ahead){/if}
		</p>
	{/if}

	{#if msg.preface}
		<p class="text">{msg.preface}</p>
	{/if}

	{#if msg.thinking}
		<Thinking thinking={msg.thinking} active={thinkingActive} />
	{/if}

	{#each parts as part, i (i)}
		<p class="text">{part}{#if writing && i === parts.length - 1}<span class="caret" aria-hidden="true"></span>{/if}</p>
	{/each}

	{#if waiting}
		<div class="dots" aria-label="Mayur is typing"><span></span><span></span><span></span></div>
	{:else if writing && !parts.length && !thinkingActive}
		<p class="text"><span class="caret" aria-hidden="true"></span></p>
	{/if}

	{#if failed}
		<div class="error" role="alert">
			<Icon name="alert" size={16} />
			<span>{msg.error || "Mayur couldn't reply to this one."}</span>
			{#if !pending && !temp}
				<button class="pill pill-outline" disabled={app.busy} onclick={() => app.retry(msg.id)}>
					<Icon name="retry" size={14} /> Retry
				</button>
			{/if}
		</div>
	{/if}

	{#if !pending && !temp}
		<div class="actions" class:last={isLast}>
			{#if msg.status === 'stopped'}<span class="note">stopped</span>{/if}
			{#if msg.content}<CopyButton text={msg.content} />{/if}
			{#if isLast && !failed}
				<button class="icon-btn" aria-label="Retry" title="Retry" disabled={app.busy} onclick={() => app.retry(msg.id)}>
					<Icon name="retry" size={15} />
				</button>
			{/if}
			<Branches {app} {item} {locked} />
		</div>
	{/if}
</div>

<style>
	.assistant {
		margin: 8px 0 4px;
		font-size: 16px;
		line-height: 1.6;
	}
	.text {
		margin: 0 0 6px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		animation: rise 200ms var(--ease);
	}
	.queue {
		margin: 0 0 6px;
		color: var(--text-muted);
		font-size: 14px;
		font-style: italic;
	}
	.caret {
		display: inline-block;
		width: 2px;
		height: 1.05em;
		margin-left: 2px;
		vertical-align: -0.15em;
		background: var(--accent);
		border-radius: 1px;
		animation: blink 1s steps(1) infinite;
	}
	.dots {
		display: inline-flex;
		gap: 4px;
		padding: 10px 0;
	}
	.dots span {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-faint);
		animation: bounce 1.2s var(--ease) infinite;
	}
	.dots span:nth-child(2) {
		animation-delay: 0.15s;
	}
	.dots span:nth-child(3) {
		animation-delay: 0.3s;
	}
	.error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		margin: 6px 0;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 14px;
	}
	.error span {
		flex: 1;
		min-width: 0;
	}
	.error .pill {
		height: 30px;
		padding: 0 12px;
		font-size: 13px;
		color: var(--text);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: -6px;
		opacity: 0;
		transition: opacity 150ms var(--ease);
	}
	.assistant:hover .actions,
	.actions.last,
	.actions:focus-within {
		opacity: 1;
	}
	@media (hover: none) {
		.actions {
			opacity: 1;
		}
	}
	.actions :global(.icon-btn) {
		width: 28px;
		height: 28px;
	}
	.note {
		padding: 0 6px;
		color: var(--text-faint);
		font-size: 12.5px;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
	@keyframes bounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
			opacity: 0.5;
		}
		30% {
			transform: translateY(-4px);
			opacity: 1;
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}
</style>
