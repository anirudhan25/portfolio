<script lang="ts">
	import { BASE, type MayurApp } from '../app.svelte';
	import Dialog from './Dialog.svelte';
	import Icon from './Icon.svelte';

	let { app, open = $bindable(false) }: { app: MayurApp; open: boolean } = $props();

	let name = $state('');
	let code = $state<{ code: string; expires: number } | null>(null);
	let codeError = $state<string | null>(null);
	let left = $state(0);
	let redeem = $state('');
	let redeemError = $state<string | null>(null);
	let redeeming = $state(false);
	let confirm = $state<'forget' | 'delete' | null>(null);
	let linkCopied = $state(false);

	$effect(() => {
		if (open) {
			name = app.user?.name ?? '';
			confirm = null;
			redeem = '';
			redeemError = null;
		}
	});

	$effect(() => {
		if (!code) return;
		const tickDown = () => (left = Math.max(0, Math.round((code!.expires - Date.now()) / 1000)));
		tickDown();
		const t = setInterval(() => {
			tickDown();
			if (left === 0) code = null;
		}, 1000);
		return () => clearInterval(t);
	});

	async function getCode() {
		codeError = null;
		try {
			const r = await app.makeTransferCode();
			code = { code: r.code, expires: Date.now() + r.expires_in * 1000 };
		} catch {
			codeError = "couldn't make a code right now";
		}
	}

	async function copyLink() {
		if (!code) return;
		try {
			await navigator.clipboard.writeText(`${location.origin}${BASE}?device=${code.code}`);
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 1500);
		} catch {
			/* clipboard blocked */
		}
	}

	async function useCode() {
		if (!redeem.trim()) return;
		redeeming = true;
		redeemError = await app.redeemTransfer(redeem);
		redeeming = false;
		if (!redeemError) open = false;
	}

	const mmss = $derived(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
</script>

<Dialog bind:open title="Settings">
	<section>
		<label for="mg-name">What should Mayur call you?</label>
		<form
			class="inline"
			onsubmit={(e) => {
				e.preventDefault();
				app.setName(name);
			}}
		>
			<input id="mg-name" class="field" bind:value={name} maxlength="60" placeholder="Your name" autocomplete="given-name" />
			<button class="pill pill-outline" disabled={name.trim() === (app.user?.name ?? '')}>Save</button>
		</form>
	</section>

	<section>
		<h3><Icon name="phone" size={16} /> Use on another device</h3>
		<p class="muted">Get a one-time code here, then enter it on your other phone or laptop to see the same chats.</p>
		{#if code}
			<div class="code">
				<span class="code-text">{code.code}</span>
				<span class="muted small">expires in {mmss}</span>
			</div>
			<button class="link" onclick={copyLink}>{linkCopied ? 'Link copied' : 'Copy a sign-in link instead'}</button>
		{:else}
			<button class="pill pill-outline" onclick={getCode}>Get a code</button>
			{#if codeError}<p class="err">{codeError}</p>{/if}
		{/if}
		<form
			class="inline redeem"
			onsubmit={(e) => {
				e.preventDefault();
				useCode();
			}}
		>
			<input
				class="field mono"
				bind:value={redeem}
				maxlength="8"
				placeholder="Code from another device"
				autocapitalize="characters"
				autocomplete="off"
				spellcheck="false"
			/>
			<button class="pill pill-outline" disabled={!redeem.trim() || redeeming}>Use</button>
		</form>
		{#if redeemError}<p class="err">{redeemError}</p>{/if}
	</section>

	<section>
		<h3>Your data</h3>
		{#if confirm === 'forget'}
			<p class="warn">This device will forget your chats. You can only get them back with a code from another device.</p>
			<div class="row">
				<button class="pill pill-outline" onclick={() => (confirm = null)}>Cancel</button>
				<button class="pill pill-danger" onclick={() => ((open = false), app.forgetDevice())}>Forget this device</button>
			</div>
		{:else if confirm === 'delete'}
			<p class="warn">Every chat you've had with Mayur will be deleted, on all your devices. This can't be undone.</p>
			<div class="row">
				<button class="pill pill-outline" onclick={() => (confirm = null)}>Cancel</button>
				<button class="pill pill-danger" onclick={() => ((open = false), app.deleteEverything())}>Delete everything</button>
			</div>
		{:else}
			<div class="row">
				<button class="pill pill-outline" onclick={() => (confirm = 'forget')}>
					<Icon name="logout" size={15} /> Forget this device
				</button>
				<button class="pill pill-outline danger-text" onclick={() => (confirm = 'delete')}>
					<Icon name="trash" size={15} /> Delete all my chats
				</button>
			</div>
		{/if}
	</section>
</Dialog>

<style>
	section {
		padding: 14px 0;
		border-top: 1px solid var(--border);
	}
	section:first-of-type {
		border-top: 0;
		padding-top: 0;
	}
	label,
	h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 8px;
		font-size: 14px;
		font-weight: 500;
	}
	.muted {
		margin: 0 0 10px;
		color: var(--text-muted);
		font-size: 13.5px;
	}
	.small {
		margin: 0;
		font-size: 12.5px;
	}
	.inline {
		display: flex;
		gap: 8px;
	}
	.inline .pill {
		height: 40px;
		flex-shrink: 0;
	}
	.redeem {
		margin-top: 12px;
	}
	.mono {
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.mono::placeholder {
		font-family: var(--font-sans);
		text-transform: none;
		letter-spacing: 0;
	}
	.code {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--bg-raised);
	}
	.code-text {
		font-family: var(--font-mono);
		font-size: 24px;
		font-weight: 400;
		letter-spacing: 0.14em;
		user-select: all;
	}
	.link {
		margin-top: 8px;
		color: var(--accent);
		font-size: 13.5px;
	}
	.link:hover {
		text-decoration: underline;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.row .pill {
		height: 34px;
		padding: 0 14px;
		font-size: 13.5px;
	}
	.danger-text {
		color: var(--danger);
	}
	.warn {
		margin: 0 0 10px;
		font-size: 13.5px;
		color: var(--danger);
	}
	.err {
		margin: 8px 0 0;
		color: var(--danger);
		font-size: 13px;
	}
</style>
