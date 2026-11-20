// Setup and run actions for one app; every answer is the app's fresh setup status.
export default defineEventHandler(async (event) => {
  const a = actionsFor(appOr404(getRouterParam(event, 'id')))
  const body: Record<string, string | undefined> = (await readBody(event).catch(() => null)) ?? {}
  try {
    switch (getRouterParam(event, 'action')) {
      case 'profile': a.saveProfile(body.text, body.base); break
      case 'draft': a.draftProfile().catch(() => {}); break // keeps going; the page polls setup
      case 'answer': a.answer(body.field, (body as Record<string, unknown>).value); break
      case 'keep': a.keep(body.field); break
      case 'convert': a.convertPlan().catch(() => {}); break // keeps going; the page polls setup
      case 'use-converted': a.useConverted(); break
      case 'drop-converted': a.dropConverted(); break
      case 'signin/start': a.signInStart(body.persona).catch(() => {}); break // keeps going; the page polls setup
      case 'signin/finish': await a.signInFinish(); break
      case 'run': a.startRun(body.kind, body.target, body.note); break
      case 'stop': a.stopRun(); break
      case 'lesson': a.addLesson(body.text, body.check); break
      case 'notes': a.setNotes(body.text); break
      case 'trigger': a.setTrigger(body.mode); break
      case 'hook': a.setHook(body.which, !!body.on); break
      case 'onboarded': a.finishOnboarding(); break
      default: throw createError({ statusCode: 404, statusMessage: 'not found' })
    }
    return a.status()
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode) throw e
    throw createError({ statusCode: 400, statusMessage: (e as Error).message })
  }
})
