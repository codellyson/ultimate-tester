<template>
  <!-- One line from Tess; it rises in once when it first appears, never on later re-renders. -->
  <div class="flex gap-3 max-w-xl rise">
    <div class="tess size-9 shrink-0 rounded-full shadow-sm" aria-hidden="true" />
    <div class="flex flex-col gap-3 pt-1">
      <p class="display text-[17px] leading-relaxed"><slot /></p>
      <slot name="actions" />
    </div>
  </div>
</template>
