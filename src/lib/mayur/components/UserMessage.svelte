<script lang="ts">
	import { tick } from 'svelte';
	import { MAX_CHARS } from '../api';
	import type { MayurApp } from '../app.svelte';
	import type { ThreadItem } from '../tree';
	import Branches from './Branches.svelte';
	import CopyButton from './CopyButton.svelte';
	import Icon from './Icon.svelte';

	let { app, item, locked }: { app: MayurApp; item: ThreadItem; locked: boolean } = $props();

	const msg = $derived(item.msg);
	const temp = $derived(msg.id.startsWith('tmp-'));

	let editing = $state(false);
	let text = $state('');
	let area = $state<HTMLTextAreaElement>();

	async function startEdit() {
		text = msg.content;
		editing = true;
		await tick();
		if (area) {
			grow();
			area.focus();
			area.setSelectionRange(text.length, text.length);
		}
	}

	function grow() {
		if (!area) return;
		area.style.height = 'auto';
		area.style.height = Math.min(area.scrollHeight, 320) + 'px';
	}

	function save() {
		const t = text.trim();
		if (!t || app.busy) return;
		editing = false;
		if (t === msg.content.trim()) return;
		app.send(t, msg.parent_id ?? 'root');
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') editing = false;
		else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {
			e.preventDefault();
			save();
		}
	}
</script>

<div class="user">
	{#if editing}
		<div class="edit">
			<textarea
				bind:this={area}
				bind:value={text}
				oninput={grow}
				{onkeydown}
				maxlength={MAX_CHARS}
				rows="1"
				aria-label="Edit message"
			></textarea>
			<div class="edit-actions">
				<button class="pill pill-outline" onclick={() => (editing = false)}>Cancel</button>
				<button class="pill pill-accent" onclick={save} disabled={!text.trim() || app.busy}>Send</button>
			</div>
		</div>
	{:else}
		<div class="bubble">{msg.content}</div>
		{#if !temp}
			<div class="actions">
				<CopyButton text={msg.content} />
				<button class="icon-btn" aria-label="Edit" title="Edit" disabled={app.busy} onclick={startEdit}>
					<Icon name="pencil" size={15} />
				</button>
				<Branches {app} {item} {locked} />
			</div>
		{/if}
	{/if}
</div>

<style>
	.user {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		margin: 20px 0 8px;
	}
	.bubble {
		max-width: min(85%, 600px);
		padding: 10px 16px;
		border-radius: 20px;
		background: var(--user-bubble);
		font-size: 16px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-top: 4px;
		opacity: 0;
		transition: opacity 150ms var(--ease);
	}
	.user:hover .actions,
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
	.edit {
		width: 100%;
		padding: 12px;
		border-radius: 20px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}
	textarea {
		display: block;
		width: 100%;
		border: 0;
		outline: none;
		resize: none;
		background: transparent;
		padding: 2px 4px;
		font-size: 16px;
		line-height: 1.5;
	}
	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 8px;
	}
	.edit-actions .pill {
		height: 32px;
		padding: 0 14px;
	}
</style>
