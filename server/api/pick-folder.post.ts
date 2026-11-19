import { execFile } from 'node:child_process'

// The browser can't hand over a folder path, so the engine (on the same Mac) shows Finder's own folder picker.
export default defineEventHandler(() => new Promise<{ path: string | null }>((done, fail) => {
  if (process.platform !== 'darwin') return fail(createError({ statusCode: 501, statusMessage: 'No folder picker here' }))
  execFile('osascript', ['-e', 'activate', '-e', `POSIX path of (choose folder with prompt "Choose your app's repo folder")`], { timeout: 300_000 }, (err, out, stderr) => {
    // Cancel (-128) means no folder; any other failure lets the page ask for the path instead.
    if (err && !/-128/.test(stderr)) return fail(createError({ statusCode: 500, statusMessage: 'Folder picker failed' }))
    done({ path: err ? null : out.trim().replace(/\/$/, '') || null })
  })
}))
