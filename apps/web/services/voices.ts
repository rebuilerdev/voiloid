import type { Voice, VoicePreview, VoicePreviewRequest } from "@/types/voice"
import { apiRequest } from "@/services/http"

export function listVoices() {
  return apiRequest<Voice[]>("GET", "/api/voices")
}

export function previewVoice(input: VoicePreviewRequest) {
  return apiRequest<VoicePreview>("POST", "/api/voices/preview", input)
}
