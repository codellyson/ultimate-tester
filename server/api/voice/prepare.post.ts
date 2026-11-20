import { prepareVoice, voiceStatus } from '~~/voice.js'

// Starts setting up the voice (install once, then load the model); the page polls the status.
export default defineEventHandler(() => { prepareVoice(); return voiceStatus() })
