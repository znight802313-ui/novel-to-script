import { Episode, ProjectState, StoryBlueprint, AnalyzedCharacter, BlueprintRetrySnapshot } from '../types';
import { canonicalizeChapterRangeText, normalizeCharacterStages, normalizePlotPhases } from './chapterRangeNormalization';
import { getItem, removeItem, setItem } from './idb';

export const PROJECT_STORAGE_KEY = 'juben_project_state_v1';

let lastPersistedSnapshot = '';

const sanitizeEpisodeForPersistence = (episode: Episode): Episode => {
  const { isAnalyzing, isAuditing, ...rest } = episode;
  return {
    ...rest,
    targetChapter: canonicalizeChapterRangeText(rest.targetChapter || ''),
    draftTargetChapter: canonicalizeChapterRangeText(rest.draftTargetChapter || rest.targetChapter || ''),
  };
};

const sanitizeBlueprintForPersistence = (blueprint: StoryBlueprint | null): StoryBlueprint | null => (
  blueprint
    ? {
        ...blueprint,
        mainPlotArc: {
          ...blueprint.mainPlotArc,
          phases: normalizePlotPhases(blueprint.mainPlotArc?.phases || []),
        },
      }
    : null
);

const sanitizeCharactersForPersistence = (characters: AnalyzedCharacter[]): AnalyzedCharacter[] => (
  characters.map(character => ({
    ...character,
    timeline: normalizeCharacterStages(character.timeline || []),
  }))
);

const sanitizeRetrySnapshot = (snapshot?: BlueprintRetrySnapshot | null): BlueprintRetrySnapshot | null => (
  snapshot
    ? {
        blueprint: sanitizeBlueprintForPersistence(snapshot.blueprint),
        characters: sanitizeCharactersForPersistence(snapshot.characters),
      }
    : null
);

const hydrateBlueprint = (blueprint: StoryBlueprint | null): StoryBlueprint | null => (
  blueprint
    ? {
        ...blueprint,
        mainPlotArc: {
          ...blueprint.mainPlotArc,
          phases: normalizePlotPhases(blueprint.mainPlotArc?.phases || []),
        },
      }
    : null
);

const hydrateCharacters = (characters: AnalyzedCharacter[]): AnalyzedCharacter[] => (
  characters.map(character => ({
    ...character,
    timeline: normalizeCharacterStages(character.timeline || []),
  }))
);

const hydrateRetrySnapshot = (snapshot?: BlueprintRetrySnapshot | null): BlueprintRetrySnapshot | null => (
  snapshot
    ? {
        blueprint: hydrateBlueprint(snapshot.blueprint),
        characters: hydrateCharacters(snapshot.characters),
      }
    : null
);

const sanitizeProjectStateForPersistence = (projectState: ProjectState): ProjectState => ({
  ...projectState,
  isParsing: false,
  blueprint: sanitizeBlueprintForPersistence(projectState.blueprint),
  characters: sanitizeCharactersForPersistence(projectState.characters),
  blueprintRetrySnapshot: sanitizeRetrySnapshot(projectState.blueprintRetrySnapshot),
  episodes: projectState.episodes.map(sanitizeEpisodeForPersistence),
});

const hydrateEpisodeRuntimeState = (episode: Episode): Episode => ({
  ...episode,
  targetChapter: canonicalizeChapterRangeText(episode.targetChapter || ''),
  draftTargetChapter: canonicalizeChapterRangeText(episode.draftTargetChapter || episode.targetChapter || ''),
  isAnalyzing: false,
  isAuditing: false,
});

const hydrateProjectState = (projectState: ProjectState): ProjectState => ({
  ...projectState,
  isParsing: false,
  blueprint: hydrateBlueprint(projectState.blueprint),
  characters: hydrateCharacters(projectState.characters),
  blueprintRetrySnapshot: hydrateRetrySnapshot(projectState.blueprintRetrySnapshot),
  episodes: projectState.episodes.map(hydrateEpisodeRuntimeState),
});

export const loadProjectState = async (): Promise<ProjectState | null> => {
  const saved = await getItem<ProjectState>(PROJECT_STORAGE_KEY);
  if (!saved) {
    lastPersistedSnapshot = '';
    return null;
  }

  const hydrated = hydrateProjectState(saved);
  lastPersistedSnapshot = JSON.stringify(sanitizeProjectStateForPersistence(hydrated));
  return hydrated;
};

export const persistProjectState = async (projectState: ProjectState): Promise<void> => {
  const sanitized = sanitizeProjectStateForPersistence(projectState);
  const serialized = JSON.stringify(sanitized);

  if (serialized === lastPersistedSnapshot) {
    return;
  }

  await setItem(PROJECT_STORAGE_KEY, sanitized);
  lastPersistedSnapshot = serialized;
};

export const clearProjectState = async (): Promise<void> => {
  lastPersistedSnapshot = '';
  await removeItem(PROJECT_STORAGE_KEY);
};
