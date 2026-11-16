<script setup lang="ts">
// Under a profile edit: the file changed on disk meanwhile, or Esc is about to throw the changes away.
defineProps<{ changed: boolean, esc: boolean }>()
</script>

<template>
  <p v-if="changed" class="text-[12px] text-[var(--warn)]" role="alert">Tess changed this part while you were editing (she may have learned something). Copy your text, press Cancel to see the latest, then edit again.</p>
  <p v-else-if="esc" class="text-[12px] text-[var(--muted)]" role="status">Press Esc again to discard your changes.</p>
</template>
