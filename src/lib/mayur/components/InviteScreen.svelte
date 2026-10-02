<script lang="ts">
	import type { MayurApp } from '../app.svelte';
	import Mark from './Mark.svelte';

	let { app }: { app: MayurApp } = $props();

	let mode = $state<'invite' | 'device'>('invite');
	let code = $state('');
	let name = $state('');

	function submit(e: Event) {
		e.preventDefault();
		if (!code.trim() || app.authBusy) return;
		if (mode === 'invite') app.signIn(code, null, name);
		else app.signIn(null, code);
	}
</script>

<div class="wrap">
	<form class="card" onsubmit={submit}>
		<Mark size={44} />
		<h1>Mayur</h1>
		{#if mode === 'invite'}
			<p>You need an invite code to text Mayur. Ask Anirudhan for one.</p>
			<input class="field" bind:value={code} placeholder="Invite code" autocomplete="off" spellcheck="false" aria-label="Invite code" />
			<input class="field" bind:value={name} placeholder="Your name (optional)" maxlength="60" autocomplete="given-name" aria-label="Your name" />
		{:else}
			<p>Enter the code from Settings → Use on another device on your other phone or laptop.</p>
			<input
				class="field mono"
				bind:value={code}
				placeholder="8-character code"
				maxlength="8"
				autocapitalize="characters"
				autocomplete="off"
				spellcheck="false"
				aria-label="Device code"
			/>
		{/if}
		{#if app.inviteError}<p class="err" role="alert">{app.inviteError}</p>{/if}
		<button class="pill pill-accent" disabled={!code.trim() || app.authBusy}>
			{app.authBusy ? 'Checking…' : 'Continue'}
		</button>
		<button
			type="button"
			class="switch"
			onclick={() => {
				mode = mode === 'invite' ? 'device' : 'invite';
				code = '';
				app.inviteError = null;
			}}
		>
			{mode === 'invite' ? 'Already texting Mayur on another device?' : 'I have an invite code'}
		</button>
	</form>
</div>

<style>
	.wrap {
		flex: 1;
		display: grid;
		place-items: center;
		padding: 16px;
		overflow-y: auto;
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		width: min(380px, 100%);
		padding: 32px 24px 24px;
		border-radius: 20px;
		border: 1px solid var(--border);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		text-align: center;
		animation: rise 240ms var(--ease);
	}
	h1 {
		margin: 4px 0 0;
		font-family: var(--font-serif);
		font-size: 36px;
		font-weight: 400;
		line-height: 1.1;
	}
	p {
		margin: 0 0 6px;
		color: var(--text-muted);
		font-size: 14.5px;
	}
	.pill {
		width: 100%;
		height: 42px;
		margin-top: 4px;
	}
	.mono {
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		text-align: center;
	}
	.mono::placeholder {
		font-family: var(--font-sans);
		text-transform: none;
		letter-spacing: 0;
	}
	.err {
		margin: 0;
		color: var(--danger);
		font-size: 13.5px;
	}
	.switch {
		color: var(--text-muted);
		font-size: 13.5px;
	}
	.switch:hover {
		color: var(--text);
		text-decoration: underline;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
</style>
