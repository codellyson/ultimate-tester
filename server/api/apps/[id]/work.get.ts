// Every checkout of the app's repo (main folder and worktrees), newest activity first, for "Where's the work?".
export default defineEventHandler((event) => actionsFor(appOr404(getRouterParam(event, 'id'))).work())
