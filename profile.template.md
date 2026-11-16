# Ultimate Tester profile

## Start
- Command: npm run dev
- Ready when: http://localhost:3000 returns 200
- Seed: (command that resets test data, or "none")

## Allowed URLs
- http://localhost:3000

## Test accounts
- One saved sign-in per persona, made in Ultimate Tester setup. Never a password here.

## Personas
- owner: (who they are, e.g. store owner on the top plan)
- visitor: Signed-out visitor, no sign-in

## Must never break
- (one line per critical flow, e.g. "Sign up, then sign in")

## Existing checks
- (e.g. npm test)

## Notes for Tess
- (anything Tess should always know: areas to focus on, things to skip, known quirks)
