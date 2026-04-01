import {
  calculateTimeout,
  cleanJson,
  deepRepairJson,
  formatJsonWithGemini,
  repairJson,
  safeJsonParse,
  safeJsonParseAsync,
} from '../utils/jsonUtils';

export {
  calculateTimeout,
  cleanJson,
  deepRepairJson,
  formatJsonWithGemini,
  repairJson,
  safeJsonParse,
  safeJsonParseAsync,
};

export const parseDraftEpisodesResult = async (
  text: string,
  apiKey?: string,
  baseUrl?: string,
) => {
  const parsed = await safeJsonParseAsync(text, 'DraftEpisodes', apiKey, baseUrl, true);
  return Array.isArray(parsed) ? parsed : (parsed.episodes || []);
};

export const parseOutlineParseResult = async (
  text: string,
  apiKey?: string,
  baseUrl?: string,
) => {
  const result = await safeJsonParseAsync(text, 'OutlineParse', apiKey, baseUrl, true);

  if (result.characterList && Array.isArray(result.characterList)) {
    result.characterList = result.characterList.map((character: any, index: number) => ({
      ...character,
      id: Date.now().toString() + index,
    }));
  } else {
    result.characterList = [];
  }

  return result;
};

export const parseFixOptionsResult = (text: string) => {
  const result = safeJsonParse(text, 'RefineEpisode');
  return Array.isArray(result) ? result : (result.options || result.fixes || []);
};
