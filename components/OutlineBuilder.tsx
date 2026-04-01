
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chapter, StoryBlueprint, Episode, AnalyzedCharacter, CharacterProfile, CharacterStage, CharacterRelation, OutlineGenerationProgressContext, OutlineGlobalSettings } from '../types';
import { generateDraftEpisodes, AVAILABLE_MODELS, getRecommendedModel } from '../services/geminiService';
import { getChapterRange } from '../utils/fileParser';
import { buildCharacterProfileForEpisode, refreshCharacterProfileList } from '../utils/characterProfile';
import { canonicalizeChapterRangeText, formatChapterRange } from '../utils/chapterRangeNormalization';
import { Play, PauseCircle, Loader2, Sparkles, Plus, Trash2, ArrowRight, LayoutList, GripVertical, Settings, RotateCcw, Users, Globe, Quote, Target, X, User, FileDown, Home, RefreshCw, Activity, Anchor, Eye, BrainCircuit, Mic2, HeartHandshake } from 'lucide-react';
import { useCapacityErrorHandler } from '../utils/useCapacityErrorHandler';
import { useDebouncedEffect } from '../utils/useDebouncedEffect';

interface OutlineBuilderProps {
    chapters: Chapter[];
    blueprint: StoryBlueprint;
    characters: AnalyzedCharacter[]; // Passed for context
    initialEpisodes?: Episode[];      // Restored episodes from saved state
    initialGlobalSettings?: OutlineGlobalSettings;
    onComplete: (episodes: Episode[], globalSettings: OutlineGlobalSettings) => void;
    onAutoSave?: (episodes: Episode[], globalSettings: OutlineGlobalSettings) => void;
    onNewProject: () => void;
    onGoBack: () => void;
    apiKey: string;
    baseUrl?: string;
    novelName?: string;
    onNovelNameChange?: (name: string) => void;
}

// Track history for Undo functionality
interface BatchHistory {
    episodesAdded: number; // How many episodes were added in this batch
    previousChapterIndex: number; // Where we were before this batch
}

const DEFAULT_OUTLINE_GLOBAL_SETTINGS: OutlineGlobalSettings = {
    viralTips: '',
    expectedTotalEpisodesMin: null,
    expectedTotalEpisodesMax: null,
};

const parsePositiveInteger = (value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
};

const normalizeEpisodeRange = (minValue: number | null, maxValue: number | null): Pick<OutlineGlobalSettings, 'expectedTotalEpisodesMin' | 'expectedTotalEpisodesMax'> => {
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
        return {
            expectedTotalEpisodesMin: Math.min(minValue, maxValue),
            expectedTotalEpisodesMax: Math.max(minValue, maxValue),
        };
    }

    return {
        expectedTotalEpisodesMin: minValue,
        expectedTotalEpisodesMax: maxValue,
    };
};

const formatEpisodeRangeLabel = (
    minValue?: number | null,
    maxValue?: number | null,
    emptyText: string = '未设置'
): string => {
    const normalizedMin = minValue ?? null;
    const normalizedMax = maxValue ?? null;

    if (normalizedMin !== null && normalizedMax !== null) {
        if (normalizedMin === normalizedMax) {
            return `约 ${normalizedMin} 集`;
        }
        return `${normalizedMin}-${normalizedMax} 集`;
    }

    if (normalizedMin !== null) {
        return `至少 ${normalizedMin} 集`;
    }

    if (normalizedMax !== null) {
        return `至多 ${normalizedMax} 集`;
    }

    return emptyText;
};

interface ViewingCharacterContext {
    episodeId: number;
    characterId: string;
}

interface OutlineCharacterStageDraft {
    stageName: string;
    sourceRange: string;
    currentAge: string;
    visualAgeDesc: string;
    appearance: string;
    physicalState: string;
    signatureProps: string;
    knownInfo: string;
    coreGoal: string;
    speakingStyle: string;
    personalityTags: string;
    relations: CharacterRelation[];
}

interface OutlineCharacterEditorDraft {
    name: string;
    gender: string;
    origin: string;
    role: string;
    bio: string;
    stage: OutlineCharacterStageDraft;
}

const EMPTY_RELATION_DRAFT: CharacterRelation = {
    target: '',
    attitude: '',
    subtext: '',
};

const EMPTY_CHARACTER_EDIT_DRAFT: OutlineCharacterEditorDraft = {
    name: '',
    gender: '',
    origin: '',
    role: '',
    bio: '',
    stage: {
        stageName: '当前匹配阶段',
        sourceRange: '',
        currentAge: '',
        visualAgeDesc: '',
        appearance: '',
        physicalState: '',
        signatureProps: '',
        knownInfo: '',
        coreGoal: '',
        speakingStyle: '',
        personalityTags: '',
        relations: [],
    },
};

const normalizeFieldValue = (value?: string | null): string => value?.trim() || '';

const stringifyList = (values?: string[] | null): string => (values || []).map(value => value.trim()).filter(Boolean).join('、');

const findAnalyzedCharacterForProfile = (profile: CharacterProfile, characters: AnalyzedCharacter[]): AnalyzedCharacter | null => (
    characters.find(character => (
        character.id === profile.id ||
        character.name === profile.name ||
        character.name.includes(profile.name) ||
        profile.name.includes(character.name)
    )) || null
);

const getMatchedStageForEpisode = (character: AnalyzedCharacter | null, episodeRange: { start: number; end: number } | null): CharacterStage | null => {
    if (!character?.timeline || character.timeline.length === 0) {
        return null;
    }

    const sortedStages = [...character.timeline].sort((a, b) => a.startChapter - b.startChapter);
    if (!episodeRange) {
        return sortedStages[0] || null;
    }

    return sortedStages.filter(stage => stage.startChapter <= episodeRange.start).pop() || sortedStages[0] || null;
};

const parseProfileDescriptionSections = (description?: string): Record<string, Record<string, string>> => {
    const sections: Record<string, Record<string, string>> = {};
    const lines = (description || '').split('\n').map(line => line.trim()).filter(Boolean);

    let currentSection = '角色信息';
    let currentLabel: string | null = null;

    lines.forEach(line => {
        const sectionMatch = line.match(/^【(.+?)】$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim();
            sections[currentSection] = sections[currentSection] || {};
            currentLabel = null;
            return;
        }

        sections[currentSection] = sections[currentSection] || {};
        const delimiterIndex = line.indexOf('：');

        if (delimiterIndex !== -1) {
            const label = line.slice(0, delimiterIndex).trim();
            const value = line.slice(delimiterIndex + 1).trim();
            sections[currentSection][label] = value;
            currentLabel = label;
            return;
        }

        if (currentLabel) {
            sections[currentSection][currentLabel] = [sections[currentSection][currentLabel], line].filter(Boolean).join('\n');
        }
    });

    return sections;
};

const parseRelationsText = (value?: string): CharacterRelation[] => {
    const normalized = normalizeFieldValue(value);
    if (!normalized || normalized === '暂无') {
        return [];
    }

    return normalized
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^-\s*/, ''))
        .map(line => {
            const parts = line.split('｜').map(part => part.trim()).filter(Boolean);
            const relation: CharacterRelation = { ...EMPTY_RELATION_DRAFT };

            if (parts.length > 0) {
                relation.target = parts[0];
            }

            parts.slice(1).forEach(part => {
                if (part.startsWith('态度：')) {
                    relation.attitude = part.slice(3).trim();
                } else if (part.startsWith('潜台词：')) {
                    relation.subtext = part.slice(4).trim();
                }
            });

            return relation;
        })
        .filter(relation => relation.target || relation.attitude || relation.subtext);
};

const buildRelationsDescription = (relations: CharacterRelation[]): string => {
    const normalized = relations.filter(relation => relation.target.trim() || relation.attitude.trim() || relation.subtext.trim());
    if (normalized.length === 0) {
        return '暂无';
    }

    return normalized
        .map(relation => {
            const target = normalizeFieldValue(relation.target) || '未知对象';
            const attitude = normalizeFieldValue(relation.attitude) || '未说明';
            const subtext = normalizeFieldValue(relation.subtext) || '暂无';
            return `- ${target}｜态度：${attitude}｜潜台词：${subtext}`;
        })
        .join('\n');
};

const buildCharacterEditorDraft = (
    profile: CharacterProfile,
    sourceCharacter: AnalyzedCharacter | null,
    matchedStage: CharacterStage | null,
    fallbackSourceRange: string,
): OutlineCharacterEditorDraft => {
    const sections = parseProfileDescriptionSections(profile.desc);
    const staticFields = sections['静态底座档案'] || {};
    const dynamicFields = sections['本章节匹配动态阶段'] || {};

    return {
        name: normalizeFieldValue(profile.name) || normalizeFieldValue(sourceCharacter?.name),
        gender: normalizeFieldValue(staticFields['性别']) || normalizeFieldValue(sourceCharacter?.gender),
        origin: normalizeFieldValue(staticFields['出身/族属']) || normalizeFieldValue(sourceCharacter?.origin),
        role: normalizeFieldValue(staticFields['角色定位']) || normalizeFieldValue(sourceCharacter?.role),
        bio: normalizeFieldValue(staticFields['人物底色']) || normalizeFieldValue(sourceCharacter?.bio),
        stage: {
            stageName: normalizeFieldValue(matchedStage?.stageName) || '当前匹配阶段',
            sourceRange: normalizeFieldValue(matchedStage?.sourceRange) || normalizeFieldValue(fallbackSourceRange),
            currentAge: normalizeFieldValue(dynamicFields['当前年龄']) || normalizeFieldValue(matchedStage?.currentAge),
            visualAgeDesc: normalizeFieldValue(dynamicFields['视觉年龄']) || normalizeFieldValue(matchedStage?.visualAgeDesc),
            appearance: normalizeFieldValue(dynamicFields['外形/衣着']) || normalizeFieldValue(matchedStage?.appearance),
            physicalState: normalizeFieldValue(dynamicFields['身体状态']) || normalizeFieldValue(matchedStage?.physicalState),
            signatureProps: normalizeFieldValue(dynamicFields['核心道具']) || normalizeFieldValue(matchedStage?.signatureProps),
            knownInfo: normalizeFieldValue(dynamicFields['已知信息']) || stringifyList(matchedStage?.knownInfo),
            coreGoal: normalizeFieldValue(dynamicFields['核心目标']) || normalizeFieldValue(matchedStage?.coreGoal),
            speakingStyle: normalizeFieldValue(dynamicFields['说话风格']) || normalizeFieldValue(matchedStage?.speakingStyle),
            personalityTags: normalizeFieldValue(dynamicFields['性格标签']) || stringifyList(matchedStage?.personalityTags),
            relations: parseRelationsText(dynamicFields['关系网络']).length > 0
                ? parseRelationsText(dynamicFields['关系网络'])
                : (matchedStage?.relations || []).map(relation => ({
                    target: relation.target || '',
                    attitude: relation.attitude || '',
                    subtext: relation.subtext || '',
                })),
        },
    };
};

const serializeCharacterProfileDraft = (draft: OutlineCharacterEditorDraft): string => {
    const staticSection = [
        '【静态底座档案】',
        `角色定位：${normalizeFieldValue(draft.role) || '未标注'}` ,
        `性别：${normalizeFieldValue(draft.gender) || '未标注'}` ,
        `出身/族属：${normalizeFieldValue(draft.origin) || '未标注'}` ,
        `人物底色：${normalizeFieldValue(draft.bio) || '暂无'}` ,
    ].join('\n');

    const relationsDescription = buildRelationsDescription(draft.stage.relations);
    const dynamicSection = [
        '【本章节匹配动态阶段】',
        `当前年龄：${normalizeFieldValue(draft.stage.currentAge) || '未标注'}` ,
        `视觉年龄：${normalizeFieldValue(draft.stage.visualAgeDesc) || '未标注'}` ,
        `外形/衣着：${normalizeFieldValue(draft.stage.appearance) || '暂无'}` ,
        `身体状态：${normalizeFieldValue(draft.stage.physicalState) || '暂无'}` ,
        `核心道具：${normalizeFieldValue(draft.stage.signatureProps) || '暂无'}` ,
        `已知信息：${normalizeFieldValue(draft.stage.knownInfo) || '暂无'}` ,
        `核心目标：${normalizeFieldValue(draft.stage.coreGoal) || '暂无'}` ,
        `说话风格：${normalizeFieldValue(draft.stage.speakingStyle) || '暂无'}` ,
        `性格标签：${normalizeFieldValue(draft.stage.personalityTags) || '暂无'}` ,
        relationsDescription === '暂无' ? '关系网络：暂无' : `关系网络：\n${relationsDescription}` ,
    ].join('\n');

    return [staticSection, '', dynamicSection].join('\n');
};

const OutlineBuilder: React.FC<OutlineBuilderProps> = ({ chapters, blueprint, characters, initialEpisodes, initialGlobalSettings, onComplete, onAutoSave, onNewProject, onGoBack, apiKey, baseUrl, novelName, onNovelNameChange }) => {
    const [episodes, setEpisodes] = useState<Episode[]>(() => (initialEpisodes || []).map(episode => {
        const targetChapter = canonicalizeChapterRangeText(episode.targetChapter || '');
        const draftTargetChapter = canonicalizeChapterRangeText(episode.draftTargetChapter || episode.targetChapter || '');
        const episodeRange = getChapterRange(targetChapter || draftTargetChapter || '');

        return {
            ...episode,
            targetChapter,
            draftTargetChapter,
            draftCharacterList: refreshCharacterProfileList(episode.draftCharacterList, characters, episodeRange),
        };
    }));

    // Capacity Error Handler
    const { CapacityErrorModal, handleError: handleCapacityError } = useCapacityErrorHandler();

    const [outlineGlobalSettings, setOutlineGlobalSettings] = useState<OutlineGlobalSettings>(() => {
        const firstSavedTips = initialEpisodes?.find(ep => ep.viralTips && ep.viralTips.trim().length > 0)?.viralTips;
        const merged = {
            ...DEFAULT_OUTLINE_GLOBAL_SETTINGS,
            ...initialGlobalSettings,
            viralTips: initialGlobalSettings?.viralTips ?? firstSavedTips ?? '',
        };

        return {
            ...merged,
            ...normalizeEpisodeRange(
                merged.expectedTotalEpisodesMin ?? null,
                merged.expectedTotalEpisodesMax ?? null,
            ),
        };
    });

    // Auto-save mechanism: whenever episodes or global settings change, bubble it up to App.tsx
    useDebouncedEffect(() => {
        if (onAutoSave) {
            onAutoSave(episodes, outlineGlobalSettings);
        }
    }, [episodes, outlineGlobalSettings, onAutoSave], 300);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAutoGenerating, setIsAutoGenerating] = useState(false);
    const [isAutoPausePending, setIsAutoPausePending] = useState(false);
    // Initialize generatedUntilChapter from saved episodes so the counter survives refresh
    const [generatedUntilChapter, setGeneratedUntilChapter] = useState<number>(() => {
        if (!initialEpisodes || initialEpisodes.length === 0) return 0;
        // Find the maximum chapter end index across all saved episodes
        let maxChapter = 0;
        initialEpisodes.forEach(ep => {
            const range = getChapterRange(ep.targetChapter || ep.draftTargetChapter || '');
            if (range && range.end > maxChapter) maxChapter = range.end;
        });
        return maxChapter;
    });
    const [history, setHistory] = useState<BatchHistory[]>([]);

    // Settings
    const [selectedModel, setSelectedModel] = useState<string>(() => getRecommendedModel('analysis'));
    const [batchSizeChapters, setBatchSizeChapters] = useState<number>(10); // How many chapters to feed for outline gen
    const [targetEpisodeCount, setTargetEpisodeCount] = useState<string>(""); // User input (string to allow empty)
    const viralTips = outlineGlobalSettings.viralTips || '';

    const episodesRef = useRef<Episode[]>(episodes);
    const generatedUntilChapterRef = useRef<number>(generatedUntilChapter);
    const historyRef = useRef<BatchHistory[]>(history);
    const autoGenerateStopRef = useRef(false);

    useEffect(() => {
        episodesRef.current = episodes;
    }, [episodes]);

    useEffect(() => {
        generatedUntilChapterRef.current = generatedUntilChapter;
    }, [generatedUntilChapter]);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    const estimatedTotalEpisodes = useMemo(() => {
        if (episodes.length === 0 || generatedUntilChapter === 0 || chapters.length === 0) {
            return null;
        }

        const estimated = (episodes.length / generatedUntilChapter) * chapters.length;
        return Math.max(episodes.length, Math.round(estimated));
    }, [episodes.length, generatedUntilChapter, chapters.length]);

    const remainingEpisodeRangeLabel = useMemo(() => {
        const min = outlineGlobalSettings.expectedTotalEpisodesMin ?? null;
        const max = outlineGlobalSettings.expectedTotalEpisodesMax ?? null;
        return formatEpisodeRangeLabel(
            min !== null ? Math.max(min - episodes.length, 0) : null,
            max !== null ? Math.max(max - episodes.length, 0) : null,
            '未设置'
        );
    }, [outlineGlobalSettings.expectedTotalEpisodesMax, outlineGlobalSettings.expectedTotalEpisodesMin, episodes.length]);

    const buildOutlineProgressContext = (
        processedChapters: number = generatedUntilChapterRef.current,
        generatedEpisodeCount: number = episodesRef.current.length,
    ): OutlineGenerationProgressContext => {
        const totalChapters = chapters.length;
        const progressPercent = totalChapters > 0
            ? Math.round((processedChapters / totalChapters) * 100)
            : 0;
        const expectedTotalEpisodesMin = outlineGlobalSettings.expectedTotalEpisodesMin ?? null;
        const expectedTotalEpisodesMax = outlineGlobalSettings.expectedTotalEpisodesMax ?? null;
        const dynamicEstimatedTotalEpisodes = generatedEpisodeCount > 0 && processedChapters > 0 && totalChapters > 0
            ? Math.max(generatedEpisodeCount, Math.round((generatedEpisodeCount / processedChapters) * totalChapters))
            : null;

        return {
            totalChapters,
            processedChapters,
            progressPercent,
            generatedEpisodeCount,
            remainingChapters: Math.max(totalChapters - processedChapters, 0),
            expectedTotalEpisodesMin,
            expectedTotalEpisodesMax,
            remainingEpisodeRangeMin: expectedTotalEpisodesMin !== null
                ? Math.max(expectedTotalEpisodesMin - generatedEpisodeCount, 0)
                : null,
            remainingEpisodeRangeMax: expectedTotalEpisodesMax !== null
                ? Math.max(expectedTotalEpisodesMax - generatedEpisodeCount, 0)
                : null,
            estimatedTotalEpisodes: dynamicEstimatedTotalEpisodes,
        };
    };

    const isSeriesEndingEpisode = (episode: Episode): boolean => {
        const range = getChapterRange(episode.targetChapter || episode.draftTargetChapter || '');
        return Boolean(range && range.end >= chapters.length);
    };

    // Character View State
    const [viewingCharacterContext, setViewingCharacterContext] = useState<ViewingCharacterContext | null>(null);
    const [editingCharacterDraft, setEditingCharacterDraft] = useState<OutlineCharacterEditorDraft>(EMPTY_CHARACTER_EDIT_DRAFT);

    const activeViewingCharacter = useMemo(() => {
        if (!viewingCharacterContext) return null;

        const episode = episodes.find(item => item.id === viewingCharacterContext.episodeId);
        const character = episode?.draftCharacterList?.find(item => item.id === viewingCharacterContext.characterId);
        if (!episode || !character) return null;

        return {
            episode,
            character,
        };
    }, [episodes, viewingCharacterContext]);

    // Regenerate Episode State
    const [isRegeneratingEpId, setIsRegeneratingEpId] = useState<number | null>(null);

    const [batchFailed, setBatchFailed] = useState<boolean>(false);

    useEffect(() => {
        setEpisodes(prevEpisodes => {
            let hasChanged = false;
            const refreshedEpisodes = prevEpisodes.map(episode => {
                const episodeRange = getChapterRange(episode.targetChapter || episode.draftTargetChapter || '');
                const refreshedCharacterList = refreshCharacterProfileList(episode.draftCharacterList, characters, episodeRange);
                const previousSerialized = JSON.stringify(episode.draftCharacterList || []);
                const refreshedSerialized = JSON.stringify(refreshedCharacterList);

                if (previousSerialized === refreshedSerialized) {
                    return episode;
                }

                hasChanged = true;
                return {
                    ...episode,
                    draftCharacterList: refreshedCharacterList,
                };
            });

            return hasChanged ? refreshedEpisodes : prevEpisodes;
        });
    }, [characters]);

    // --- Post-processing: Validate and Adjust Chapter Ranges ---
    const validateAndAdjustChapterRanges = (
        newEpisodes: any[], 
        startChap: number, 
        endChap: number
    ): any[] => {
        if (!newEpisodes || newEpisodes.length === 0) return [];

        newEpisodes.forEach((episode, index) => {
            const fallbackStart = index === 0 ? startChap : undefined;
            const fallbackEnd = index === newEpisodes.length - 1 ? endChap : undefined;
            episode.targetChapter = canonicalizeChapterRangeText(episode.targetChapter || '', fallbackStart, fallbackEnd);
        });

        // 1. Ensure the first episode starts at startChap
        const firstRange = getChapterRange(newEpisodes[0].targetChapter || "");
        if (!firstRange || firstRange.start !== startChap) {
            const firstEnd = (firstRange?.end && firstRange.end >= startChap) ? firstRange.end : startChap;
            newEpisodes[0].targetChapter = formatChapterRange(startChap, firstEnd);
        }

        // 2. Linear adjust to eliminate gaps and overlaps
        for (let i = 0; i < newEpisodes.length - 1; i++) {
            const currentRange = getChapterRange(newEpisodes[i].targetChapter || "");
            const nextRange = getChapterRange(newEpisodes[i+1].targetChapter || "");
            
            if (currentRange && nextRange) {
                // Next must start at current.end + 1
                const expectedNextStart = currentRange.end + 1;
                if (nextRange.start !== expectedNextStart) {
                    const nextEnd = Math.max(expectedNextStart, nextRange.end);
                    newEpisodes[i+1].targetChapter = formatChapterRange(expectedNextStart, nextEnd);
                }
            }
        }

        // 3. Ensure the last episode ends at endChap
        const lastIndex = newEpisodes.length - 1;
        const lastRange = getChapterRange(newEpisodes[lastIndex].targetChapter || "");
        if (lastRange) {
             if (lastRange.end !== endChap) {
                const finalStart = Math.min(lastRange.start, endChap);
                newEpisodes[lastIndex].targetChapter = formatChapterRange(finalStart, endChap);
             }
        } else {
            // Fallback for missing range
            newEpisodes[lastIndex].targetChapter = formatChapterRange(endChap, endChap);
        }

        return newEpisodes;
    };

    const runGenerateBatch = async (retryCallback: () => void, showCompletedAlert: boolean = true): Promise<'success' | 'done' | 'failed'> => {
        setBatchFailed(false);
        try {
            const startChapIdx = generatedUntilChapterRef.current;
            if (startChapIdx >= chapters.length) {
                if (showCompletedAlert) {
                    alert("小说内容已全部生成完毕！");
                }
                return 'done';
            }

            const currentEpisodes = episodesRef.current;
            const currentHistory = historyRef.current;

            let textChunk = "";
            let endChapIdx = startChapIdx;
            const targetEndIdx = Math.min(startChapIdx + batchSizeChapters, chapters.length);

            for (let i = startChapIdx; i < targetEndIdx; i++) {
                const chapText = chapters[i].content;
                if (textChunk.length > 80000) break;
                textChunk += `Chapter ${chapters[i].id}:\n${chapText}\n\n`;
                endChapIdx = i + 1;
            }

            const startEpId = currentEpisodes.length + 1;

            let prevContext = "";
            if (currentEpisodes.length > 0) {
                const lastEp = currentEpisodes[currentEpisodes.length - 1];
                prevContext = `(上一集 ${lastEp.title} 结尾) ${lastEp.draftEndingHook || ""} \n(剧情梗概) ${lastEp.content.slice(-200)}`;
            }

            const targetNum = targetEpisodeCount ? parseInt(targetEpisodeCount, 10) : null;
            const outlineProgressContext = buildOutlineProgressContext(startChapIdx, currentEpisodes.length);

            const rawEpDrafts = await generateDraftEpisodes(
                apiKey,
                textChunk,
                blueprint,
                startEpId,
                baseUrl,
                selectedModel,
                targetNum,
                prevContext,
                startChapIdx + 1,
                endChapIdx,
                viralTips,
                outlineProgressContext,
            );

            const newEpDrafts = validateAndAdjustChapterRanges(rawEpDrafts, startChapIdx + 1, endChapIdx);

            const convertedEpisodes: Episode[] = newEpDrafts.map((draft: any, idx: number) => {
                const effectiveTargetChapter = (draft.targetChapter && draft.targetChapter.trim().length > 0)
                    ? draft.targetChapter
                    : `第${startChapIdx + 1}章 - 第${endChapIdx}章`;

                const epRange = getChapterRange(effectiveTargetChapter);

                let episodeChars: CharacterProfile[] = [];
                if (draft.appearingCharacterNames && Array.isArray(draft.appearingCharacterNames)) {
                    episodeChars = draft.appearingCharacterNames.map((name: string) => {
                        const found = characters.find(c => c.name.includes(name) || name.includes(c.name));
                        if (found) {
                            return buildCharacterProfileForEpisode(found, epRange);
                        }
                        return { id: Date.now().toString() + Math.random(), name, desc: "未归档角色" };
                    });
                }

                return {
                    id: startEpId + idx,
                    title: draft.title || `第${startEpId + idx}集`,
                    content: draft.mainPlot,
                    targetChapter: effectiveTargetChapter,
                    generatedScript: null,
                    status: 'pending',
                    chatHistory: [],
                    draftOutline: draft.mainPlot,
                    draftOpeningHook: draft.openingHook,
                    draftEndingHook: draft.endingHook,
                    draftEndingClosure: draft.endingClosure,
                    draftKeyQuotes: draft.keyQuotes,
                    draftForeshadowing: draft.foreshadowing,
                    draftWorldSetting: draft.worldSetting,
                    draftCharacterList: episodeChars,
                    viralTips: viralTips,
                    draftNovelContent: "",
                };
            });

            const allEpisodes = [...currentEpisodes, ...convertedEpisodes];
            const chapterUsage = new Map<number, number[]>();

            allEpisodes.forEach(ep => {
                const range = getChapterRange(ep.targetChapter || ep.draftTargetChapter || "");
                if (range) {
                    for (let ch = range.start; ch <= range.end; ch++) {
                        if (!chapterUsage.has(ch)) {
                            chapterUsage.set(ch, []);
                        }
                        chapterUsage.get(ch)!.push(ep.id);
                    }
                }
            });

            const overlaps: string[] = [];
            chapterUsage.forEach((episodeIds, chapterNum) => {
                if (episodeIds.length > 1) {
                    overlaps.push(`第${chapterNum}章被第${episodeIds.join('、')}集重复使用`);
                }
            });

            if (overlaps.length > 0) {
                alert(`⚠️ 检测到章节重叠：\n${overlaps.join('\n')}\n\n建议手动调整各集的"对应章节"字段，确保章节不重叠。`);
            }

            const nextHistory = [...currentHistory, {
                episodesAdded: convertedEpisodes.length,
                previousChapterIndex: startChapIdx,
            }];
            const nextEpisodes = [...currentEpisodes, ...convertedEpisodes];

            historyRef.current = nextHistory;
            episodesRef.current = nextEpisodes;
            generatedUntilChapterRef.current = endChapIdx;

            setHistory(nextHistory);
            setEpisodes(nextEpisodes);
            setGeneratedUntilChapter(endChapIdx);

            return 'success';
        } catch (error: any) {
            console.error(error);
            setBatchFailed(true);
            const handled = handleCapacityError(
                error,
                selectedModel,
                (newModel) => setSelectedModel(newModel),
                retryCallback
            );
            if (!handled) {
                alert("生成失败，请尝试切换模型或减少批次大小");
            }
            return 'failed';
        }
    };

    const generateBatch = async () => {
        if (isGenerating || isAutoGenerating) return;
        setIsGenerating(true);
        try {
            await runGenerateBatch(() => generateBatch());
        } finally {
            setIsGenerating(false);
        }
    };

    const requestPauseAutoGeneration = () => {
        if (!isAutoGenerating || isAutoPausePending) return;
        autoGenerateStopRef.current = true;
        setIsAutoPausePending(true);
    };

    const generateAllBatches = async () => {
        if (isAutoGenerating) {
            requestPauseAutoGeneration();
            return;
        }

        if (isGenerating) return;

        autoGenerateStopRef.current = false;
        setIsAutoPausePending(false);
        setIsAutoGenerating(true);
        setIsGenerating(true);

        let exitReason: 'done' | 'failed' | 'paused' | null = null;

        try {
            while (generatedUntilChapterRef.current < chapters.length) {
                if (autoGenerateStopRef.current) {
                    exitReason = 'paused';
                    break;
                }

                const result = await runGenerateBatch(() => generateAllBatches(), false);
                if (result === 'done') {
                    exitReason = 'done';
                    break;
                }
                if (result === 'failed') {
                    exitReason = 'failed';
                    break;
                }
                if (generatedUntilChapterRef.current >= chapters.length) {
                    exitReason = 'done';
                    break;
                }
                if (autoGenerateStopRef.current) {
                    exitReason = 'paused';
                    break;
                }
            }

            if (!exitReason && generatedUntilChapterRef.current >= chapters.length) {
                exitReason = 'done';
            }

            if (exitReason === 'done') {
                alert('已按当前批次配置自动完成全部集纲生成');
            }
        } finally {
            autoGenerateStopRef.current = false;
            setIsAutoPausePending(false);
            setIsAutoGenerating(false);
            setIsGenerating(false);
        }
    };

    const regenerateEpisode = async (episodeId: number) => {
        const epIndex = episodes.findIndex(e => e.id === episodeId);
        if (epIndex === -1) return;
        const ep = episodes[epIndex];
        
        const epRange = getChapterRange(ep.targetChapter || ep.draftTargetChapter || "");
        if (!epRange || epRange.start === 0) {
            alert("无法识别对应章节，请手动修改对应原著字段（如\"第1-2章\"）再重试");
            return;
        }

        setIsRegeneratingEpId(episodeId);
        try {
            let textChunk = "";
            const targetEndIdx = Math.min(epRange.end, chapters.length);
            for (let i = epRange.start - 1; i < targetEndIdx; i++) {
                if (chapters[i]) {
                    textChunk += `Chapter ${chapters[i].id}:\n${chapters[i].content}\n\n`;
                }
            }

            let prevContext = "";
            if (epIndex > 0) {
                const prevEp = episodes[epIndex - 1];
                prevContext = `(上一集 ${prevEp.title} 结尾) ${prevEp.draftEndingHook || ""} \n(剧情梗概) ${prevEp.content.slice(-200)}`;
            }

            const outlineProgressContext = buildOutlineProgressContext();
            const newEpDrafts = await generateDraftEpisodes(
                apiKey,
                textChunk,
                blueprint,
                ep.id,
                baseUrl,
                selectedModel,
                1,
                prevContext,
                epRange.start,
                epRange.end,
                viralTips,
                outlineProgressContext,
            );

            if (newEpDrafts && newEpDrafts.length > 0) {
                const draft = newEpDrafts[0];
                
                let episodeChars: CharacterProfile[] = [];
                if (draft.appearingCharacterNames && Array.isArray(draft.appearingCharacterNames)) {
                     episodeChars = draft.appearingCharacterNames.map((name: string) => {
                         const found = characters.find(c => c.name.includes(name) || name.includes(c.name));
                         if (found) {
                             return buildCharacterProfileForEpisode(found, epRange);
                         }
                         return { id: Date.now().toString() + Math.random(), name: name, desc: "未归档角色" };
                     });
                }

                const updatedEp: Episode = {
                    ...ep,
                    title: draft.title || ep.title,
                    content: draft.mainPlot,
                    draftOutline: draft.mainPlot,
                    draftOpeningHook: draft.openingHook,
                    draftEndingHook: draft.endingHook,
                    draftEndingClosure: draft.endingClosure,
                    draftKeyQuotes: draft.keyQuotes,
                    draftForeshadowing: draft.foreshadowing,
                    draftWorldSetting: draft.worldSetting,
                    draftCharacterList: episodeChars,
                    viralTips: viralTips // 保持爆款创作技巧
                };

                setEpisodes(prev => prev.map(e => e.id === episodeId ? updatedEp : e));
            }
        } catch (error: any) {
            console.error(error);
            const handled = handleCapacityError(
                error,
                selectedModel,
                (newModel) => setSelectedModel(newModel),
                () => regenerateEpisode(episodeId)
            );
            if (!handled) {
                alert("重生成失败: " + (error.message || "未知错误"));
            }
        } finally {
            setIsRegeneratingEpId(null);
        }
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const lastBatch = history[history.length - 1];
        const newEpisodes = episodes.slice(0, episodes.length - lastBatch.episodesAdded);
        setEpisodes(newEpisodes);
        setGeneratedUntilChapter(lastBatch.previousChapterIndex);
        setHistory(history.slice(0, -1));
    };

    const closeCharacterModal = () => {
        setViewingCharacterContext(null);
        setEditingCharacterDraft(EMPTY_CHARACTER_EDIT_DRAFT);
    };

    const updateCharacterDraftField = (field: 'name' | 'gender' | 'origin' | 'role' | 'bio', value: string) => {
        setEditingCharacterDraft(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    const updateStageDraftField = (
        field: 'currentAge' | 'visualAgeDesc' | 'appearance' | 'physicalState' | 'signatureProps' | 'knownInfo' | 'coreGoal' | 'speakingStyle' | 'personalityTags',
        value: string,
    ) => {
        setEditingCharacterDraft(prev => ({
            ...prev,
            stage: {
                ...prev.stage,
                [field]: value,
            },
        }));
    };

    const addStageRelation = () => {
        setEditingCharacterDraft(prev => ({
            ...prev,
            stage: {
                ...prev.stage,
                relations: [...prev.stage.relations, { ...EMPTY_RELATION_DRAFT }],
            },
        }));
    };

    const updateStageRelation = (index: number, field: keyof CharacterRelation, value: string) => {
        setEditingCharacterDraft(prev => ({
            ...prev,
            stage: {
                ...prev.stage,
                relations: prev.stage.relations.map((relation, relationIndex) => (
                    relationIndex === index ? { ...relation, [field]: value } : relation
                )),
            },
        }));
    };

    const removeStageRelation = (index: number) => {
        setEditingCharacterDraft(prev => ({
            ...prev,
            stage: {
                ...prev.stage,
                relations: prev.stage.relations.filter((_, relationIndex) => relationIndex !== index),
            },
        }));
    };

    const openCharacterModal = (episode: Episode, character: CharacterProfile) => {
        const fallbackSourceRange = episode.targetChapter || episode.draftTargetChapter || '';
        const episodeRange = getChapterRange(fallbackSourceRange);
        const sourceCharacter = findAnalyzedCharacterForProfile(character, characters);
        const matchedStage = getMatchedStageForEpisode(sourceCharacter, episodeRange);

        setViewingCharacterContext({
            episodeId: episode.id,
            characterId: character.id,
        });
        setEditingCharacterDraft(buildCharacterEditorDraft(character, sourceCharacter, matchedStage, fallbackSourceRange));
    };

    const handleSaveCharacterProfile = () => {
        if (!activeViewingCharacter) return;

        const nextName = editingCharacterDraft.name.trim();
        const serializedProfile = serializeCharacterProfileDraft(editingCharacterDraft).trim();

        if (!nextName) {
            alert('人物姓名不能为空');
            return;
        }

        if (!serializedProfile) {
            alert('人物档案不能为空');
            return;
        }

        setEpisodes(prevEpisodes => prevEpisodes.map(episode => {
            if (episode.id !== activeViewingCharacter.episode.id) {
                return episode;
            }

            return {
                ...episode,
                draftCharacterList: (episode.draftCharacterList || []).map(character => (
                    character.id === activeViewingCharacter.character.id
                        ? {
                            ...character,
                            name: nextName,
                            desc: serializedProfile,
                            isCustomized: true,
                        }
                        : character
                )),
            };
        }));
        closeCharacterModal();
    };

    const handleClearOutlineData = () => {
        if (episodes.length === 0) return;

        const confirmed = window.confirm('确认清空当前分集节奏重组数据吗？这会删除已生成的集纲、进度和撤销记录。');
        if (!confirmed) return;

        setEpisodes([]);
        setGeneratedUntilChapter(0);
        setHistory([]);
        setBatchFailed(false);
        closeCharacterModal();
    };

    const handleEpisodeChange = (id: number, field: string, value: string) => {
        setEpisodes(episodes.map(e => {
            if (e.id !== id) return e;

            if (field === 'generatedScript') {
                return {
                    ...e,
                    generatedScript: value,
                    status: value.trim() ? 'completed' : 'pending'
                };
            }

            if (field === 'targetChapter') {
                const nextTargetChapter = canonicalizeChapterRangeText(value || '');
                const episodeRange = getChapterRange(nextTargetChapter || e.draftTargetChapter || '');
                return {
                    ...e,
                    targetChapter: nextTargetChapter,
                    draftCharacterList: refreshCharacterProfileList(e.draftCharacterList, characters, episodeRange),
                };
            }

            return { ...e, [field]: value };
        }));
    };

    const handleGlobalViralTipsChange = (value: string) => {
        setOutlineGlobalSettings(prev => ({
            ...prev,
            viralTips: value,
        }));
        setEpisodes(prev => prev.map(ep => ({ ...ep, viralTips: value })));
    };

    const handleExpectedTotalEpisodeRangeChange = (
        field: 'expectedTotalEpisodesMin' | 'expectedTotalEpisodesMax',
        value: string,
    ) => {
        const parsedValue = parsePositiveInteger(value);
        setOutlineGlobalSettings(prev => ({
            ...prev,
            [field]: parsedValue,
        }));
    };

    const handleExpectedTotalEpisodeRangeBlur = () => {
        setOutlineGlobalSettings(prev => ({
            ...prev,
            ...normalizeEpisodeRange(prev.expectedTotalEpisodesMin, prev.expectedTotalEpisodesMax),
        }));
    };

    const handleFinish = () => {
        onComplete(episodes, outlineGlobalSettings);
    };

    const handleExport = async () => {
        if (episodes.length > 0) {
            const currentName = (novelName || '小说分集大纲').trim() || '小说分集大纲';
            const confirmedName = window.prompt('请确认导出的项目名称', currentName);
            if (confirmedName === null) return;
            const finalName = confirmedName.trim() || currentName;
            onNovelNameChange?.(finalName);
            const { exportOutlineToDocx } = await import('../utils/docxGenerator');
            exportOutlineToDocx(episodes, finalName);
        }
    };

    // Character View Modal
    const CharacterViewModal = () => {
        const viewingCharacter = activeViewingCharacter?.character;
        if (!viewingCharacter) return null;

        const avatarLabel = (editingCharacterDraft.name.trim() || editingCharacterDraft.role.trim() || '人').slice(0, 1);
        const currentRelations = editingCharacterDraft.stage.relations;

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="w-full max-w-6xl h-[92vh] rounded-[32px] border border-purple-100 bg-[#fcfbff] shadow-2xl overflow-hidden flex flex-col">
                    <div className="shrink-0 border-b border-purple-100 bg-white/95 px-6 py-5 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-100 to-fuchsia-100 border border-purple-100 shadow-sm flex items-center justify-center text-lg font-extrabold text-purple-600 shrink-0">
                                {avatarLabel}
                            </div>
                            <div className="min-w-0 xl:min-w-[340px]">
                                <h3 className="text-[26px] leading-none font-extrabold text-gray-800 mb-2">编辑人物档案</h3>
                                <p className="text-sm text-gray-400">构建反 OOC 的时间轴状态机</p>
                            </div>
                        </div>
                        <button
                            onClick={closeCharacterModal}
                            className="w-10 h-10 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0 flex items-center justify-center"
                            title="关闭"
                        >
                            <X className="w-5 h-5"/>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-6 bg-gradient-to-b from-white via-purple-50/20 to-white space-y-7">
                        <div className="rounded-[24px] border border-gray-200 bg-white shadow-sm px-5 py-5">
                            <div className="flex items-center gap-2 mb-5 text-gray-800">
                                <Anchor className="w-4 h-4 text-blue-500"/>
                                <h4 className="text-xl font-extrabold">静态底座 (Static Profile)</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">姓名</label>
                                    <input className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium shadow-sm" value={editingCharacterDraft.name} onChange={e => updateCharacterDraftField('name', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">性别</label>
                                    <input className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium shadow-sm" value={editingCharacterDraft.gender} onChange={e => updateCharacterDraftField('gender', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">籍贯/种族</label>
                                    <input className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium shadow-sm" value={editingCharacterDraft.origin} onChange={e => updateCharacterDraftField('origin', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">功能定位</label>
                                    <input className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium shadow-sm" value={editingCharacterDraft.role} onChange={e => updateCharacterDraftField('role', e.target.value)} />
                                </div>
                                <div className="md:col-span-4">
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">一句话简介</label>
                                    <textarea className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium resize-none shadow-sm" rows={3} value={editingCharacterDraft.bio} onChange={e => updateCharacterDraftField('bio', e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-gray-800">
                                <Sparkles className="w-4 h-4 text-purple-500"/>
                                <h4 className="text-xl font-extrabold">动态时间轴 (Dynamic Timeline)</h4>
                            </div>

                            <div className="rounded-[28px] border border-purple-200 bg-white shadow-sm overflow-hidden">
                                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-purple-100 bg-gradient-to-r from-purple-50/70 via-white to-white">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 text-sm font-extrabold px-3 py-1 shrink-0">Matched Stage</span>
                                        <div className="flex-1 min-w-0 text-[28px] leading-none font-extrabold text-gray-800 truncate">{editingCharacterDraft.stage.stageName || '当前匹配阶段'}</div>
                                        <span className="text-gray-300 text-xl shrink-0">|</span>
                                        <div className="shrink-0 text-base font-medium text-gray-500">{editingCharacterDraft.stage.sourceRange || '当前章节'}</div>
                                    </div>
                                </div>

                                <div className="p-5 space-y-5">
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                                        <div className="rounded-[24px] border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                                            <div className="flex items-center gap-2 text-gray-700 text-sm font-extrabold">
                                                <Eye className="w-4 h-4 text-gray-400"/> 视觉与生理锚点
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">生理年龄</label>
                                                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={editingCharacterDraft.stage.currentAge} onChange={e => updateStageDraftField('currentAge', e.target.value)} placeholder="例如：18岁" />
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">视觉年龄感</label>
                                                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={editingCharacterDraft.stage.visualAgeDesc} onChange={e => updateStageDraftField('visualAgeDesc', e.target.value)} />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">外貌衣着</label>
                                                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={editingCharacterDraft.stage.appearance} onChange={e => updateStageDraftField('appearance', e.target.value)} />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">身体状态 (Action Lines)</label>
                                                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={editingCharacterDraft.stage.physicalState} onChange={e => updateStageDraftField('physicalState', e.target.value)} />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="text-[11px] font-medium text-gray-400 mb-1 block">核心道具</label>
                                                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={editingCharacterDraft.stage.signatureProps} onChange={e => updateStageDraftField('signatureProps', e.target.value)} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-5">
                                            <div className="rounded-[24px] border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                                                <div className="flex items-center gap-2 text-gray-700 text-sm font-extrabold">
                                                    <BrainCircuit className="w-4 h-4 text-gray-400"/> 认知与逻辑锚点
                                                </div>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[11px] font-medium text-gray-400 mb-1 block">已知信息 (防剧透)</label>
                                                        <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={editingCharacterDraft.stage.knownInfo} onChange={e => updateStageDraftField('knownInfo', e.target.value)} placeholder="用逗号分隔" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-extrabold text-rose-400">
                                                            <span>★ 核心行动目标</span>
                                                        </div>
                                                        <textarea className="w-full px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50/60 outline-none focus:border-rose-300 focus:bg-white text-gray-700 font-semibold resize-none shadow-sm" rows={2} value={editingCharacterDraft.stage.coreGoal} onChange={e => updateStageDraftField('coreGoal', e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-[24px] border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                                                <div className="flex items-center gap-2 text-gray-700 text-sm font-extrabold">
                                                    <Mic2 className="w-4 h-4 text-gray-400"/> 语言与性格锚点
                                                </div>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[11px] font-medium text-gray-400 mb-1 block">说话风格</label>
                                                        <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={editingCharacterDraft.stage.speakingStyle} onChange={e => updateStageDraftField('speakingStyle', e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] font-medium text-gray-400 mb-1 block">性格标签</label>
                                                        <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={editingCharacterDraft.stage.personalityTags} onChange={e => updateStageDraftField('personalityTags', e.target.value)} placeholder="用逗号分隔" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-[24px] border border-purple-100 bg-purple-50/20 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 text-gray-700 text-sm font-extrabold">
                                                <HeartHandshake className="w-4 h-4 text-gray-400"/> 关键关系网络
                                            </div>
                                            <button onClick={addStageRelation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold hover:bg-purple-200 transition-colors shrink-0">
                                                <Plus className="w-3.5 h-3.5"/> 添加关系
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {currentRelations.map((relation, index) => (
                                                <div key={index} className="grid grid-cols-1 md:grid-cols-[120px_20px_140px_1fr_auto] gap-2 items-center rounded-2xl border border-purple-100 bg-white px-3 py-2 shadow-sm">
                                                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300" value={relation.target} onChange={e => updateStageRelation(index, 'target', e.target.value)} placeholder="对象" />
                                                    <div className="hidden md:flex items-center justify-center text-gray-300">
                                                        <ArrowRight className="w-4 h-4"/>
                                                    </div>
                                                    <input className="w-full px-3 py-2 rounded-xl border border-purple-100 bg-purple-50 text-purple-600 font-semibold outline-none focus:border-purple-300" value={relation.attitude} onChange={e => updateStageRelation(index, 'attitude', e.target.value)} placeholder="态度" />
                                                    <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300" value={relation.subtext} onChange={e => updateStageRelation(index, 'subtext', e.target.value)} placeholder="潜台词 / 关系说明" />
                                                    <button onClick={() => removeStageRelation(index)} className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors justify-self-end">
                                                        <X className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                            ))}
                                            {currentRelations.length === 0 && (
                                                <div className="text-xs text-gray-400 px-1 py-2">暂无关系数据</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="shrink-0 border-t border-purple-100 bg-white/95 px-6 py-4 flex items-center justify-between gap-3">
                        <div></div>
                        <div className="flex items-center gap-2">
                        <button onClick={closeCharacterModal} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition-colors">
                            取消
                        </button>
                        <button onClick={handleSaveCharacterProfile} className="px-6 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-primary-hover transition-colors shadow-sm">
                            保存人物档案
                        </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const hasUndoHistory = history.length > 0;
    const isBusy = isGenerating || isAutoGenerating;

    const renderAutoGenerateAction = () => (
        <button 
            onClick={generateAllBatches}
            disabled={((!isAutoGenerating && isBusy) || generatedUntilChapter >= chapters.length || isAutoPausePending)}
            className={`flex shrink-0 items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg whitespace-nowrap ${
                isAutoGenerating ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                ((!isAutoGenerating && isBusy) || isAutoPausePending) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 
                generatedUntilChapter >= chapters.length ? 'bg-green-100 text-green-700' :
                'bg-indigo-500 text-white hover:bg-indigo-600 hover:scale-105 active:scale-95'
            }`}
            title={isAutoGenerating ? '点击后会在当前批次完成后暂停自动生成' : '按当前批次配置自动连续生成，必须上一批成功后才会继续下一批'}
        >
            {isAutoGenerating ? <PauseCircle className={`w-4 h-4 ${isAutoPausePending ? 'animate-pulse' : ''}`}/> : <Play className="w-4 h-4"/>}
            {isAutoPausePending ? '暂停中...' : isAutoGenerating ? '暂停' : generatedUntilChapter >= chapters.length ? '已完结' : '自动生成'}
        </button>
    );

    const renderGenerateAction = () => {
        if (batchFailed) {
            return (
                <div className="flex flex-col gap-1 items-end shrink-0">
                    <button 
                        onClick={generateBatch}
                        disabled={isBusy}
                        className={`flex shrink-0 items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg ${
                            isBusy ? 'bg-orange-200 text-orange-500 cursor-not-allowed' : 
                            'bg-orange-500 text-white hover:bg-orange-600 hover:scale-105 active:scale-95'
                        }`}
                        title="点击重试失败的集纲生成任务"
                    >
                        <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`}/>
                        {isBusy ? '重试中...' : '重试最后批次'}
                    </button>
                    <span className="text-[10px] text-orange-400 font-extrabold animate-pulse">⚠️ 上一批中断，点击重新生成</span>
                </div>
            );
        }

        return (
            <button 
                onClick={generateBatch}
                disabled={isBusy || generatedUntilChapter >= chapters.length}
                className={`flex shrink-0 items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg whitespace-nowrap ${
                    isBusy ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 
                    generatedUntilChapter >= chapters.length ? 'bg-green-100 text-green-700' :
                    'bg-accent text-white hover:bg-teal-600 hover:scale-105 active:scale-95'
                }`}
            >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
                {isBusy ? (isAutoGenerating ? '自动生成中...' : '重组中...') : generatedUntilChapter >= chapters.length ? '已完结' : '下一批'}
            </button>
        );
    };

    return (
        <div className="h-screen flex flex-col bg-paper">
            <CapacityErrorModal />
            <CharacterViewModal />
            {/* Header */}
            <div className="min-h-16 bg-white border-b border-gray-100 flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 lg:px-6 shrink-0 z-20">
                
                {/* Left: nav + title */}
                <div className="flex items-center gap-3 min-w-0 shrink-0 pr-0">
                    <button
                        onClick={onGoBack}
                        className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
                        title="返回上一步"
                    >
                        <ArrowRight className="w-5 h-5 rotate-180"/>
                    </button>
                    <button
                        onClick={onNewProject}
                        className="w-10 h-10 rounded-xl bg-blue-100 hover:bg-blue-200 flex items-center justify-center text-blue-600 transition-colors"
                        title="重新开启新项目"
                    >
                        <Sparkles className="w-5 h-5"/>
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600 shrink-0">
                        <LayoutList className="w-6 h-6"/>
                    </div>
                    <div className="min-w-0">
                        <h2 className="font-extrabold text-lg text-gray-800">分集节奏重组</h2>
                        <p className="text-xs text-gray-400">第二步：规划短剧集数</p>
                    </div>
                </div>

                {/* Right: config + progress + actions */}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 lg:gap-3">
                        {/* Config bar */}
                    <div className="flex shrink-0 max-w-full flex-wrap items-center gap-1.5 bg-gray-50 px-2 py-1.5 rounded-xl border border-gray-200">
                        <Settings className="w-3.5 h-3.5 text-gray-400 shrink-0"/>
                        <select 
                            value={selectedModel} 
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="w-28 xl:w-36 bg-transparent text-xs font-bold text-gray-600 outline-none border-none cursor-pointer"
                        >
                            {AVAILABLE_MODELS.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                        <div className="w-px h-4 bg-gray-300 mx-0.5 shrink-0"></div>
                        <span className="text-[11px] text-gray-500 whitespace-nowrap">原文</span>
                        <select 
                            value={batchSizeChapters} 
                            onChange={(e) => setBatchSizeChapters(Number(e.target.value))}
                            className="bg-transparent text-xs font-bold text-accent outline-none border-none cursor-pointer whitespace-nowrap"
                        >
                            <option value="5">5章/批</option>
                            <option value="10">10章/批</option>
                            <option value="15">15章/批</option>
                            <option value="20">20章/批</option>
                        </select>
                        <div className="w-px h-4 bg-gray-300 mx-1 shrink-0"></div>
                        <span className="text-[11px] text-gray-500 whitespace-nowrap">生成</span>
                        <div className="flex items-center gap-1 shrink-0">
                            <input 
                                type="number" min="1" max="20" placeholder="自动" 
                                className="w-10 bg-transparent text-xs font-bold text-accent outline-none border-b border-gray-300 focus:border-accent text-center"
                                value={targetEpisodeCount}
                                onChange={(e) => setTargetEpisodeCount(e.target.value)}
                            />
                            <span className="text-[11px] text-gray-400">集</span>
                        </div>
                    </div>

                    {/* Progress pill */}
                    <div className="flex shrink-0 items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                        <Activity className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-xs font-bold text-gray-600 whitespace-nowrap">
                            进度 {generatedUntilChapter}/{chapters.length}
                        </span>
                        <div className="w-12 lg:w-16 h-2 bg-gray-200 rounded-full overflow-hidden shrink-0">
                            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, (generatedUntilChapter / (chapters.length || 1)) * 100)}%` }}></div>
                        </div>
                    </div>

                    {hasUndoHistory && (
                        <button 
                            onClick={handleUndo}
                            disabled={isBusy}
                            className="flex shrink-0 items-center gap-1.5 px-3 py-2.5 bg-white border border-red-200 text-red-500 rounded-full text-sm font-bold hover:bg-red-50 transition-all disabled:opacity-50 disabled:text-red-300 disabled:border-red-100 disabled:hover:bg-white"
                            title="撤销上一批生成"
                        >
                            <RotateCcw className="w-4 h-4"/>
                            撤销
                        </button>
                    )}

                    {hasUndoHistory && renderGenerateAction()}
                    </div>

                    <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 lg:gap-3">
                        {renderAutoGenerateAction()}
                        {!hasUndoHistory && renderGenerateAction()}

                        <button 
                            onClick={handleClearOutlineData}
                            disabled={episodes.length === 0 || isBusy}
                            className="flex shrink-0 items-center gap-1 px-3 py-2.5 bg-white border border-red-200 text-red-500 rounded-full text-sm font-bold hover:bg-red-50 transition-all disabled:opacity-50 disabled:text-red-300 disabled:border-red-100 disabled:hover:bg-white whitespace-nowrap"
                            title="清空当前分集节奏重组数据"
                        >
                            <Trash2 className="w-4 h-4"/>
                            清空
                        </button>

                        {/* Export */}
                        <button 
                            onClick={handleExport}
                            disabled={episodes.length === 0}
                            className="flex shrink-0 items-center justify-center w-10 h-10 bg-white border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-all disabled:opacity-50"
                            title="导出分集大纲为 Word"
                        >
                            <FileDown className="w-4 h-4"/>
                        </button>

                        {/* Finish */}
                        <button 
                            onClick={handleFinish}
                            disabled={episodes.length === 0}
                            className="flex shrink-0 items-center gap-1.5 px-4 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold hover:bg-black transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                            完成 <ArrowRight className="w-4 h-4"/>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
                <div className="max-w-7xl mx-auto flex gap-6">
                    {/* 左侧：全局创作设置 */}
                    <div className="w-80 shrink-0 space-y-4">
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 sticky top-0">
                            <div className="flex items-center gap-2 mb-4">
                                <Sparkles className="w-5 h-5 text-orange-500"/>
                                <h3 className="font-extrabold text-gray-800">全局创作设置</h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-2 block">
                                        期望总集数区间
                                    </label>
                                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl text-sm p-3 focus:ring-2 focus:ring-teal-200 focus:border-accent text-center"
                                            value={outlineGlobalSettings.expectedTotalEpisodesMin ?? ''}
                                            onChange={(e) => handleExpectedTotalEpisodeRangeChange('expectedTotalEpisodesMin', e.target.value)}
                                            onBlur={handleExpectedTotalEpisodeRangeBlur}
                                            placeholder="最少集数"
                                        />
                                        <span className="text-sm font-bold text-gray-400 text-center">~</span>
                                        <input
                                            type="number"
                                            min="1"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl text-sm p-3 focus:ring-2 focus:ring-teal-200 focus:border-accent text-center"
                                            value={outlineGlobalSettings.expectedTotalEpisodesMax ?? ''}
                                            onChange={(e) => handleExpectedTotalEpisodeRangeChange('expectedTotalEpisodesMax', e.target.value)}
                                            onBlur={handleExpectedTotalEpisodeRangeBlur}
                                            placeholder="最多集数"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">
                                        💡 这会影响全局拆分节奏，越接近尾声越会向这个整体区间收敛
                                    </p>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                                        <Target className="w-4 h-4 text-teal-500"/>
                                        节奏预估
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 gap-4">
                                        <span>期望总集数区间</span>
                                        <span className="font-bold text-gray-800 whitespace-nowrap">
                                            {formatEpisodeRangeLabel(
                                                outlineGlobalSettings.expectedTotalEpisodesMin,
                                                outlineGlobalSettings.expectedTotalEpisodesMax,
                                                '未设置'
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 gap-4">
                                        <span>按当前节奏预估总集数</span>
                                        <span className="font-bold text-gray-800 whitespace-nowrap">
                                            {estimatedTotalEpisodes !== null ? `约 ${estimatedTotalEpisodes} 集` : '生成若干集后显示'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 gap-4">
                                        <span>剩余可用集数区间</span>
                                        <span className="font-bold text-gray-800 whitespace-nowrap">{remainingEpisodeRangeLabel}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-2 block">
                                        爆款创作技巧
                                    </label>
                                    <textarea
                                        rows={8}
                                        className="w-full bg-orange-50/50 border border-orange-200 rounded-xl text-sm p-3 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 resize-none"
                                        value={viralTips}
                                        onChange={(e) => handleGlobalViralTipsChange(e.target.value)}
                                        placeholder={"例如：\n• 强化反转和悬念设计\n• 突出情绪冲突点\n• 增加视觉冲击力\n• 快节奏叙事，避免拖沓\n• 每集结尾留钩子..."}
                                    />
                                    <p className="text-xs text-gray-400 mt-2">
                                        💡 这些技巧会写入集纲生成 Prompt，并同步到当前所有集的创作技巧字段
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 右侧：集纲列表 */}
                    <div className="flex-1 space-y-6">
                        {episodes.length === 0 && (
                            <div className="text-center py-20 text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl">
                                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20"/>
                                <p>点击上方"下一批"开始规划</p>
                                <p className="text-xs mt-2 opacity-60">建议先设置每批读取的章节数，AI 会自动拆解短剧节奏</p>
                            </div>
                        )}

                        {episodes.map((ep, index) => (
                        <div key={ep.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 group hover:shadow-md transition-shadow relative">
                            <div className="absolute left-4 top-6 cursor-grab text-gray-300 hover:text-gray-500">
                                <GripVertical className="w-5 h-5"/>
                            </div>
                            
                            <div className="pl-8">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex-1 mr-4">
                                        <input 
                                            className="font-extrabold text-lg text-gray-800 w-full border-none focus:ring-0 p-0 placeholder-gray-300 bg-transparent"
                                            value={ep.title}
                                            onChange={(e) => handleEpisodeChange(ep.id, 'title', e.target.value)}
                                        />
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">对应原著</span>
                                            <input 
                                                className="text-xs text-gray-500 w-40 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-accent outline-none"
                                                value={ep.targetChapter || ""}
                                                onChange={(e) => handleEpisodeChange(ep.id, 'targetChapter', e.target.value)}
                                                placeholder="例如: 第1-2章"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => regenerateEpisode(ep.id)} 
                                            disabled={isRegeneratingEpId === ep.id}
                                            className="text-gray-300 hover:text-blue-500 p-2 disabled:opacity-50" 
                                            title="重新生成本集"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${isRegeneratingEpId === ep.id ? 'animate-spin' : ''}`}/>
                                        </button>
                                    </div>
                                </div>

                                {/* Rich Outline Content */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    {/* Left: Main Plot & Hooks (7 cols) */}
                                    <div className="lg:col-span-7 space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">核心剧情</label>
                                            <textarea 
                                                className="w-full bg-gray-50 border-none rounded-xl text-sm p-3 focus:ring-2 focus:ring-accent/20 resize-none h-32"
                                                value={ep.content}
                                                onChange={(e) => handleEpisodeChange(ep.id, 'content', e.target.value)}
                                            />
                                        </div>
                                        {(index === 0 || isSeriesEndingEpisode(ep)) && (
                                            <div className="grid grid-cols-1 gap-3 mt-3">
                                                {index === 0 && (
                                                    <div>
                                                        <label className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1 block">开篇钩子 (仅第一集)</label>
                                                        <textarea 
                                                            rows={3}
                                                            className="w-full bg-amber-50/50 border-none rounded-lg text-xs p-2.5 focus:ring-2 focus:ring-amber-200 resize-none"
                                                            value={ep.draftOpeningHook || ""}
                                                            onChange={(e) => handleEpisodeChange(ep.id, 'draftOpeningHook', e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                                {isSeriesEndingEpisode(ep) && (
                                                    <div>
                                                        <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 block">结尾收尾 (仅结尾集)</label>
                                                        <textarea 
                                                            rows={3}
                                                            className="w-full bg-emerald-50/60 border border-emerald-100 rounded-lg text-xs p-2.5 focus:ring-2 focus:ring-emerald-200 resize-none"
                                                            value={ep.draftEndingClosure || ""}
                                                            onChange={(e) => handleEpisodeChange(ep.id, 'draftEndingClosure', e.target.value)}
                                                            placeholder="例如：主线如何落地、人物命运如何安放、最后一击的情绪余韵如何收束..."
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Right: Meta & Characters (5 cols) */}
                                    <div className="lg:col-span-5 space-y-4">
                                        {/* Character List */}
                                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                            <label className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <Users className="w-3 h-3"/> 本集出场
                                            </label>
                                            <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto">
                                                {ep.draftCharacterList && ep.draftCharacterList.length > 0 ? (
                                                    ep.draftCharacterList.map((c, i) => (
                                                        <button 
                                                            key={i} 
                                                            onClick={() => openCharacterModal(ep, c)}
                                                            className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded-full text-gray-700 shadow-sm hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-colors flex items-center gap-1 group/btn" 
                                                            title="点击查看人设"
                                                        >
                                                            {c.name}
                                                            <User className="w-2.5 h-2.5 text-gray-300 group-hover/btn:text-purple-400"/>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <span className="text-[10px] text-gray-400 italic">自动提取中...</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Quotes Only (Removed Tone) */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block flex items-center gap-1"><Quote className="w-3 h-3"/> 关键台词</label>
                                            <input 
                                                className="w-full bg-gray-50 border-none rounded-lg text-xs p-2 focus:ring-2 focus:ring-gray-200"
                                                value={ep.draftKeyQuotes || ""}
                                                onChange={(e) => handleEpisodeChange(ep.id, 'draftKeyQuotes', e.target.value)}
                                                placeholder="..."
                                            />
                                        </div>

                                        {/* World Setting */}
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block flex items-center gap-1"><Globe className="w-3 h-3"/> 世界观 / 金手指</label>
                                            <textarea
                                                rows={2}
                                                className="w-full bg-gray-50 border-none rounded-lg text-xs p-2.5 focus:ring-2 focus:ring-gray-200 resize-none"
                                                value={ep.draftWorldSetting || ""}
                                                onChange={(e) => handleEpisodeChange(ep.id, 'draftWorldSetting', e.target.value)}
                                                placeholder="特殊设定..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OutlineBuilder;
