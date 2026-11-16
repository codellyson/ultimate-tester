// What Tess needs on this Mac before the first test: Claude Code signed in, Chrome, and Node.
import { execFileSync } from 'node:child_process'
import { CHROME } from '~~/live.js'

export default defineEventHandler(() => {
  let claude: { ok: boolean, plan: string | null, apiKey: boolean } = { ok: false, plan: null, apiKey: !!process.env.ANTHROPIC_API_KEY }
  try {
    const s = JSON.parse(execFileSync('claude', ['auth', 'status'], { encoding: 'utf8', timeout: 10_000 }))
    claude = { ok: !!s.loggedIn || !!s.authMethod, plan: s.subscriptionType ?? null, apiKey: claude.apiKey }
  } catch {}
  return { claude, chrome: !!CHROME, node: process.versions.node }
})
