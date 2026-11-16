// "Try it on a sample app": a tiny notes repo with one uncommitted change for Tess to test.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { addApp } from '~~/apps.js'

export default defineEventHandler(() => {
  const src = join(process.env.UT_HOME ?? process.cwd(), 'sample-app')
  const dest = join(process.env.ULTIMATE_TESTER_HOME ?? join(homedir(), '.ultimate-tester'), 'sample-app')
  if (!existsSync(join(dest, '.git'))) {
    mkdirSync(dest, { recursive: true })
    copyFileSync(join(src, 'server.js'), join(dest, 'server.js'))
    copyFileSync(join(src, '.ultimate-tester.md'), join(dest, '.ultimate-tester.md'))
    copyFileSync(join(src, 'gitignore'), join(dest, '.gitignore'))
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=Ultimate Tester', '-c', 'user.email=tester@localhost', ...a], { cwd: dest, stdio: 'ignore' })
    git('init', '-q', '-b', 'main')
    git('add', '.')
    git('commit', '-q', '-m', 'Notes app')
    copyFileSync(join(src, 'server.next.js'), join(dest, 'server.js'))
  }
  return addApp(dest)
})
