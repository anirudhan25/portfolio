<script lang="ts" module>
	export const HEAD = '/mayurgpt/mayur-head.png';
</script>

<script lang="ts">
	// MayurGPT's mark: Mayur's head, cut out.
	let { size = 24 }: { size?: number } = $props();
</script>

<img src={HEAD} alt="" width={size} height={size} draggable="false" style="flex-shrink:0;object-fit:contain" />
