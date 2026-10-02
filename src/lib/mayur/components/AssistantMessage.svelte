<script lang="ts">
	import type { MayurApp } from '../app.svelte';
	import type { ThreadItem } from '../tree';
	import Avatar from './Avatar.svelte';
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
	const writing = $derived(pending && state === 'writing');
	const failed = $derived(msg.status === 'error' || !!msg.error);
	const temp = $derived(msg.id.startsWith('tmp-'));
	const avatar = $derived(!pending ? 'idle' : state === 'queued' ? 'queued' : 'busy');
</script>

<div class="assistant" class:pending>
	<div class="content">
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

		{#if writing && !parts.length && !thinkingActive}
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
	</div>

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

	{#if isLast}
		<div class="head"><Avatar state={avatar} size={40} /></div>
	{/if}
</div>

<style>
	.assistant {
		margin: 8px 0 4px;
		font-family: var(--font-reply);
		font-size: 17px;
		line-height: 1.65;
	}
	/* Mayur's head under his newest reply, where Claude puts its spark */
	.head {
		margin: 14px 0 4px -2px;
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
		font-family: var(--font-sans);
		font-size: 14px;
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
		font-family: var(--font-sans);
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
		font-family: var(--font-sans);
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
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}
</style>
