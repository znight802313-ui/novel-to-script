import { CharacterStage, PlotPhase } from '../types';
import { extractChapterIds } from './fileParser';

const toUniqueSortedIds = (ids: number[]) => Array.from(new Set(ids.filter(id => id > 0))).sort((a, b) => a - b);

const buildContinuousIds = (start: number, end: number): number[] => {
  if (start <= 0 || end <= 0) return [];
  const actualStart = Math.min(start, end);
  const actualEnd = Math.max(start, end);
  return Array.from({ length: actualEnd - actualStart + 1 }, (_, index) => actualStart + index);
};

const filterAllowedIds = (ids: number[], allowedChapterIds?: number[]) => {
  const normalized = toUniqueSortedIds(ids);
  if (!allowedChapterIds || allowedChapterIds.length === 0) return normalized;
  const allowedSet = new Set(allowedChapterIds);
  return normalized.filter(id => allowedSet.has(id));
};

const getRawStageIds = (stage: Partial<CharacterStage>) => {
  const rangeIds = extractChapterIds(stage.sourceRange || '');
  if (rangeIds.length > 0) return rangeIds;
  return buildContinuousIds(stage.startChapter || 0, stage.endChapter || 0);
};

const getRawMappingIds = (mapping?: { text_range?: string; chapter_start?: number; chapter_end?: number }) => {
  const rangeIds = extractChapterIds(mapping?.text_range || '');
  if (rangeIds.length > 0) return rangeIds;
  return buildContinuousIds(mapping?.chapter_start || 0, mapping?.chapter_end || 0);
};

const getRawPhaseIds = (phase: PlotPhase) => {
  const events = Array.isArray(phase.events) ? phase.events : [];
  const ids = events.flatMap(event => extractChapterIds(event.range || ''));
  return toUniqueSortedIds(ids);
};

const getRangeLabel = (ids: number[]) => {
  if (ids.length === 0) return '';
  const start = ids[0];
  const end = ids[ids.length - 1];
  return start === end ? `第${start}章` : `第${start}-${end}章`;
};

const normalizeSequentialChapterGroups = <T>(
  items: T[],
  getRawIds: (item: T) => number[],
  allowedChapterIds?: number[]
): Array<{ item: T; ids: number[] }> => {
  const normalized: Array<{ item: T; ids: number[] }> = [];

  items.forEach(item => {
    let currentIds = filterAllowedIds(getRawIds(item), allowedChapterIds);
    if (currentIds.length === 0) return;

    const previous = normalized[normalized.length - 1];
    if (previous && previous.ids.length > 0) {
      const previousEnd = previous.ids[previous.ids.length - 1];
      const currentStart = currentIds[0];
      const currentEnd = currentIds[currentIds.length - 1];

      if (previousEnd >= currentStart) {
        previous.ids = previous.ids.filter(id => id < currentStart);
        if (previous.ids.length === 0) {
          normalized.pop();
        }

        const expandedEnd = Math.max(previousEnd, currentEnd);
        currentIds = filterAllowedIds(buildContinuousIds(currentStart, expandedEnd), allowedChapterIds);
      }
    }

    if (normalized.length > 0) {
      const usedIds = new Set(normalized.flatMap(entry => entry.ids));
      currentIds = currentIds.filter(id => !usedIds.has(id));
    }

    if (currentIds.length === 0) return;
    normalized.push({ item, ids: currentIds });
  });

  return normalized;
};

export const formatChapterRange = (start: number, end: number) => getRangeLabel(buildContinuousIds(start, end));

export const canonicalizeChapterRangeText = (
  text: string,
  fallbackStart?: number,
  fallbackEnd?: number
) => {
  const ids = toUniqueSortedIds(extractChapterIds(text || ''));
  if (ids.length > 0) return getRangeLabel(ids);
  if (fallbackStart && fallbackEnd) return formatChapterRange(fallbackStart, fallbackEnd);
  if (fallbackStart) return formatChapterRange(fallbackStart, fallbackStart);
  return text?.trim() || '';
};

export const extractBatchChapterIds = (batchText: string) => {
  // Support both "Chapter 123" and "第123章" or "第123 [" etc.
  const matches = [...batchText.matchAll(/(?:Chapter|第)\s*(\d+)\s*(?:章|\[|:)/gi)];
  return toUniqueSortedIds(matches.map(match => Number(match[1])));
};

export const normalizeCharacterStages = (
  stages: CharacterStage[],
  allowedChapterIds?: number[]
): CharacterStage[] => {
  const stageGroups = normalizeSequentialChapterGroups(stages, getRawStageIds, allowedChapterIds);
  const stageMap = new Map(stageGroups.map(group => [group.item, group.ids]));

  const normalizedStages = stages
    .map(stage => {
      const rawIds = getRawStageIds(stage);
      const ids = stageMap.get(stage);

      if (rawIds.length === 0) {
        return stage;
      }

      if (!ids || ids.length === 0) {
        return null;
      }

      return {
        ...stage,
        sourceRange: getRangeLabel(ids),
        startChapter: ids[0],
        endChapter: ids[ids.length - 1],
      };
    })
    .filter((stage): stage is CharacterStage => stage !== null);

  return normalizedStages.map((stage, index) => ({
    ...stage,
    stageIndex: index + 1,
  }));
};

export const normalizeStageMappings = <T extends { source_mapping?: { text_range?: string; chapter_start?: number; chapter_end?: number } }>(
  stages: T[],
  allowedChapterIds?: number[]
): T[] => {
  const stageGroups = normalizeSequentialChapterGroups(stages, stage => getRawMappingIds(stage.source_mapping), allowedChapterIds);
  const stageMap = new Map(stageGroups.map(group => [group.item, group.ids]));

  return stages.flatMap(stage => {
    const rawIds = getRawMappingIds(stage.source_mapping);
    const ids = stageMap.get(stage);

    if (rawIds.length === 0) {
      return [stage];
    }

    if (!ids || ids.length === 0) {
      return [];
    }

    return [{
      ...stage,
      source_mapping: {
        ...(stage.source_mapping || {}),
        text_range: getRangeLabel(ids),
        chapter_start: ids[0],
        chapter_end: ids[ids.length - 1],
      },
    }];
  });
};

export const normalizePlotPhases = (
  phases: PlotPhase[],
  allowedChapterIds?: number[]
): PlotPhase[] => {
  const phaseGroups = normalizeSequentialChapterGroups(phases, getRawPhaseIds, allowedChapterIds);
  const phaseMap = new Map(phaseGroups.map(group => [group.item, group.ids]));

  return phases.flatMap(phase => {
    const rawIds = getRawPhaseIds(phase);
    const ids = phaseMap.get(phase);

    if (rawIds.length === 0) {
      return [phase];
    }

    if (!ids || ids.length === 0) {
      return [];
    }

    const phaseRangeSet = new Set(ids);
    const phaseRangeLabel = getRangeLabel(ids);
    const phaseEvents = Array.isArray(phase.events) ? phase.events : [];

    return [{
      ...phase,
      events: phaseEvents.map(event => {
        const eventIds = filterAllowedIds(extractChapterIds(event.range || ''), ids);
        const normalizedEventIds = eventIds.length > 0 ? eventIds.filter(id => phaseRangeSet.has(id)) : ids;

        return {
          ...event,
          range: normalizedEventIds.length > 0 ? getRangeLabel(normalizedEventIds) : phaseRangeLabel,
        };
      }),
    }];
  });
};

export const normalizeEpisodeTargetChapters = <T extends { targetChapter?: string }>(
  episodes: T[],
  startChapter: number,
  endChapter: number
): T[] => {
  if (!episodes || episodes.length === 0) return [];

  return episodes.map((episode, index) => {
    const fallbackStart = index === 0 ? startChapter : undefined;
    const fallbackEnd = index === episodes.length - 1 ? endChapter : undefined;

    return {
      ...episode,
      targetChapter: canonicalizeChapterRangeText(episode.targetChapter || '', fallbackStart, fallbackEnd),
    };
  });
};
