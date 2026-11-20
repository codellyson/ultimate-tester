import { voiceStatus } from '~~/voice.js'

// Whether Tess's Kokoro voice is ready, being set up, or off.
export default defineEventHandler(() => voiceStatus())
