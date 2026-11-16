export default defineEventHandler((event) => actionsFor(appOr404(getRouterParam(event, 'id'))).status())
