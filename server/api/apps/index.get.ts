import { listApps } from '~~/apps.js'

export default defineEventHandler(() => listApps().map((app: { id: string, root: string, name: string }) => {
  const last = runsOf(app.root)[0]
  const s = actionsFor(app).status()
  return { ...app, profileReady: s.profileReady, signedIn: s.allSignedIn, onboarded: s.onboarded, running: s.running, last: last ? runInfo(app.root, last) : null }
}))
