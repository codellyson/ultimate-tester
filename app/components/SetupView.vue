<script setup lang="ts">
// Getting ready: Tess asks one thing at a time.
const { state, setupAction, startTest } = useTester()
const s = computed(() => state.setup!)
const app = computed(() => state.apps.find((a) => a.id === state.appId)!)
const drafting = computed(() => s.value.job.kind === 'draft' && s.value.job.status === 'working')
const needs = computed(() => s.value.personas.filter((p) => p.signIn && !p.savedAt))

// The installed trigger, changed in place: picking one installs it and removes the other.
const savingTrigger = ref(false)
const trigger = computed<'stop' | 'commit' | 'manual'>({
  get: () => (s.value.triggers.stop ? 'stop' : s.value.triggers.commit ? 'commit' : 'manual'),
  set: async (mode) => { savingTrigger.value = true; await setupAction('trigger', { mode }); savingTrigger.value = false },
})
async function draft() { if (await setupAction('draft')) state.confirmJustDrafted = true }
</script>

<template>
  <section class="flex-1 min-w-0 min-h-0 overflow-y-auto">
    <div class="max-w-3xl mx-auto px-10 py-10 flex flex-col gap-6">
      <h1 v-if="!state.inSettings" class="display text-[26px] leading-tight font-medium text-balance">{{ s.profileReady && s.allSignedIn ? `How Tess tests ${app.name}` : `Setting up ${app.name}` }}</h1>

      <template v-if="!s.profileReady || drafting">
        <TessSays v-if="drafting">Reading {{ app.name }}… I'm looking at how it starts, what it talks to, who uses it and what they do most.</TessSays>
        <TessSays v-else>
          I haven't met {{ app.name }} yet. Let me read the repo and work out how to test it. You'll get to check everything before I touch anything.
          <template #actions>
            <button class="btn-blue self-start" @click="draft">Read my repo</button>
            <p v-if="s.job.kind === 'draft' && s.job.status === 'error'" class="text-[var(--bad)]">{{ s.job.message }}</p>
          </template>
        </TessSays>
      </template>

      <template v-else>
        <TessSays>{{ state.confirmJustDrafted ? `I read ${app.name}. Here's how I'll test it. Fix anything that's wrong; I'll follow this exactly.` : `Here's how I test ${app.name}. Change anything, any time.` }}</TessSays>
        <div class="ms-12 flex flex-col gap-3">
          <h2 class="text-[13px] font-medium text-[var(--muted)]">How I test this app</h2>
          <ProfileCard :profile="s.profile" />
          <button v-if="state.confirmJustDrafted" class="btn-blue self-start" @click="state.confirmJustDrafted = false">Looks right</button>
        </div>

        <template v-if="!state.confirmJustDrafted">
          <TessSays>{{ needs.length ? `Different people see different things in ${app.name}, so I test as each of these. Sign me in once as the ones that need it, with test accounts, your usual way. I keep each session on this Mac and never see a password.` : `These are the people I test as. Everyone's ready.` }}</TessSays>
          <div class="ms-12 flex flex-col gap-3">
            <h2 class="text-[13px] font-medium text-[var(--muted)]">Who I test as</h2>
            <PersonaList />
          </div>
          <TessSays>When should I test {{ app.name }}?</TessSays>
          <div class="ms-12 max-w-2xl flex flex-col gap-2">
            <h2 class="text-[13px] font-medium text-[var(--muted)]">When I test</h2>
            <TriggerPicker v-model="trigger" :disabled="savingTrigger" />
          </div>
          <!-- Settings only configures; tests start from the main window (⌘N), so this window never turns into a test. -->
          <TessSays v-if="!needs.length && !state.inSettings">
            All set. What should I test?
            <template #actions>
              <div class="flex flex-wrap gap-2">
                <button v-for="t in targetsFor(s.remotes).slice(0, 3)" :key="t.label" class="btn" :disabled="s.running" @click="startTest(t)">{{ t.label }}</button>
              </div>
            </template>
          </TessSays>
        </template>
      </template>
    </div>
  </section>
</template>
