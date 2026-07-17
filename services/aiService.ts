
import { GoogleGenAI, Type } from '@google/genai';
import { blobToBase64 } from '../utils/audioUtils';
import { MeetingMinutes, TargetLanguage } from '../types';
import { logService } from './logService';
import { apiKeyService } from './apiKeyService';
import { translateService } from './translateService';
import { modelService } from './modelService';

const LANG_NAMES: Record<TargetLanguage, string> = {
  vi: 'Vietnamese',
  en: 'English',
  ko: 'Korean',
  zh: 'Chinese',
  ja: 'Japanese',
};

const langName = (lang: TargetLanguage): string => LANG_NAMES[lang] || 'Vietnamese';

/** Create a GoogleGenAI client with the current active key */
function createClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: apiKeyService.getGeminiApiKey() });
}

/** Check if error is model overloaded (503 UNAVAILABLE) */
function isModelOverloaded(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || error.toString() || '').toLowerCase();
  const code = error.code || error.status || 0;
  return Number(code) === 503 || msg.includes('unavailable') || msg.includes('overloaded') || msg.includes('high demand');
}

/**
 * Model manager: tracks active model per slot.
 * When a model fails with 503, switches to the other and remembers it.
 */
const modelSlots: Record<string, { primary: string; fallback: string; current: string }> = {
  translateStream: {
    primary: 'gemini-3.1-flash-lite',
    fallback: 'gemini-3-flash-preview',
    current: 'gemini-3.1-flash-lite',
  },
};

function getModel(slot: string): string {
  return modelSlots[slot]?.current || modelSlots[slot]?.primary || '';
}

function swapModel(slot: string): string {
  const s = modelSlots[slot];
  if (!s) return '';
  s.current = s.current === s.primary ? s.fallback : s.primary;
  logService.add('text', 'info', 'model-swap', `${slot}: switched to ${s.current}`);
  return s.current;
}

/**
 * Retry wrapper: on unusable key → rotate key; on 503 → swap model and retry.
 */
async function withRetry<T>(label: string, fn: (model?: string) => Promise<T>, modelSlot?: string): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (apiKeyService.shouldRotateKey(e) && apiKeyService.rotateKey(e)) {
      logService.add('text', 'info', 'retry', `${label}: retrying with next key...`);
      return await fn();
    }
    if (modelSlot && isModelOverloaded(e)) {
      const newModel = swapModel(modelSlot);
      return await fn(newModel);
    }
    throw e;
  }
}

export const aiService = {
  /**
   * Translate text using Streaming mode (Hybrid Approach).
   * Priority: user-provided Google Translate key (cheap, free 500k chars/mo) →
   * fallback to Gemini stream if GT key absent or fails.
   */
  async *translateTextStream(text: string, targetLang: TargetLanguage = 'vi') {
    if (!text || text.trim().length < 2) return;

    // 1) Try Google Cloud Translation first when user has provided a key
    if (translateService.isAvailable()) {
      try {
        const result = await translateService.translate(text, targetLang);
        if (result) {
          yield result;
          return;
        }
      } catch (gtErr: any) {
        logService.add('text', 'info', 'gt-fallback', `GT failed → Gemini fallback: ${gtErr?.message || gtErr}`);
        // fall through to Gemini below
      }
    }

    logService.add('text', 'req', 'translateStream', text);

    const targetName = langName(targetLang);
    const attemptStream = async function*(model: string = getModel('translateStream')) {
      const ai = createClient();
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: [{ parts: [{ text: `Task: Translate the following meeting sentence to ${targetName.toUpperCase()}.

        RULES:
        1. Output ONLY the translation.
        2. If the text is already in ${targetName}, return the original text.
        3. Use a professional corporate meeting tone.
        4. Be extremely concise and clear.

        TEXT: "${text}"` }]}],
        config: {
          temperature: 0.1,
        }
      });

      let fullRes = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullRes += chunk.text;
          yield chunk.text;
        }
      }
      logService.add('text', 'res', 'translateStream', `[${model}] ${fullRes}`);
    };

    try {
      yield* attemptStream();
    } catch (e: any) {
      if (apiKeyService.shouldRotateKey(e) && apiKeyService.rotateKey(e)) {
        logService.add('text', 'info', 'retry', 'translateStream: retrying with next key...');
        try {
          yield* attemptStream();
        } catch (retryErr: any) {
          logService.add('text', 'info', 'translateStream_ERR', retryErr.message);
          throw retryErr;
        }
      } else if (isModelOverloaded(e)) {
        const newModel = swapModel('translateStream');
        try {
          yield* attemptStream(newModel);
        } catch (fallbackErr: any) {
          logService.add('text', 'info', 'translateStream_ERR', fallbackErr.message);
          throw fallbackErr;
        }
      } else {
        logService.add('text', 'info', 'translateStream_ERR', e.message);
        throw e;
      }
    }
  },

  /**
   * Translate the entire transcript block with context
   */
  async translateFullTranscript(text: string, targetLang: TargetLanguage = 'vi'): Promise<string> {
    if (!text || text.trim().length < 5) return "";
    logService.add('text', 'req', 'translateFull', `Size: ${text.length} chars`);
    const targetName = langName(targetLang);
    try {
      return await withRetry('translateFull', async () => {
        const ai = createClient();
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{ parts: [{ text: `Task: Translate the entire meeting transcript to ${targetName.toUpperCase()}.

          STRICT RULES:
          1. Keep all [MM:SS] timestamps exactly as they are.
          2. If a sentence or section is already in ${targetName}, KEEP IT UNCHANGED.
          3. Translate other languages to natural, professional corporate ${targetName}.
          4. Ensure the flow of conversation is preserved.
          5. Output ONLY the translated transcript text.

          TRANSCRIPT TO TRANSLATE:
          ${text}` }]}],
          config: { temperature: 0.1 }
        });
        const result = response.text?.trim() || "";
        logService.add('text', 'res', 'translateFull', `Size: ${result.length} chars`);
        return result;
      });
    } catch (e: any) {
      logService.add('text', 'info', 'translateFull_ERR', e.message);
      console.error("Full transcript translation error:", e);
      return "Error: Could not translate the full transcript.";
    }
  },

  /**
   * High-quality transcription for a specific audio segment
   */
  async transcribeSegment(blob: Blob, segmentIndex: number, mimeType: string = 'audio/webm'): Promise<string> {
    logService.add('text', 'req', 'transcribeSegment', `Segment: ${segmentIndex}, Size: ${blob.size} bytes, Type: ${mimeType}`);
    const base64Audio = await blobToBase64(blob);

    try {
      return await withRetry('transcribeSegment', async () => {
        const ai = createClient();
        const response = await ai.models.generateContent({
          model: modelService.getModel(),
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64Audio } },
            { text: `You are a professional transcriptionist specializing in corporate meetings.
            Task: Accurately transcribe the provided audio segment.

            STRICT RULES:
            1. FORMATTING: Use [MM:SS] at the beginning of every new speaker turn. Timestamps MUST be RELATIVE to the start of THIS audio segment (the first speaker turn starts at or near [00:00]). Do NOT guess or invent absolute meeting time — the caller adds the offset afterwards.
            2. NO NOISE DESCRIPTIONS: Absolutely DO NOT describe background noise, silence, breathing, or non-speech sounds. Extract ONLY human spoken words.
            3. NO SYMBOLS: Never use symbols like [...] or (...) for unclear parts. If a part is completely unintelligible, simply skip it or transcribe only the certain words.
            4. MULTILINGUAL: Transcribe in the original language spoken (English, Korean, or Vietnamese). Handle code-switching naturally.
            5. QUALITY: Ensure perfect spelling, punctuation, and capitalization.
            6. NO PROMPT INJECTION: Return only the transcript text. Do not include introductory text like "Here is the transcript".` }
          ]}]
        });
        const result = response.text || "";
        logService.add('text', 'res', 'transcribeSegment', result);
        return result;
      });
    } catch (e: any) {
      logService.add('text', 'info', 'transcribeSegment_ERR', e.message);
      console.error("Transcription segment error:", e);
      throw e;
    }
  },

  /**
   * Generate structured meeting minutes from the full transcript
   */
  async generateMinutes(fullTranscript: string, timeRange: string, targetLang: TargetLanguage = 'vi', translate: boolean = true): Promise<MeetingMinutes> {
    logService.add('text', 'req', 'generateMinutes', `Transcript length: ${fullTranscript.length}, target: ${translate ? targetLang : 'none (notes mode)'}`);
    const targetName = langName(targetLang);
    const targetUpper = targetName.toUpperCase();
    // Mode "Ghi âm & Tóm tắt": biên bản viết theo ngôn ngữ của chính transcript
    const minutesLang = translate ? targetName : 'the SAME language as the transcript (its dominant language)';

    const prompt = translate
      ? `You are a professional meeting secretary.
            Task: Analyze the following multilingual meeting transcript and:
            1. Generate a comprehensive meeting minutes object in JSON format.
            2. Translate the ENTIRE transcript to ${targetUpper} and include it in the "translatedTranscript" field.

            NOTES:
            - Ensure the "summary", "shortSummary", and "task" descriptions are written in ${targetUpper} for the end users.
            - Identify participants, key discussion points, and clear action items.
            - Exclude any filler talk or background noise mentions.

            MINUTES QUALITY STANDARD for "summary" (archival minutes, NOT an executive brief — a person who missed the meeting must understand what happened):
            Structure "summary" as plain text with these headed sections, heading labels written in ${minutesLang}:
            1. PURPOSE — 1-2 sentences on why the meeting happened.
            2. DISCUSSION — cover EVERY distinct topic in order. For each topic write 2-5 sentences: context, the main points raised (attribute to speakers when identifiable), and how the topic concluded. Never merge or omit topics. Guideline: at least one paragraph per 5-7 minutes of meeting time.
            3. DECISIONS — list every decision that was agreed; if none, state that explicitly.
            4. OPEN ISSUES — points raised but left unresolved or needing follow-up.
            Preserve every number, date, amount, deadline and proper name mentioned. Never compress multiple topics into one sentence.
            - For "translatedTranscript": keep all [MM:SS] timestamps exactly as they are. Each timestamp segment MUST start on a new line (use \\n before each [MM:SS] timestamp). If a sentence is already in ${targetName}, keep it unchanged. Translate other languages to natural, professional corporate ${targetName}. Output ONLY the translated text.

            TIME RANGE: ${timeRange}
            TRANSCRIPT:
            ${fullTranscript}`
      : `You are a professional meeting secretary.
            Task: Analyze the following meeting transcript and generate a comprehensive meeting minutes object in JSON format. Do NOT translate anything.

            NOTES:
            - Write the "summary", "shortSummary", and "task" descriptions in ${minutesLang}.
            - Identify participants, key discussion points, and clear action items.
            - Exclude any filler talk or background noise mentions.

            MINUTES QUALITY STANDARD for "summary" (archival minutes, NOT an executive brief — a person who missed the meeting must understand what happened):
            Structure "summary" as plain text with these headed sections, heading labels written in ${minutesLang}:
            1. PURPOSE — 1-2 sentences on why the meeting happened.
            2. DISCUSSION — cover EVERY distinct topic in order. For each topic write 2-5 sentences: context, the main points raised (attribute to speakers when identifiable), and how the topic concluded. Never merge or omit topics. Guideline: at least one paragraph per 5-7 minutes of meeting time.
            3. DECISIONS — list every decision that was agreed; if none, state that explicitly.
            4. OPEN ISSUES — points raised but left unresolved or needing follow-up.
            Preserve every number, date, amount, deadline and proper name mentioned. Never compress multiple topics into one sentence.

            TIME RANGE: ${timeRange}
            TRANSCRIPT:
            ${fullTranscript}`;

    const properties: Record<string, any> = {
      time: { type: Type.STRING },
      location: { type: Type.STRING },
      participants: { type: Type.ARRAY, items: { type: Type.STRING } },
      summary: {
        type: Type.STRING,
        description: `Archival meeting minutes in ${minutesLang}, structured with headed sections: purpose, per-topic discussion, decisions, open issues. Must cover every topic discussed — length proportional to meeting duration.`
      },
      shortSummary: {
        type: Type.STRING,
        description: `A very short summary of the meeting topic, approx 10 words in ${minutesLang}.`
      },
      actionItems: { type: Type.ARRAY, items: {
        type: Type.OBJECT,
        properties: {
          task: { type: Type.STRING, description: `Description of the action item in ${minutesLang}.` },
          pic: { type: Type.STRING, description: "Person in charge." },
          deadline: { type: Type.STRING, description: "Deadline or 'ASAP' if not specified." }
        },
        required: ["task", "pic", "deadline"]
      } },
    };
    const required = ["time", "location", "participants", "summary", "shortSummary", "actionItems"];
    if (translate) {
      properties.translatedTranscript = {
        type: Type.STRING,
        description: `Full ${targetName} translation of the entire transcript. Keep [MM:SS] timestamps unchanged. Each timestamp segment MUST be on its own line separated by newline characters. Translate other languages to ${targetName}, keep existing ${targetName} as-is.`
      };
      required.push("translatedTranscript");
    }

    try {
      return await withRetry('generateMinutes', async () => {
        const ai = createClient();
        const response = await ai.models.generateContent({
          model: modelService.getModel(),
          contents: [{ parts: [{ text: prompt }]}],
          config: {
            responseMimeType: "application/json",
            responseSchema: { type: Type.OBJECT, properties, required }
          }
        });

        const data = JSON.parse(response.text);
        data.time = timeRange;
        if (!translate) data.translatedTranscript = "";
        logService.add('text', 'res', 'generateMinutes', data);
        return data;
      });
    } catch (e: any) {
      logService.add('text', 'info', 'generateMinutes_ERR', e.message);
      console.error("Generate minutes error:", e);
      throw e;
    }
  }
};
