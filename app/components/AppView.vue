<script setup lang="ts">
import { PhPlus, PhTrash, PhGearSix } from '@phosphor-icons/vue'
// One app: where it stands, how to start a test, and every test so far. Settings live in the Settings window.
const { state, startTest, openRun, show, openSettings, api, refresh, removeApp, fromFolder } = useTester()
// Tests start from the checkout where the work is (newest by default); Change opens the full picker.
const from = computed(() => (state.work && state.work.folders.length > 1 ? fromFolder() : null))
const fromName = (f: NonNullable<ReturnType<typeof fromFolder>>) => (f.main ? 'main folder' : f.path.split('/').at(-1))
const app = computed(() => state.apps.find((a) => a.id === state.appId)!)
const s = computed(() => state.setup!)
const running = computed(() => !!s.value.running)
// What's left before Tess can test properly, in plain words.
const unfinished = computed(() => {
  if (!s.value.onboarded && !state.runs.length) return { why: 'Tess hasn\'t been set up for this app yet.', act: 'Finish setup', go: () => show('onboard') }
  if (!s.value.profileReady) return { why: 'There is no test plan yet.', act: 'Finish setup', go: () => openSettings('app') }
  if (!s.value.allSignedIn) return { why: 'Some people Tess tests as aren\'t signed in, so their checks can\'t run.', act: 'Sign in', go: () => openSettings('app') }
  return null
})
const targets = computed(() => targetsFor(s.value.remotes))
// A failed test that a later test of the same kind passed: the problem was fixed since.
function fixedLater(i: number) {
  const r = state.runs[i]!
  return r.status === 'fail' && state.runs.slice(0, i).some((n) => n.status === 'pass' && n.kind === r.kind)
}
const ask = (message: string, title: string, okLabel: string) => askConfirm({ title, message, okLabel, danger: true })
async function remove(id: string, title: string) {
  if (!(await ask(`Its screenshots and report are deleted. This can't be undone.`, `Delete "${short(title)}"?`, 'Delete'))) return
  try { await api(`/api/apps/${state.appId}/runs/${id}`, undefined, 'DELETE'); refresh() } catch (e) { state.flash = (e as Error).message }
}
</script>

<template>
  <section class="flex-1 min-w-0 min-h-0 overflow-y-auto">
    <div class="max-w-3xl mx-auto px-10 py-10 flex flex-col gap-8">
      <div class="flex items-end gap-4">
        <div class="min-w-0 flex-1">
          <h1 class="font-[family-name:var(--font-serif)] text-[34px] leading-[1.12] font-semibold tracking-[-0.015em] truncate">{{ app.name }}</h1>
          <p class="mt-1 text-[12.5px] text-[var(--muted)] truncate selectable">{{ app.root.replace(/^\/Users\/[^/]+/, '~') }}</p>
        </div>
        <button class="btn shrink-0" @click="openSettings('app')"><PhGearSix class="size-4" aria-hidden="true" />Settings</button>
      </div>

      <div v-if="unfinished" class="rounded-2xl surface px-5 py-4 flex items-center gap-4">
        <p class="flex-1">{{ unfinished.why }}</p>
        <button class="btn-blue shrink-0" @click="unfinished.go()">{{ unfinished.act }}</button>
      </div>

      <div class="flex flex-col gap-3">
        <h2 class="font-[family-name:var(--font-serif)] text-[20px] font-semibold">New test</h2>
        <p v-if="from" class="text-[13px] text-[var(--muted)] flex flex-wrap items-center gap-x-1.5">
          From <b class="font-medium text-[var(--ink)]">{{ from.branch ?? 'no branch' }}</b> · {{ fromName(from) }} · {{ ago(from.activeAt) }}
          <button class="link-quiet" @click.stop="state.menu = 'new'">Change</button>
        </p>
        <div class="flex flex-wrap gap-2">
          <button v-for="(t, i) in targets" :key="t.label" :class="i === 0 ? 'btn-blue' : 'btn'" :disabled="running || !s.profileReady" :title="t.hint" @click="startTest(t)">{{ t.label }}</button>
          <button class="btn" :disabled="running || !s.profileReady" @click="startTest({ kind: 'custom' })"><PhPlus class="size-4" aria-hidden="true" />Something else</button>
        </div>
        <p v-if="running" class="text-[12.5px] text-[var(--muted)] flex items-center gap-2"><span class="tess size-3.5 rounded-full breathe" aria-hidden="true" />I'm testing now. <button class="link" @click="openRun(state.runs[0]!.id, true)">Watch</button></p>
      </div>

      <div class="flex flex-col gap-3">
        <h2 class="font-[family-name:var(--font-serif)] text-[20px] font-semibold">Tests</h2>
        <div v-if="!state.runs.length" class="rounded-2xl surface px-6 py-7 text-center flex flex-col items-center gap-2">
          <span class="tess size-[22px] rounded-full" aria-hidden="true" />
          <p class="text-[var(--text-2)]">I haven't tested anything here yet.<br>Make a change, or start a test above. It usually takes 3 to 10 minutes.</p>
        </div>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="(r, i) in state.runs" :key="r.id" class="group flex items-center rounded-[10px] hover:bg-[var(--row-hover)]">
            <button class="flex-1 min-w-0 text-start flex items-center gap-2.5 p-2.5 rounded-[10px]" @click="openRun(r.id, r.status === 'running')">
              <component :is="statusOf(r.status).icon" :class="['size-[17px] shrink-0', statusOf(r.status).cls]" aria-hidden="true" />
              <span class="sr-only">{{ statusOf(r.status).word }}: </span>
              <span class="flex-1 min-w-0">
                <span class="block truncate text-[14px] font-medium">{{ short(r.title) }}</span>
                <span class="block text-[12.5px] text-[var(--muted)]">{{ outcome(r) }}<template v-if="fixedLater(i)"> · passed later</template></span>
              </span>
              <span class="text-[12.5px] text-[var(--muted)] tabular-nums shrink-0">{{ when(r.id) }}</span>
            </button>
            <button class="me-1.5 btn-plain px-2 text-[var(--muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100" :aria-label="`Delete test ${short(r.title)}`" :disabled="r.status === 'running'" @click="remove(r.id, r.title)"><PhTrash class="size-4" aria-hidden="true" /></button>
          </li>
        </ul>
      </div>

      <div class="pt-2 border-t border-[var(--line)]">
        <button class="link-quiet text-[12px]" :disabled="running" @click="removeApp(app.id)">Remove {{ app.name }} from Ultimate Tester…</button>
      </div>
    </div>
  </section>
</template>
