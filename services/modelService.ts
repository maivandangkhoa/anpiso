const STORAGE_KEY = 'user_ai_model';

/** Selectable Gemini models for transcription + minutes generation. */
export const AI_MODEL_OPTIONS = [
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
] as const;

const DEFAULT_MODEL = 'gemini-3.5-flash';

const isValid = (model: string): boolean => AI_MODEL_OPTIONS.some(o => o.value === model);

export const modelService = {
  /** Currently selected model, falling back to the default. */
  getModel(): string {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && isValid(saved)) return saved;
    } catch {}
    return DEFAULT_MODEL;
  },

  setModel(model: string) {
    if (isValid(model)) {
      localStorage.setItem(STORAGE_KEY, model);
    }
  },
};
