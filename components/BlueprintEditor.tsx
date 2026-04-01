
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Chapter, StoryBlueprint, AnalyzedCharacter, PlotPhase, StoryArcNode, PlotEvent, CharacterStage, CharacterRelation, AnalysisRange, BlueprintRetrySnapshot } from '../types';
import { analyzeNovelStory, analyzeArchitectureOnly, analyzeOutlineOnly, analyzeCharactersOnly, AVAILABLE_MODELS, getRecommendedModel } from '../services/geminiService';
import { Play, PauseCircle, Loader2, Sparkles, User, Target, TrendingUp, Users, ArrowRight, BrainCircuit, Activity, Settings, Edit2, Trash2, Plus, X, Skull, ListTree, BookOpen, RefreshCw, Save, ChevronDown, ChevronUp, Star, Zap, Globe, Quote, Sword, FileDown, Eye, MessageSquare, Briefcase, Mic2, Anchor, Fingerprint, Map, AlertCircle, CheckCircle2, HeartHandshake, Home, HelpCircle } from 'lucide-react';
import { useCapacityErrorHandler } from '../utils/useCapacityErrorHandler';
import { useDebouncedEffect } from '../utils/useDebouncedEffect';
import { normalizeCharacterStages, normalizePlotPhases } from '../utils/chapterRangeNormalization';
import { mergeArchitectureIntoBlueprint } from '../utils/architectureMerge';

type HintTone = 'slate' | 'blue' | 'red' | 'emerald' | 'purple';
type HintSize = 'sm' | 'xs';
type HintAlign = 'left' | 'right';
type HintPlacement = 'bottom' | 'top';

const hintStyles: Record<HintTone, { button: string; badge: string; panel: string; icon: string }> = {
    slate: {
        button: 'border-slate-200 bg-slate-50/80 text-slate-400 hover:bg-slate-100 hover:text-slate-500 focus-visible:ring-slate-100',
        badge: 'bg-slate-50 text-slate-600',
        panel: 'border-slate-100',
        icon: 'text-slate-600',
    },
    blue: {
        button: 'border-blue-200 bg-blue-50/80 text-blue-400 hover:bg-blue-100 hover:text-blue-500 focus-visible:ring-blue-100',
        badge: 'bg-blue-50 text-blue-600',
        panel: 'border-blue-100',
        icon: 'text-blue-500',
    },
    red: {
        button: 'border-red-200 bg-red-50/80 text-red-400 hover:bg-red-100 hover:text-red-500 focus-visible:ring-red-100',
        badge: 'bg-red-50 text-red-600',
        panel: 'border-red-100',
        icon: 'text-red-500',
    },
    emerald: {
        button: 'border-emerald-200 bg-emerald-50/80 text-emerald-400 hover:bg-emerald-100 hover:text-emerald-500 focus-visible:ring-emerald-100',
        badge: 'bg-emerald-50 text-emerald-600',
        panel: 'border-emerald-100',
        icon: 'text-emerald-600',
    },
    purple: {
        button: 'border-purple-200 bg-purple-50/80 text-purple-400 hover:bg-purple-100 hover:text-purple-500 focus-visible:ring-purple-100',
        badge: 'bg-purple-50 text-purple-700',
        panel: 'border-purple-100',
        icon: 'text-purple-700',
    },
};

const hintButtonSizes: Record<HintSize, string> = {
    sm: 'h-5 w-5',
    xs: 'h-4 w-4',
};

const hintIconSizes: Record<HintSize, string> = {
    sm: 'w-3.5 h-3.5',
    xs: 'w-3 h-3',
};

const InfoHint: React.FC<{
    title: string;
    summary: string;
    metaphor?: string;
    tone: HintTone;
    size?: HintSize;
    align?: HintAlign;
    placement?: HintPlacement;
    widthClass?: string;
}> = ({ title, summary, metaphor, tone, size = 'sm', align = 'left', placement = 'bottom', widthClass = 'w-[22rem]' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});
    const styles = hintStyles[tone];
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const closeTimerRef = useRef<number | null>(null);

    const clearCloseTimer = () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };

    const openHint = () => {
        clearCloseTimer();
        setIsOpen(true);
    };

    const closeHint = () => {
        clearCloseTimer();
        setIsOpen(false);
    };

    const scheduleClose = () => {
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 120);
    };

    const updatePosition = () => {
        const button = buttonRef.current;
        const panel = panelRef.current;
        if (!button || !panel) return;

        const buttonRect = button.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const viewportPadding = 16;
        const gap = 10;

        let left = align === 'right' ? buttonRect.right - panelRect.width : buttonRect.left;
        left = Math.min(Math.max(left, viewportPadding), window.innerWidth - panelRect.width - viewportPadding);

        const topIfBottom = buttonRect.bottom + gap;
        const topIfTop = buttonRect.top - panelRect.height - gap;
        const canShowBottom = topIfBottom + panelRect.height <= window.innerHeight - viewportPadding;
        const canShowTop = topIfTop >= viewportPadding;

        let top = placement === 'top'
            ? (canShowTop ? topIfTop : topIfBottom)
            : (canShowBottom ? topIfBottom : topIfTop);

        top = Math.max(viewportPadding, Math.min(top, window.innerHeight - panelRect.height - viewportPadding));

        setPortalStyle({
            position: 'fixed',
            top,
            left,
            zIndex: 2147483647,
        });
    };

    useEffect(() => {
        if (!isOpen) return;

        const rafId = window.requestAnimationFrame(updatePosition);
        const handleViewportChange = () => updatePosition();
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            closeHint();
        };

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);
        document.addEventListener('mousedown', handlePointerDown);

        return () => {
            window.cancelAnimationFrame(rafId);
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [isOpen, align, placement]);

    useEffect(() => () => clearCloseTimer(), []);

    return (
        <>
            <div className="inline-flex items-center shrink-0">
                <button
                    ref={buttonRef}
                    type="button"
                    onMouseEnter={openHint}
                    onMouseLeave={scheduleClose}
                    onFocus={openHint}
                    onBlur={scheduleClose}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (isOpen) {
                            closeHint();
                            return;
                        }
                        openHint();
                    }}
                    className={`inline-flex items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 ${hintButtonSizes[size]} ${styles.button}`}
                    aria-label={`${title}说明`}
                    title={`${title}说明`}
                >
                    <HelpCircle className={hintIconSizes[size]} />
                </button>
            </div>
            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    style={portalStyle}
                    onMouseEnter={openHint}
                    onMouseLeave={scheduleClose}
                    className={`pointer-events-auto max-w-[calc(100vw-2rem)] rounded-xl border bg-white p-3 shadow-2xl ${widthClass} ${styles.panel}`}
                >
                    <div className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ${styles.badge}`}>
                        {title}怎么理解
                    </div>
                    <p className="mt-2 text-xs leading-5 text-gray-600">{summary}</p>
                    {metaphor && <p className={`mt-2 text-xs leading-5 font-medium ${styles.icon}`}>简单理解：{metaphor}</p>}
                </div>,
                document.body
            )}
        </>
    );
};

interface BlueprintEditorProps {
    chapters: Chapter[];
    initialBlueprint: StoryBlueprint | null;
    initialCharacters: AnalyzedCharacter[];
    initialLastAnalysisRange?: AnalysisRange | null;
    initialRetrySnapshot?: BlueprintRetrySnapshot | null;
    onComplete: (blueprint: StoryBlueprint, characters: AnalyzedCharacter[]) => void;
    onAutoSave?: (blueprint: StoryBlueprint | null, characters: AnalyzedCharacter[], lastAnalysisRange: AnalysisRange | null, retrySnapshot: BlueprintRetrySnapshot | null) => void;
    onNewProject: () => void;
    onGoBack: (() => void) | null; // null 表示没有上一步
    apiKey: string;
    baseUrl?: string;
    novelName?: string;
    onNovelNameChange?: (name: string) => void;
}

const BlueprintEditor: React.FC<BlueprintEditorProps> = ({ chapters, initialBlueprint, initialCharacters, initialLastAnalysisRange = null, initialRetrySnapshot = null, onComplete, onAutoSave, onNewProject, onGoBack, apiKey, baseUrl, novelName, onNovelNameChange }) => {
    const [blueprint, setBlueprint] = useState<StoryBlueprint | null>(() => initialBlueprint ? ({
        ...initialBlueprint,
        mainPlotArc: {
            ...initialBlueprint.mainPlotArc,
            phases: normalizePlotPhases(initialBlueprint.mainPlotArc?.phases || []),
        },
    }) : null);
    const [characters, setCharacters] = useState<AnalyzedCharacter[]>(() => initialCharacters.map(character => ({
        ...character,
        timeline: normalizeCharacterStages(character.timeline || []),
    })));

    // Capacity Error Handler
    const { CapacityErrorModal, handleError: handleCapacityError } = useCapacityErrorHandler();

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    // Initialize progress from saved blueprint so the counter survives page refresh
    const [progress, setProgress] = useState<number>(() => initialBlueprint?.analyzedChapters ?? 0);

    // Track the last analysis range for "Retry" functionality
    const [lastAnalysisRange, setLastAnalysisRange] = useState<AnalysisRange | null>(initialLastAnalysisRange);
    const [retryingSection, setRetryingSection] = useState<string | null>(null);
    const [failedTasks, setFailedTasks] = useState<string[]>([]);
    
    // Snapshot state for Rollback/Replace logic
    const [snapshot, setSnapshot] = useState<BlueprintRetrySnapshot | null>(initialRetrySnapshot);

    // Auto-save mechanism: whenever blueprint or characters change, bubble it up to App.tsx
    useDebouncedEffect(() => {
        if (onAutoSave) {
            onAutoSave(blueprint, characters, lastAnalysisRange, snapshot);
        }
    }, [blueprint, characters, lastAnalysisRange, snapshot, onAutoSave], 300);

    // Feedback State
    const [toast, setToast] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);

    // Configuration State
    const [selectedModel, setSelectedModel] = useState<string>(() => getRecommendedModel('analysis'));
    const [fallbackModel, setFallbackModel] = useState<string>(() => getRecommendedModel('fallback'));
    const [batchSize, setBatchSize] = useState<number>(10);
    const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);
    const [isAutoPausePending, setIsAutoPausePending] = useState(false);
    const [enableGeminiFallback, setEnableGeminiFallback] = useState(true);

    const blueprintRef = useRef<StoryBlueprint | null>(blueprint);
    const charactersRef = useRef<AnalyzedCharacter[]>(characters);
    const progressRef = useRef<number>(progress);
    const lastAnalysisRangeRef = useRef<AnalysisRange | null>(lastAnalysisRange);
    const failedTasksRef = useRef<string[]>(failedTasks);
    const snapshotRef = useRef<BlueprintRetrySnapshot | null>(snapshot);
    const autoAnalyzeStopRef = useRef(false);

    // Character Editing State
    const [isCharModalOpen, setIsCharModalOpen] = useState(false);
    const [editingCharId, setEditingCharId] = useState<string | null>(null);
    
    // Initial empty character for the modal
    const EMPTY_CHAR: AnalyzedCharacter = {
        id: '', name: '', gender: '', origin: '', role: '配角', bio: '', timeline: []
    };
    const [tempCharData, setTempCharData] = useState<AnalyzedCharacter>(EMPTY_CHAR);
    
    // Expand State for Character Card Phases in Sidebar
    const [expandedCharId, setExpandedCharId] = useState<string | null>(null);

    // Tab State for Left Panel
    const [activeTab, setActiveTab] = useState<'architecture' | 'timeline'>('architecture');

    // Confirm Modal State (replaces window.confirm)
    const [confirmState, setConfirmState] = useState<{message: string; onConfirm: () => void} | null>(null);
    const askConfirm = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm });
    const closeConfirm = () => setConfirmState(null);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const showToast = (type: 'success' | 'error' | 'info', message: string) => {
        setToast({ type, message });
    };



    useEffect(() => {
        blueprintRef.current = blueprint;
    }, [blueprint]);

    useEffect(() => {
        charactersRef.current = characters;
    }, [characters]);

    useEffect(() => {
        progressRef.current = progress;
    }, [progress]);

    useEffect(() => {
        lastAnalysisRangeRef.current = lastAnalysisRange;
    }, [lastAnalysisRange]);

    useEffect(() => {
        failedTasksRef.current = failedTasks;
    }, [failedTasks]);

    useEffect(() => {
        snapshotRef.current = snapshot;
    }, [snapshot]);

    const syncBlueprintState = (value: StoryBlueprint | null) => {
        blueprintRef.current = value;
        setBlueprint(value);
    };

    const syncCharactersState = (value: AnalyzedCharacter[]) => {
        charactersRef.current = value;
        setCharacters(value);
    };

    const syncProgressState = (value: number) => {
        progressRef.current = value;
        setProgress(value);
    };

    const syncLastAnalysisRangeState = (value: AnalysisRange | null) => {
        lastAnalysisRangeRef.current = value;
        setLastAnalysisRange(value);
    };

    const syncFailedTasksState = (value: string[]) => {
        failedTasksRef.current = value;
        setFailedTasks(value);
    };

    const syncSnapshotState = (value: BlueprintRetrySnapshot | null) => {
        snapshotRef.current = value;
        setSnapshot(value);
    };

    const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

    const buildBatchText = (startIdx: number, endIdx: number) => (
        chapters.slice(startIdx, endIdx).map(c => `Chapter ${c.id} [${c.title}]:\n${c.content}`).join("\n\n")
    );

    const createBatchContext = () => {
        const currentBlueprint = blueprintRef.current ? cloneValue(blueprintRef.current) : null;
        const currentCharacters = cloneValue(charactersRef.current);
        const startIdx = currentBlueprint ? currentBlueprint.analyzedChapters : 0;

        if (startIdx >= chapters.length) {
            return null;
        }

        const endIdx = Math.min(startIdx + batchSize, chapters.length);
        const nextSnapshot: BlueprintRetrySnapshot = {
            blueprint: currentBlueprint,
            characters: currentCharacters,
        };

        syncSnapshotState(nextSnapshot);

        return {
            currentBlueprint,
            currentCharacters,
            startIdx,
            endIdx,
            batchText: buildBatchText(startIdx, endIdx),
        };
    };

    const applyAnalysisResult = (
        result: { blueprint: StoryBlueprint; characters: AnalyzedCharacter[]; failedTasks: string[] },
        currentBlueprint: StoryBlueprint | null,
        startIdx: number,
        endIdx: number,
    ) => {
        const actualProcessed = endIdx - startIdx;
        const nextBlueprint: StoryBlueprint = {
            ...result.blueprint,
            analyzedChapters: (currentBlueprint?.analyzedChapters || 0) + actualProcessed,
        };

        syncBlueprintState(nextBlueprint);
        syncCharactersState(result.characters);
        syncLastAnalysisRangeState({ start: startIdx, end: endIdx });

        if (result.failedTasks && result.failedTasks.length > 0) {
            syncFailedTasksState(result.failedTasks);
            return {
                ok: false,
                actualProcessed,
                failedTasks: result.failedTasks,
            };
        }

        syncFailedTasksState([]);
        syncProgressState(nextBlueprint.analyzedChapters);

        return {
            ok: true,
            actualProcessed,
            failedTasks: [] as string[],
        };
    };

    const runAnalyzeBatchWithModel = async (
        modelId: string,
        batchContext: NonNullable<ReturnType<typeof createBatchContext>>,
    ) => {
        try {
            const result = await analyzeNovelStory(
                apiKey,
                batchContext.batchText,
                batchContext.currentBlueprint,
                batchContext.currentCharacters,
                baseUrl,
                modelId,
            );

            const applied = applyAnalysisResult(
                result,
                batchContext.currentBlueprint,
                batchContext.startIdx,
                batchContext.endIdx,
            );

            return applied.ok
                ? { status: 'success' as const, actualProcessed: applied.actualProcessed }
                : { status: 'partial' as const, actualProcessed: applied.actualProcessed, failedTasks: applied.failedTasks };
        } catch (error: any) {
            syncFailedTasksState(['arch', 'outline', 'char']);
            syncLastAnalysisRangeState({ start: batchContext.startIdx, end: batchContext.endIdx });

            return {
                status: 'error' as const,
                actualProcessed: batchContext.endIdx - batchContext.startIdx,
                failedTasks: ['arch', 'outline', 'char'],
                error,
            };
        }
    };

    const firstBatchFallbackSnapshot: BlueprintRetrySnapshot = {
        blueprint: null,
        characters: [],
    };

    const getRetrySnapshot = (): BlueprintRetrySnapshot | null => {
        if (snapshotRef.current) return snapshotRef.current;
        if (lastAnalysisRangeRef.current?.start === 0) return firstBatchFallbackSnapshot;
        return null;
    };

    const canRetryLastBatch = Boolean(lastAnalysisRange && getRetrySnapshot());

    const resolveFailedTasksWithModel = async (tasks: string[], modelId: string, silent: boolean = false) => {
        const remaining: string[] = [];

        if (tasks.includes('arch')) {
            const success = await retryArchitecture({ modelId, silent });
            if (!success) remaining.push('arch');
        }

        if (tasks.includes('outline')) {
            const success = await retryOutline({ modelId, silent });
            if (!success) remaining.push('outline');
        }

        if (tasks.includes('char')) {
            const success = await retryCharacters({ modelId, silent });
            if (!success) remaining.push('char');
        }

        syncFailedTasksState(remaining);

        if (remaining.length === 0) {
            const nextProgress = Math.max(
                progressRef.current,
                blueprintRef.current?.analyzedChapters || 0,
                lastAnalysisRangeRef.current?.end || 0,
            );
            syncProgressState(nextProgress);
        }

        return remaining;
    };

    const processCurrentBatch = async (): Promise<'success' | 'done' | 'failed'> => {
        const canUseFallback = enableGeminiFallback && selectedModel !== fallbackModel;

        if (failedTasksRef.current.length > 0) {
            if (canUseFallback) {
                showToast('info', '检测到上一批仍有失败项，正在使用兜底模型...');
                const remaining = await resolveFailedTasksWithModel([...failedTasksRef.current], fallbackModel, true);

                if (remaining.length === 0) {
                    showToast('success', '上一批失败项已通过兜底模型自动补齐');
                    return 'success';
                }

                showToast('error', `上一批仍有 ${remaining.length} 项失败，请手动重试`);
                return 'failed';
            }

            showToast('error', '当前批次仍有失败项，请先重试失败项');
            return 'failed';
        }

        const batchContext = createBatchContext();
        if (!batchContext) {
            showToast('info', '小说已全部分析完毕！');
            return 'done';
        }

        const primaryResult = await runAnalyzeBatchWithModel(selectedModel, batchContext);

        if (primaryResult.status === 'success') {
            showToast('success', `成功分析 ${primaryResult.actualProcessed} 章`);
            return 'success';
        }

        if (primaryResult.status === 'partial') {
            if (canUseFallback) {
                showToast('info', '主模型部分失败，正在使用兜底模型...');
                const remaining = await resolveFailedTasksWithModel(primaryResult.failedTasks, fallbackModel, true);

                if (remaining.length === 0) {
                    showToast('success', `已完成 ${primaryResult.actualProcessed} 章分析（自动兜底）`);
                    return 'success';
                }

                showToast('error', `兜底后仍有 ${remaining.length} 项失败，请手动重试`);
                return 'failed';
            }

            showToast('error', '部分分析失败，请重跑失败项');
            return 'failed';
        }

        if (primaryResult.status === 'error') {
            if (canUseFallback) {
                showToast('info', '主模型批次失败，正在使用全量兜底...');
                const fallbackResult = await runAnalyzeBatchWithModel(fallbackModel, batchContext);

                if (fallbackResult.status === 'success') {
                    showToast('success', `已完成 ${fallbackResult.actualProcessed} 章分析（自动兜底）`);
                    return 'success';
                }

                if (fallbackResult.status === 'partial') {
                    showToast('error', `兜底后仍有 ${fallbackResult.failedTasks.length} 项失败，请手动重试`);
                    return 'failed';
                }

                showToast('error', `分析失败: ${fallbackResult.error?.message || primaryResult.error?.message || '未知错误'}`);
                return 'failed';
            }

            const handled = handleCapacityError(
                primaryResult.error,
                selectedModel,
                (newModel) => setSelectedModel(newModel),
                () => startAnalysis(),
            );
            if (!handled) {
                showToast('error', `分析失败: ${primaryResult.error?.message || '未知错误'}`);
            }
            return 'failed';
        }

        return 'done';
    };

    const resetAnalysisResults = () => {
        if (isAnalyzing || isAutoAnalyzing) return;

        askConfirm(
            "清空当前 IP 核心解构结果？这会删除已生成的故事蓝图与人物时间轴，你可以重新选择批次后从第 1 批开始分析。",
            () => {
                syncBlueprintState(null);
                syncCharactersState([]);
                syncProgressState(0);
                syncLastAnalysisRangeState(null);
                setRetryingSection(null);
                syncFailedTasksState([]);
                syncSnapshotState(null);
                setExpandedCharId(null);
                setEditingCharId(null);
                setActiveTab('architecture');
                showToast('success', "已清空当前分析结果，可重新选择批次开始分析");
            }
        );
    };

    const startAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            await processCurrentBatch();
        } finally {
            setIsAnalyzing(false);
        }
    };

    const requestPauseAutoAnalysis = () => {
        if (!isAutoAnalyzing || isAutoPausePending) return;
        autoAnalyzeStopRef.current = true;
        setIsAutoPausePending(true);
        showToast('info', '将在当前批次完成后暂停自动分析');
    };

    const startAutoAnalysis = async () => {
        if (isAutoAnalyzing) {
            requestPauseAutoAnalysis();
            return;
        }

        if (isAnalyzing) return;

        autoAnalyzeStopRef.current = false;
        setIsAutoPausePending(false);
        setIsAutoAnalyzing(true);
        setIsAnalyzing(true);

        let exitReason: 'done' | 'failed' | 'paused' | null = null;

        try {
            while (true) {
                if (autoAnalyzeStopRef.current) {
                    exitReason = 'paused';
                    break;
                }

                const result = await processCurrentBatch();

                if (result === 'done') {
                    exitReason = 'done';
                    break;
                }

                if (result === 'failed') {
                    exitReason = 'failed';
                    break;
                }

                if (progressRef.current >= chapters.length) {
                    exitReason = 'done';
                    break;
                }

                if (autoAnalyzeStopRef.current) {
                    exitReason = 'paused';
                    break;
                }
            }
        } finally {
            autoAnalyzeStopRef.current = false;
            setIsAutoPausePending(false);
            setIsAutoAnalyzing(false);
            setIsAnalyzing(false);

            if (exitReason === 'done') {
                showToast('success', 'IP 核心解构已全部自动分析完成');
            } else if (exitReason === 'failed') {
                showToast('error', '自动分析已暂停，请先处理当前批次失败项');
            } else if (exitReason === 'paused') {
                showToast('info', '已暂停自动分析');
            }
        }
    };

    // --- Retry Handlers (REPLACEMENT LOGIC) ---
    
    // Wrapper for unified retry
    const retryFailedTasks = async () => {
        setIsAnalyzing(true);

        try {
            let stillFailed = await resolveFailedTasksWithModel([...failedTasksRef.current], selectedModel);

            if (stillFailed.length > 0 && enableGeminiFallback && selectedModel !== fallbackModel) {
                showToast('info', '主模型重试后仍有失败项，正在使用兜底模型...');
                stillFailed = await resolveFailedTasksWithModel(stillFailed, fallbackModel, true);

                if (stillFailed.length === 0) {
                    showToast('success', '失败项已通过兜底模型自动补齐');
                } else {
                    showToast('error', `兜底后仍有 ${stillFailed.length} 项失败，请稍后再试`);
                }
            }

            if (stillFailed.length === 0) {
                const nextProgress = Math.max(
                    progressRef.current,
                    blueprintRef.current?.analyzedChapters || 0,
                    lastAnalysisRangeRef.current?.end || 0,
                );
                syncProgressState(nextProgress);
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    const retryArchitecture = async (options: { modelId?: string; silent?: boolean } = {}): Promise<boolean> => {         
        const activeModel = options.modelId ?? selectedModel;
        const silent = options.silent ?? false;
        setRetryingSection('arch');

        const retrySnapshot = getRetrySnapshot();
        const activeRange = lastAnalysisRangeRef.current;
        if (!activeRange || !retrySnapshot) {
            showToast('error', "找不到上一批次记录，请先继续分析新的一批后再重跑");
            setRetryingSection(null);
            return false;
        }

        const targetStart = activeRange.start;
        const targetEnd = activeRange.end;

        if (!silent) {
            showToast('info', activeModel === selectedModel ? "正在重跑上一批次架构..." : "正在用兜底模型补齐架构...");
        }

        try {
            const batchText = chapters.slice(targetStart, targetEnd).map(c => `Chapter ${c.id} [${c.title}]:\n${c.content}`).join("\n\n");
            const result = await analyzeArchitectureOnly(apiKey, batchText, retrySnapshot.blueprint, baseUrl, activeModel);

            const currentBlueprint = blueprintRef.current;
            if (!currentBlueprint) {
                setRetryingSection(null);
                return false;
            }

            const architectureBase = {
                ...currentBlueprint,
                growthArc: retrySnapshot.blueprint?.growthArc || { summary: "", nodes: [] },
                conflictArc: retrySnapshot.blueprint?.conflictArc || { nodes: [] },
                relationshipArc: retrySnapshot.blueprint?.relationshipArc || { nodes: [] },
                mysteryArc: retrySnapshot.blueprint?.mysteryArc || { summary: "", nodes: [] },
                summarySoFar: retrySnapshot.blueprint?.summarySoFar || ""
            };

            const mergedBlueprint = mergeArchitectureIntoBlueprint(architectureBase, result);
            syncBlueprintState({
                ...currentBlueprint,
                growthArc: mergedBlueprint.growthArc,
                conflictArc: mergedBlueprint.conflictArc,
                relationshipArc: mergedBlueprint.relationshipArc,
                mysteryArc: mergedBlueprint.mysteryArc,
                summarySoFar: mergedBlueprint.summarySoFar,
            });
            if (!silent) {
                showToast('success', activeModel === selectedModel ? "上一批次架构重跑成功！" : "已补齐架构");
            }
            setRetryingSection(null);
            syncFailedTasksState(failedTasksRef.current.filter(t => t !== 'arch'));
            return true;
        } catch(e: any) {
            console.error(e);
            if (!silent && activeModel === selectedModel) {
                const handled = handleCapacityError(
                    e,
                    activeModel,
                    (newModel) => setSelectedModel(newModel),
                    () => retryArchitecture()
                );
                if (!handled) {
                    showToast('error', "重试失败: " + e.message);
                }
            } else if (!silent) {
                showToast('error', "重试失败: " + e.message);
            }
            setRetryingSection(null);
            return false;
        }
    };

    const retryOutline = async (options: { modelId?: string; silent?: boolean } = {}): Promise<boolean> => { 
        const activeModel = options.modelId ?? selectedModel;
        const silent = options.silent ?? false;
        setRetryingSection('outline');

        const retrySnapshot = getRetrySnapshot();
        const activeRange = lastAnalysisRangeRef.current;
        if (!activeRange || !retrySnapshot) {
            showToast('error', "找不到上一批次记录，请先继续分析新的一批后再重跑");
            setRetryingSection(null);
            return false;
        }

        const targetStart = activeRange.start;
        const targetEnd = activeRange.end;

        if (!silent) {
            showToast('info', activeModel === selectedModel ? "正在重跑上一批次大纲..." : "正在用兜底模型补齐大纲...");
        }

        try {
            const batchText = chapters.slice(targetStart, targetEnd).map(c => `Chapter ${c.id} [${c.title}]:\n${c.content}`).join("\n\n");
            const result = await analyzeOutlineOnly(apiKey, batchText, retrySnapshot.blueprint, baseUrl, activeModel);

            let updatedPhases = [...(retrySnapshot.blueprint?.mainPlotArc.phases || [])];

            if (result.phases) {
                result.phases.forEach((newPhase: PlotPhase) => {
                     const lastPhase = updatedPhases.length > 0 ? updatedPhases[updatedPhases.length - 1] : null;
                     if (lastPhase && (lastPhase.phaseName === newPhase.phaseName || lastPhase.phaseName.includes(newPhase.phaseName) || newPhase.phaseName.includes(lastPhase.phaseName))) {
                         const enhancedEvents = newPhase.events.map(evt => ({ ...evt, content: evt.summary || evt.content || "" }));
                         lastPhase.events.push(...enhancedEvents);
                     } else {
                         const enhancedEvents = newPhase.events.map(evt => ({ ...evt, content: evt.summary || evt.content || "" }));
                         updatedPhases.push({ ...newPhase, events: enhancedEvents });
                     }
                });
            }
            
            syncBlueprintState(blueprintRef.current ? { ...blueprintRef.current, mainPlotArc: { phases: updatedPhases } } : null);
            if (!silent) {
                showToast('success', activeModel === selectedModel ? "上一批次大纲重跑成功！" : "已自动补齐大纲");
            }
            setRetryingSection(null);
            syncFailedTasksState(failedTasksRef.current.filter(t => t !== 'outline'));
            return true;
        } catch(e: any) {
            console.error(e);
            if (!silent && activeModel === selectedModel) {
                const handled = handleCapacityError(
                    e,
                    activeModel,
                    (newModel) => setSelectedModel(newModel),
                    () => retryOutline()
                );
                if (!handled) {
                    showToast('error', "重试失败: " + e.message);
                }
            } else if (!silent) {
                showToast('error', "重试失败: " + e.message);
            }
            setRetryingSection(null);
            return false;
        }
    };

    const retryCharacters = async (options: { modelId?: string; silent?: boolean } = {}): Promise<boolean> => { 
        const activeModel = options.modelId ?? selectedModel;
        const silent = options.silent ?? false;
        setRetryingSection('chars');

        const retrySnapshot = getRetrySnapshot();
        const activeRange = lastAnalysisRangeRef.current;
        if (!activeRange || !retrySnapshot) {
            showToast('error', "找不到上一批次记录，请先继续分析新的一批后再重跑");
            setRetryingSection(null);
            return false;
        }

        const targetStart = activeRange.start;
        const targetEnd = activeRange.end;

        if (!silent) {
            showToast('info', activeModel === selectedModel ? "正在重跑上一批次人物..." : "正在用兜底模型补齐人物...");
        }

        try {
            const batchText = chapters.slice(targetStart, targetEnd).map(c => `Chapter ${c.id} [${c.title}]:\n${c.content}`).join("\n\n");
            
            const baseChars = retrySnapshot.characters || [];
            const result = await analyzeCharactersOnly(apiKey, batchText, baseChars, baseUrl, activeModel);
            
            const newCharacters = JSON.parse(JSON.stringify(baseChars)); 

            if (result.characterUpdates) {
                result.characterUpdates.forEach((update: any) => {
                    if (!update.static_profile || !update.static_profile.name) return;
                    const charName = update.static_profile.name;
                    let existingCharIndex = newCharacters.findIndex((c: any) => c.name === charName);
                    
                    const mapStage = (jsonStage: any, idx: number): CharacterStage => ({
                        id: Date.now().toString() + Math.random(),
                        stageIndex: idx,
                        stageName: jsonStage.stage_name || `阶段 ${idx}`,
                        sourceRange: jsonStage.source_mapping?.text_range || "未知章节",
                        startChapter: jsonStage.source_mapping?.chapter_start || 0,
                        endChapter: jsonStage.source_mapping?.chapter_end || 0,
                        currentAge: jsonStage.age_status?.current_age || "未知",
                        visualAgeDesc: jsonStage.age_status?.visual_age_desc || "",
                        appearance: jsonStage.visual_layer?.appearance || "",
                        physicalState: jsonStage.visual_layer?.physical_state || "",
                        signatureProps: jsonStage.visual_layer?.signature_props || "",
                        knownInfo: jsonStage.cognitive_layer?.known_info || [],
                        coreGoal: jsonStage.cognitive_layer?.core_goal || "",
                        speakingStyle: jsonStage.voice_layer?.speaking_style || "",
                        personalityTags: jsonStage.voice_layer?.personality_tags || [],
                        relations: jsonStage.relation_layer || []
                    });

                    if (existingCharIndex === -1) {
                        let initialStages: CharacterStage[] = [];
                        if (update.new_stages && Array.isArray(update.new_stages)) {
                            initialStages = update.new_stages.map((s: any, i: number) => mapStage(s, i + 1));
                        } else if (update.new_stage) {
                            initialStages = [mapStage(update.new_stage, 1)];
                        }

                        const newChar = {
                            id: Date.now().toString() + Math.random(),
                            name: update.static_profile.name,
                            gender: update.static_profile.gender || "未知",
                            origin: update.static_profile.origin || "未知",
                            role: update.static_profile.role || "配角",
                            bio: update.static_profile.bio || "",
                            timeline: initialStages
                        };
                        newCharacters.push(newChar);
                    } else {
                        const existingChar = newCharacters[existingCharIndex];
                        let incomingStages: any[] = [];
                        if (update.new_stages && Array.isArray(update.new_stages)) {
                            incomingStages = update.new_stages;
                        } else if (update.new_stage) {
                            incomingStages = [update.new_stage];
                        }

                        incomingStages.forEach((incomingStage) => {
                            const lastStage = existingChar.timeline.length > 0 ? existingChar.timeline[existingChar.timeline.length-1] : null;
                            const newStageName = incomingStage.stage_name || "";
                            
                            if (lastStage && lastStage.stageName === newStageName) {
                                lastStage.endChapter = incomingStage.source_mapping?.chapter_end || lastStage.endChapter;
                                lastStage.sourceRange = `${lastStage.sourceRange.split('-')[0]} - ${incomingStage.source_mapping?.text_range.split('-')[1] || "..."}`;
                                lastStage.physicalState = incomingStage.visual_layer?.physical_state || lastStage.physicalState;
                                lastStage.coreGoal = incomingStage.cognitive_layer?.core_goal || lastStage.coreGoal;
                                lastStage.relations = incomingStage.relation_layer || lastStage.relations;
                            } else {
                                const nextIndex = existingChar.timeline.length + 1;
                                existingChar.timeline.push(mapStage(incomingStage, nextIndex));
                            }
                        });
                    }
                });
            }
            syncCharactersState(newCharacters);
            if (!silent) {
                showToast('success', activeModel === selectedModel ? "上一批次人物重跑成功！" : "已补齐人物");
            }
            setRetryingSection(null);
            syncFailedTasksState(failedTasksRef.current.filter(t => t !== 'char'));
            return true;
        } catch(e: any) {
            console.error(e);
            if (!silent && activeModel === selectedModel) {
                const handled = handleCapacityError(
                    e,
                    activeModel,
                    (newModel) => setSelectedModel(newModel),
                    () => retryCharacters()
                );
                if (!handled) {
                    showToast('error', "重试失败: " + e.message);
                }
            } else if (!silent) {
                showToast('error', "重试失败: " + e.message);
            }
            setRetryingSection(null);
            return false;
        }
    };

    const handleNextStep = () => {
        if (blueprint && characters.length > 0) {
            onComplete(blueprint, characters);
        }
    };

    const handleExport = async () => {
        if (blueprint && characters) {
            const currentName = (novelName || '小说IP').trim() || '小说IP';
            const confirmedName = window.prompt('请确认导出的项目名称', currentName);
            if (confirmedName === null) return;
            const finalName = confirmedName.trim() || currentName;
            onNovelNameChange?.(finalName);
            const { exportBlueprintToDocx } = await import('../utils/docxGenerator');
            exportBlueprintToDocx(blueprint, characters, finalName);
        }
    };

    // --- Editing Handlers ---
    const updateGrowthSummary = (val: string) => { if (!blueprint) return; setBlueprint({ ...blueprint, growthArc: { ...blueprint.growthArc, summary: val } }); };
    const updateGrowthNode = (idx: number, field: keyof StoryArcNode, val: string) => { if (!blueprint) return; const newNodes = [...blueprint.growthArc.nodes]; newNodes[idx] = { ...newNodes[idx], [field]: val }; setBlueprint({ ...blueprint, growthArc: { ...blueprint.growthArc, nodes: newNodes } }); };
    const deleteGrowthNode = (idx: number) => { if (!blueprint) return; askConfirm("删除此节点？", () => { const newNodes = blueprint.growthArc.nodes.filter((_, i) => i !== idx); setBlueprint({ ...blueprint, growthArc: { ...blueprint.growthArc, nodes: newNodes } }); }); };
    const updateConflictNode = (idx: number, field: string, val: string) => { if (!blueprint) return; const newNodes = [...blueprint.conflictArc.nodes]; newNodes[idx] = { ...newNodes[idx], [field]: val }; setBlueprint({ ...blueprint, conflictArc: { nodes: newNodes } }); };
    const deleteConflictNode = (idx: number) => { if (!blueprint) return; askConfirm("删除此冲突节点？", () => { const newNodes = blueprint.conflictArc.nodes.filter((_, i) => i !== idx); setBlueprint({ ...blueprint, conflictArc: { nodes: newNodes } }); }); };
    const updateRelationshipNode = (idx: number, field: 'character' | 'identity' | 'change', val: string) => { if (!blueprint) return; const newNodes = [...blueprint.relationshipArc.nodes]; newNodes[idx] = { ...newNodes[idx], [field]: val }; setBlueprint({ ...blueprint, relationshipArc: { nodes: newNodes } }); };
    const deleteRelationshipNode = (idx: number) => { if (!blueprint) return; askConfirm("删除此关系节点？", () => { const newNodes = blueprint.relationshipArc.nodes.filter((_, i) => i !== idx); setBlueprint({ ...blueprint, relationshipArc: { nodes: newNodes } }); }); };
    const updateMysterySummary = (val: string) => { if (!blueprint) return; setBlueprint({ ...blueprint, mysteryArc: { ...blueprint.mysteryArc, summary: val } }); };
    const updateMysteryNode = (idx: number, field: string, val: string) => { if (!blueprint) return; const newNodes = [...blueprint.mysteryArc.nodes]; newNodes[idx] = { ...newNodes[idx], [field]: val }; setBlueprint({ ...blueprint, mysteryArc: { ...blueprint.mysteryArc, nodes: newNodes } }); };
    const deleteMysteryNode = (idx: number) => { if (!blueprint) return; askConfirm("删除此暗线节点？", () => { const newNodes = blueprint.mysteryArc.nodes.filter((_, i) => i !== idx); setBlueprint({ ...blueprint, mysteryArc: { ...blueprint.mysteryArc, nodes: newNodes } }); }); };
    const updatePhaseName = (pIdx: number, val: string) => { if (!blueprint) return; const newPhases = [...blueprint.mainPlotArc.phases]; newPhases[pIdx] = { ...newPhases[pIdx], phaseName: val }; setBlueprint({ ...blueprint, mainPlotArc: { phases: newPhases } }); };
    const updateEvent = (pIdx: number, eIdx: number, field: keyof PlotEvent, val: any) => { 
        if (!blueprint) return; 
        const newPhases = [...blueprint.mainPlotArc.phases]; 
        const newEvents = [...newPhases[pIdx].events]; 
        newEvents[eIdx] = { ...newEvents[eIdx], [field]: val }; 
        if (field === 'summary') newEvents[eIdx].content = val;
        if (field === 'content') newEvents[eIdx].summary = val;
        newPhases[pIdx] = { ...newPhases[pIdx], events: newEvents }; 
        setBlueprint({ ...blueprint, mainPlotArc: { phases: newPhases } }); 
    };
    const deleteEvent = (pIdx: number, eIdx: number) => { if (!blueprint) return; askConfirm("删除此事件？", () => { const newPhases = [...blueprint.mainPlotArc.phases]; const newEvents = newPhases[pIdx].events.filter((_, i) => i !== eIdx); newPhases[pIdx] = { ...newPhases[pIdx], events: newEvents }; setBlueprint({ ...blueprint, mainPlotArc: { phases: newPhases } }); }); };
    const deletePhase = (pIdx: number) => { if (!blueprint) return; askConfirm("删除整个阶段？(包含所有子事件)", () => { const newPhases = blueprint.mainPlotArc.phases.filter((_, i) => i !== pIdx); setBlueprint({ ...blueprint, mainPlotArc: { phases: newPhases } }); }); };

    // --- New Character Logic ---

    const openCharModal = (char?: AnalyzedCharacter) => {
        if (char) {
            setEditingCharId(char.id);
            setTempCharData(JSON.parse(JSON.stringify(char))); // Deep copy
        } else {
            setEditingCharId(null);
            setTempCharData({ ...EMPTY_CHAR, id: Date.now().toString() });
        }
        setIsCharModalOpen(true);
    };

    const saveCharacter = () => {
        if (!tempCharData.name) {
            alert("姓名不能为空");
            return;
        }
        let newList = [...characters];
        if (editingCharId) {
            newList = newList.map(c => c.id === editingCharId ? tempCharData : c);
        } else {
            newList.push(tempCharData);
        }
        setCharacters(newList);
        setIsCharModalOpen(false);
    };

    const deleteCharacter = (id: string) => {
        askConfirm("确定删除这个人物吗？", () => {
          setCharacters(characters.filter(c => c.id !== id));
          setIsCharModalOpen(false);
        });
    };

    const addStage = () => {
        const newStage: CharacterStage = {
            id: Date.now().toString(),
            stageIndex: tempCharData.timeline.length + 1,
            stageName: "新阶段",
            sourceRange: "", startChapter: 0, endChapter: 0,
            currentAge: "", visualAgeDesc: "",
            appearance: "", physicalState: "", signatureProps: "",
            knownInfo: [], coreGoal: "",
            speakingStyle: "", personalityTags: [],
            relations: []
        };
        setTempCharData({ ...tempCharData, timeline: [...tempCharData.timeline, newStage] });
    };

    const removeStage = (idx: number) => {
        const newTimeline = tempCharData.timeline.filter((_, i) => i !== idx);
        setTempCharData({ ...tempCharData, timeline: newTimeline });
    };

    const updateStage = (stageIdx: number, field: keyof CharacterStage | string, value: any) => {
        const newTimeline = [...tempCharData.timeline];
        const stage = newTimeline[stageIdx];

        if (field === 'knownInfo' || field === 'personalityTags') {
             // value is string, need to split
             stage[field] = value.split(/[,，;；]/).map((s: string) => s.trim()).filter(Boolean);
        } else if (['appearance', 'physicalState', 'signatureProps', 'currentAge', 'visualAgeDesc', 'speakingStyle', 'sourceRange', 'stageName', 'coreGoal'].includes(field as string)) {
             (stage as any)[field] = value;
        }
        
        setTempCharData({ ...tempCharData, timeline: newTimeline });
    };

    const addRelation = (stageIdx: number) => {
        const newTimeline = [...tempCharData.timeline];
        const stage = newTimeline[stageIdx];
        if (!stage.relations) stage.relations = [];
        stage.relations.push({ target: "", attitude: "", subtext: "" });
        setTempCharData({ ...tempCharData, timeline: newTimeline });
    };

    const updateRelation = (stageIdx: number, relIdx: number, field: keyof CharacterRelation, value: string) => {
        const newTimeline = [...tempCharData.timeline];
        const stage = newTimeline[stageIdx];
        if (stage.relations && stage.relations[relIdx]) {
            stage.relations[relIdx][field] = value;
        }
        setTempCharData({ ...tempCharData, timeline: newTimeline });
    };

    const removeRelation = (stageIdx: number, relIdx: number) => {
        const newTimeline = [...tempCharData.timeline];
        const stage = newTimeline[stageIdx];
        if (stage.relations) {
            stage.relations = stage.relations.filter((_, i) => i !== relIdx);
        }
        setTempCharData({ ...tempCharData, timeline: newTimeline });
    };

    const completionPercentage = Math.round((progress / chapters.length) * 100);
    const isBusy = isAnalyzing || isAutoAnalyzing;
    const isFallbackModelSelected = selectedModel === fallbackModel;
    const renderStars = (count: number = 0) => Array(5).fill(0).map((_, i) => (<Star key={i} className={`w-3 h-3 ${i < count ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />));

    // --- Complex Modal for 5-Layer Character Editing ---
    const CharacterEditModal = () => {
        if (!isCharModalOpen) return null;

        const avatarLabel = (tempCharData.name?.trim() || tempCharData.role?.trim() || '人').slice(0, 1);

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="w-full max-w-6xl h-[92vh] rounded-[32px] border border-purple-100 bg-[#fcfbff] shadow-2xl overflow-hidden flex flex-col">
                    <div className="shrink-0 border-b border-purple-100 bg-white/95 px-6 py-5 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-100 to-fuchsia-100 border border-purple-100 shadow-sm flex items-center justify-center text-lg font-extrabold text-purple-600 shrink-0">
                                {avatarLabel}
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-[26px] leading-none font-extrabold text-gray-800 mb-2">{editingCharId ? '编辑人物档案' : '新建人物档案'}</h3>
                                <p className="text-sm text-gray-400">构建反 OOC 的时间轴状态机</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsCharModalOpen(false)}
                            className="w-10 h-10 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0 flex items-center justify-center"
                            title="关闭"
                        >
                            <X className="w-5.5 h-5.5"/>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-6 bg-gradient-to-b from-white via-purple-50/20 to-white space-y-7">
                        <div className="rounded-[24px] border border-gray-200 bg-white shadow-sm px-5 py-5">
                            <div className="flex items-center gap-2 mb-5 text-gray-800">
                                <Anchor className="w-4 h-4 text-blue-500"/>
                                <h4 className="text-xl font-extrabold">静态底座 (Static Profile)</h4>
                                <InfoHint
                                    title="基础信息"
                                    summary="先写这个人的底色：他是谁、负责什么戏份、最容易让人记住的点是什么。"
                                    metaphor="人物的基本名片。"
                                    tone="purple"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">姓名</label>
                                    <input className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium shadow-sm" value={tempCharData.name} onChange={e => setTempCharData({ ...tempCharData, name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">性别</label>
                                    <input className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium shadow-sm" value={tempCharData.gender} onChange={e => setTempCharData({ ...tempCharData, gender: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">籍贯/种族</label>
                                    <input className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium shadow-sm" value={tempCharData.origin} onChange={e => setTempCharData({ ...tempCharData, origin: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">功能定位</label>
                                    <input className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium shadow-sm" value={tempCharData.role} onChange={e => setTempCharData({ ...tempCharData, role: e.target.value })} />
                                </div>
                                <div className="md:col-span-4">
                                    <label className="text-xs font-bold text-gray-400 mb-2 block">一句话简介</label>
                                    <textarea className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-[#fafbff] outline-none focus:border-purple-300 focus:bg-white text-gray-700 font-medium resize-none shadow-sm" rows={3} value={tempCharData.bio} onChange={e => setTempCharData({ ...tempCharData, bio: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 text-gray-800">
                                    <Sparkles className="w-4 h-4 text-purple-500"/>
                                    <h4 className="text-xl font-extrabold">动态时间轴 (Dynamic Timeline)</h4>
                                    <InfoHint
                                        title="动态时间轴"
                                        summary="按剧情推进，把这个人分成几个阶段来看。每个阶段都写清当时的状态、目标和对外关系。"
                                        metaphor="人物一路变化的时间线。"
                                        tone="purple"
                                    />
                                </div>
                                <button onClick={addStage} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors shadow-sm shrink-0">
                                    <Plus className="w-4 h-4"/> 新增阶段
                                </button>
                            </div>

                            {tempCharData.timeline.length === 0 && (
                                <div className="text-center py-12 text-sm text-gray-400 border-2 border-dashed border-purple-100 rounded-[24px] bg-white">
                                    暂无阶段，点击“新增阶段”开始补充人物状态
                                </div>
                            )}

                            <div className="space-y-6">
                                {tempCharData.timeline.map((stage, idx) => (
                                    <div key={stage.id || idx} className="rounded-[28px] border border-purple-200 bg-white shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-purple-100 bg-gradient-to-r from-purple-50/70 via-white to-white">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 text-sm font-extrabold px-3 py-1 shrink-0">Stage {idx + 1}</span>
                                                <input className="flex-1 min-w-0 text-[28px] leading-none font-extrabold text-gray-800 bg-transparent border-none outline-none p-0" value={stage.stageName} onChange={e => updateStage(idx, 'stageName', e.target.value)} placeholder="阶段名称" />
                                                <span className="text-gray-300 text-xl shrink-0">|</span>
                                                <input className="w-32 shrink-0 text-base font-medium text-gray-500 bg-transparent border-none outline-none p-0" value={stage.sourceRange} onChange={e => updateStage(idx, 'sourceRange', e.target.value)} placeholder="第1-5章" />
                                            </div>
                                            <button onClick={() => removeStage(idx)} className="p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" title="删除阶段">
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
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
                                                            <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={stage.currentAge} onChange={e => updateStage(idx, 'currentAge', e.target.value)} placeholder="例如：18岁" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-medium text-gray-400 mb-1 block">视觉年龄感</label>
                                                            <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={stage.visualAgeDesc} onChange={e => updateStage(idx, 'visualAgeDesc', e.target.value)} />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="text-[11px] font-medium text-gray-400 mb-1 block">外貌衣着</label>
                                                            <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={stage.appearance} onChange={e => updateStage(idx, 'appearance', e.target.value)} />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="text-[11px] font-medium text-gray-400 mb-1 block">身体状态 (Action Lines)</label>
                                                            <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={stage.physicalState} onChange={e => updateStage(idx, 'physicalState', e.target.value)} />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="text-[11px] font-medium text-gray-400 mb-1 block">核心道具</label>
                                                            <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={stage.signatureProps} onChange={e => updateStage(idx, 'signatureProps', e.target.value)} />
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
                                                                <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={(stage.knownInfo || []).join('，')} onChange={e => updateStage(idx, 'knownInfo', e.target.value)} placeholder="用逗号分隔" />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-extrabold text-rose-400">
                                                                    <span>★ 核心行动目标</span>
                                                                </div>
                                                                <textarea className="w-full px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50/60 outline-none focus:border-rose-300 focus:bg-white text-gray-700 font-semibold resize-none shadow-sm" rows={2} value={stage.coreGoal} onChange={e => updateStage(idx, 'coreGoal', e.target.value)} />
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
                                                                <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={stage.speakingStyle} onChange={e => updateStage(idx, 'speakingStyle', e.target.value)} />
                                                            </div>
                                                            <div>
                                                                <label className="text-[11px] font-medium text-gray-400 mb-1 block">性格标签</label>
                                                                <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 shadow-sm" value={(stage.personalityTags || []).join('，')} onChange={e => updateStage(idx, 'personalityTags', e.target.value)} placeholder="用逗号分隔" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-[24px] border border-purple-100 bg-purple-50/20 p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2 text-gray-700 text-sm font-extrabold">
                                                        <HeartHandshake className="w-4 h-4 text-gray-400"/> 关键关系网络
                                                        <InfoHint
                                                            title="关系矩阵"
                                                            summary="写这个阶段他和关键人物是什么关系：亲近、合作、提防、敌对，还是表面一套心里一套。"
                                                            metaphor="这一阶段，他和谁站一边、跟谁不对付。"
                                                            tone="purple"
                                                            size="xs"
                                                            widthClass="w-80"
                                                        />
                                                    </div>
                                                    <button onClick={() => addRelation(idx)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold hover:bg-purple-200 transition-colors shrink-0">
                                                        <Plus className="w-3.5 h-3.5"/> 添加关系
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    {(stage.relations || []).map((rel, relIdx) => (
                                                        <div key={relIdx} className="grid grid-cols-1 md:grid-cols-[120px_20px_140px_1fr_auto] gap-2 items-center rounded-2xl border border-purple-100 bg-white px-3 py-2 shadow-sm">
                                                            <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300" value={rel.target} onChange={e => updateRelation(idx, relIdx, 'target', e.target.value)} placeholder="对象" />
                                                            <div className="hidden md:flex items-center justify-center text-gray-300">
                                                                <ArrowRight className="w-4 h-4"/>
                                                            </div>
                                                            <input className="w-full px-3 py-2 rounded-xl border border-purple-100 bg-purple-50 text-purple-600 font-semibold outline-none focus:border-purple-300" value={rel.attitude} onChange={e => updateRelation(idx, relIdx, 'attitude', e.target.value)} placeholder="态度" />
                                                            <input className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300" value={rel.subtext} onChange={e => updateRelation(idx, relIdx, 'subtext', e.target.value)} placeholder="潜台词 / 关系说明" />
                                                            <button onClick={() => removeRelation(idx, relIdx)} className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors justify-self-end">
                                                                <X className="w-4 h-4"/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {(!stage.relations || stage.relations.length === 0) && (
                                                        <div className="text-xs text-gray-400 px-1 py-2">暂无关系数据</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="shrink-0 border-t border-purple-100 bg-white/95 px-6 py-4 flex items-center justify-between gap-3">
                        <div>
                            {editingCharId && (
                                <button onClick={() => deleteCharacter(editingCharId)} className="px-4 py-2 rounded-xl border border-red-200 text-red-500 font-bold hover:bg-red-50 transition-colors">
                                    删除人物
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsCharModalOpen(false)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition-colors">
                                取消
                            </button>
                            <button onClick={saveCharacter} className="px-6 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-primary-hover transition-colors shadow-sm">
                                保存人物档案
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-screen bg-paper flex flex-col font-sans">
            {toast && (
                <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[150] px-6 py-3 rounded-full font-bold shadow-float flex items-center gap-2 animate-in slide-in-from-top-4 ${
                    toast.type === 'success'
                        ? 'bg-green-100 text-green-700'
                        : toast.type === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                }`}>
                    {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : toast.type === 'error' ? <AlertCircle className="w-5 h-5"/> : <Sparkles className="w-5 h-5"/>}
                    <span>{toast.message}</span>
                </div>
            )}

            <CapacityErrorModal />
            <CharacterEditModal />

            {confirmState && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <p className="text-gray-700 font-medium mb-6">{confirmState.message}</p>
                        <div className="flex gap-3">
                            <button onClick={closeConfirm} className="flex-1 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors border border-gray-200">取消</button>
                            <button onClick={() => { confirmState.onConfirm(); closeConfirm(); }} className="flex-1 py-2.5 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors shadow-sm">确认</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="min-h-15 bg-white border-b border-gray-100 flex flex-wrap items-center gap-2.5 px-4 py-3 lg:px-5 shrink-0 z-20">
                <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                    {onGoBack && (
                        <button
                            onClick={onGoBack}
                            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
                            title="返回上一步"
                        >
                            <ArrowRight className="w-5 h-5 rotate-180"/>
                        </button>
                    )}
                    <button
                        onClick={onNewProject}
                        className="w-10 h-10 rounded-xl bg-blue-100 hover:bg-blue-200 flex items-center justify-center text-blue-600 transition-colors"
                        title="重新开启新项目"
                    >
                        <Sparkles className="w-5 h-5"/>
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                        <BrainCircuit className="w-5 h-5"/>
                    </div>
                    <div className="min-w-0 pr-1">
                        <h2 className="font-extrabold text-lg leading-none text-gray-800">IP 核心解构</h2>
                        <p className="text-xs text-gray-400 mt-1">第一步：提炼故事蓝图 & 人物时间轴</p>
                    </div>
                </div>

                <div className="ml-1.5 flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <div className="flex max-w-full items-center gap-1.5 bg-gray-50 px-2 py-1.5 rounded-xl border border-gray-200">
                            <Settings className="w-3.5 h-3.5 text-gray-400 shrink-0"/>
                            <select 
                                value={selectedModel} 
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="w-34 lg:w-44 bg-transparent text-xs font-bold text-gray-600 outline-none border-none cursor-pointer"
                            >
                                {AVAILABLE_MODELS.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                            <div className="w-px h-4 bg-gray-300 mx-0.5 shrink-0"></div>
                            <span className="text-[10px] text-gray-500 whitespace-nowrap">批次</span>
                            <select 
                                value={batchSize} 
                                onChange={(e) => setBatchSize(Number(e.target.value))}
                                className="bg-transparent text-xs font-bold text-primary outline-none border-none cursor-pointer whitespace-nowrap"
                            >
                                <option value="5">5章</option>
                                <option value="10">10章（推荐）</option>
                                <option value="20">20章</option>
                                <option value="50">50章</option>
                            </select>
                            <div className="w-px h-4 bg-gray-300 mx-0.5 shrink-0"></div>
                            <label className={`flex items-center gap-1 whitespace-nowrap ${isFallbackModelSelected ? 'opacity-50' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={enableGeminiFallback}
                                    onChange={(e) => setEnableGeminiFallback(e.target.checked)}
                                    disabled={isBusy || isFallbackModelSelected}
                                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span className="text-[11px] font-bold text-gray-500">兜底</span>
                            </label>
                            {enableGeminiFallback && !isFallbackModelSelected && (
                                <select 
                                    value={fallbackModel} 
                                    onChange={(e) => setFallbackModel(e.target.value)}
                                    className="w-24 lg:w-32 bg-transparent text-xs font-bold text-gray-500 outline-none border-none cursor-pointer"
                                >
                                    {AVAILABLE_MODELS.map(m => (
                                        <option key={`fb-${m.id}`} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                            <Activity className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-xs font-bold text-gray-600 whitespace-nowrap">进度 {progress}/{chapters.length}</span>
                            <div className="w-12 lg:w-14 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${completionPercentage}%` }}></div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button 
                                onClick={startAutoAnalysis}
                                disabled={((!isAutoAnalyzing && isBusy) || progress >= chapters.length || isAutoPausePending)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg ${
                                    isAutoAnalyzing ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                                    ((!isAutoAnalyzing && isBusy) || isAutoPausePending) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 
                                    progress >= chapters.length ? 'bg-green-100 text-green-700' :
                                    'bg-indigo-500 text-white hover:bg-indigo-600 hover:scale-105'
                                }`}
                                title={isAutoAnalyzing ? '点击后会在当前批次完成后暂停自动分析' : '按当前批次配置自动连续分析，上一批成功后才会继续下一批'}
                            >
                                {isAutoAnalyzing ? <PauseCircle className={`w-4 h-4 ${isAutoPausePending ? 'animate-pulse' : ''}`}/> : <Play className="w-4 h-4"/>}
                                {isAutoPausePending ? '暂停中...' : isAutoAnalyzing ? '暂停' : progress >= chapters.length ? '已完成' : '自动分析'}
                            </button>

                            {failedTasks.length > 0 ? (
                                <button 
                                    onClick={retryFailedTasks}
                                    disabled={isBusy}
                                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg ${
                                        isBusy ? 'bg-orange-200 text-orange-500 cursor-not-allowed' : 
                                        'bg-orange-500 text-white hover:bg-orange-600 hover:scale-105 active:scale-95'
                                    }`}
                                    title="点击重新分析失败的子任务"
                                >
                                    <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`}/>
                                    {isBusy ? '重试中...' : '重试'}
                                </button>
                            ) : (
                                <button 
                                    onClick={startAnalysis}
                                    disabled={isBusy || progress >= chapters.length}
                                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg ${
                                        isBusy ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 
                                        progress >= chapters.length ? 'bg-green-100 text-green-700' :
                                        'bg-primary text-white hover:bg-primary-hover hover:scale-105'
                                    }`}
                                >
                                    {isBusy && !isAutoAnalyzing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
                                    {isBusy ? (isAutoAnalyzing ? '下一批' : '分析中...') : 
                                     progress >= chapters.length ? '已完成' : '下一批'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        <button 
                            onClick={resetAnalysisResults}
                            disabled={isBusy || (!blueprint && characters.length === 0 && progress === 0 && failedTasks.length === 0)}
                            className="flex items-center gap-1 px-3 py-2.5 bg-white border border-red-200 text-red-500 rounded-full text-sm font-bold hover:bg-red-50 transition-all disabled:opacity-50 disabled:text-red-300 disabled:border-red-100 disabled:hover:bg-white"
                            title="清空当前 IP 核心解构结果，从第 1 批重新开始"
                        >
                            <Trash2 className="w-4 h-4"/>
                            清空
                        </button>

                        <button 
                            onClick={handleExport}
                            disabled={!blueprint}
                            className="flex items-center justify-center w-10 h-10 bg-white border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 transition-all disabled:opacity-50"
                            title="导出策划案为 Word"
                        >
                            <FileDown className="w-4 h-4"/>
                        </button>

                        <button 
                            onClick={handleNextStep}
                            disabled={!blueprint}
                            className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold hover:bg-black transition-all disabled:opacity-50"
                        >
                            下一步 <ArrowRight className="w-4 h-4"/>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden flex">
                
                {/* Left Panel: Main Story Blueprint (Combined Architecture + Timeline) */}
                <div className="flex-1 flex flex-col border-r border-gray-100 bg-gray-50/50 min-w-0">
                     {/* Blueprint Tab Header */}
                     <div className="flex items-center border-b border-gray-200 bg-white">
                        <button 
                            onClick={() => setActiveTab('architecture')}
                            className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'architecture' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <Target className="w-4 h-4"/> 故事三维架构
                        </button>
                        <button 
                            onClick={() => setActiveTab('timeline')}
                            className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'timeline' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <ListTree className="w-4 h-4"/> 主线大纲 & 事件流
                        </button>
                     </div>

                     <div className="flex-1 overflow-y-auto p-6 relative">
                         {!blueprint ? (
                            <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 space-y-4">
                                <BrainCircuit className="w-16 h-16 opacity-20"/>
                                <p>点击顶部“开始分析”按钮，让 AI 拆解原著...</p>
                            </div>
                         ) : (
                             <>
                                {activeTab === 'architecture' && (
                                    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2">
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="font-extrabold text-gray-700 text-lg">核心架构</h3>
                                            {canRetryLastBatch && (
                                                <button onClick={retryArchitecture} disabled={!!retryingSection} className="text-xs flex items-center gap-1 text-primary hover:bg-primary/5 px-2 py-1 rounded">
                                                    <RefreshCw className={`w-3 h-3 ${retryingSection === 'arch' ? 'animate-spin' : ''}`}/> {lastAnalysisRange && failedTasks.includes('arch') ? '重跑失败项' : '重跑上一批次'}
                                                </button>
                                            )}
                                        </div>

                                        {blueprint.summarySoFar?.trim() && (
                                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-400"></div>
                                                <div className="flex items-center justify-between gap-3 mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                            <BookOpen className="w-4 h-4 text-slate-500"/> 累计剧情摘要
                                                        </h4>
                                                        <InfoHint
                                                            title="累计剧情摘要"
                                                            summary="这不是最后要展示给读者看的结构结论，更像是系统给 AI 记前情的备忘录，方便下一批继续分析时不断线。"
                                                            metaphor="给 AI 的前情提要。"
                                                            tone="slate"
                                                            widthClass="w-96"
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full">AI 上下文</span>
                                                </div>
                                                <textarea
                                                    className="w-full text-xs text-gray-600 p-3 bg-slate-50/70 rounded-lg border border-slate-100 outline-none resize-none"
                                                    value={blueprint.summarySoFar}
                                                    readOnly
                                                    rows={4}
                                                />
                                            </div>
                                        )}

                                        {/* Growth Arc */}
                                        <div className="bg-white rounded-xl p-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 relative overflow-hidden group hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all animate-in fade-in zoom-in-95 duration-500">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-400"></div>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                    <TrendingUp className="w-4 h-4 text-blue-500"/> 成长主轴
                                                </h4>
                                                <InfoHint
                                                    title="成长主轴"
                                                    summary="这里看主角一路怎么变强、变成熟、变得不一样。既包括实力变化，也包括身份变化和想法变化。"
                                                    metaphor="主角从什么样，慢慢变成了什么样。"
                                                    tone="blue"
                                                />
                                            </div>
                                            <textarea 
                                                className="w-full text-xs text-gray-700 italic mb-2 p-2.5 bg-blue-100/40 rounded-lg border-none focus:bg-white focus:ring-2 focus:ring-blue-50 outline-none resize-none shadow-inner transition-all leading-relaxed"
                                                value={blueprint.growthArc.summary}
                                                onChange={(e) => updateGrowthSummary(e.target.value)}
                                                rows={3}
                                                placeholder="成长主轴总纲..."
                                            />
                                            <div className="space-y-2">
                                                {blueprint.growthArc.nodes.map((node, i) => (
                                                    <div key={i} className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-100/50 relative group/node hover:bg-white hover:shadow-sm transition-all focus-within:bg-white focus-within:shadow-sm focus-within:border-blue-200">
                                                        <div className="flex items-center gap-2 mb-1.5 pr-5">
                                                            <input 
                                                                className="w-20 shrink-0 text-[10px] font-bold text-blue-600 bg-blue-100/60 px-1.5 py-1 rounded-md text-center border-none focus:bg-blue-100 outline-none transition-colors placeholder:text-blue-300"
                                                                value={node.stage}
                                                                onChange={(e) => updateGrowthNode(i, 'stage', e.target.value)}
                                                                placeholder="境界/阶段"
                                                            />
                                                            <textarea 
                                                                className="flex-1 font-bold text-gray-800 text-sm bg-transparent border-none p-0 focus:ring-0 placeholder:font-normal placeholder:text-gray-400 resize-none h-[22px]"
                                                                value={node.event}
                                                                onChange={(e) => updateGrowthNode(i, 'event', e.target.value)}
                                                                placeholder="关键事件摘要"
                                                                rows={1}
                                                            />
                                                        </div>
                                                        <div className="flex gap-1.5 bg-white/80 p-1.5 border border-blue-100/30 focus-within:border-blue-200 rounded-lg shadow-sm w-full transition-all">
                                                            <textarea 
                                                                className="flex-1 w-full text-xs text-gray-700 bg-transparent border-none resize-none p-1.5 focus:ring-0 leading-relaxed rounded-md hover:bg-gray-50/50 focus:bg-gray-50/50 transition-colors"
                                                                value={node.action}
                                                                onChange={(e) => updateGrowthNode(i, 'action', e.target.value)}
                                                                rows={3}
                                                                placeholder="核心行动..."
                                                            />
                                                            <div className="flex flex-col items-center justify-center text-blue-300 shrink-0 mx-0.5">
                                                                <ArrowRight className="w-3.5 h-3.5 opacity-50"/>
                                                            </div>
                                                            <textarea 
                                                                className="flex-1 w-full text-xs text-blue-800 font-bold bg-blue-50/30 border-none resize-none p-1.5 focus:ring-0 leading-relaxed rounded-md hover:bg-blue-50/70 focus:bg-blue-50/70 transition-colors"
                                                                value={node.result}
                                                                onChange={(e) => updateGrowthNode(i, 'result', e.target.value)}
                                                                rows={3}
                                                                placeholder="成长结局..."
                                                            />
                                                        </div>
                                                        <button 
                                                            onClick={() => deleteGrowthNode(i)}
                                                            className="absolute top-3 right-3 text-blue-300 hover:text-red-500 opacity-0 group-hover/node:opacity-100 focus-within:opacity-100 transition-opacity p-1 rounded-full hover:bg-red-50"
                                                        >
                                                            <X className="w-3.5 h-3.5"/>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Conflict Arc */}
                                        <div className="bg-white rounded-xl p-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 relative overflow-hidden group hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all animate-in fade-in zoom-in-95 duration-500">
                                             <div className="absolute top-0 left-0 w-1.5 h-full bg-red-400"></div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                    <Target className="w-4 h-4 text-red-500"/> 冲突博弈
                                                </h4>
                                                <InfoHint
                                                    title="冲突博弈"
                                                    summary="这里看主角这一段在跟谁对上、为什么会起冲突，最后又是怎么扛过去、怎么赢下来的。"
                                                    metaphor="敌人是谁，问题是什么，主角怎么过关。"
                                                    tone="red"
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {blueprint.conflictArc.nodes.map((node, i) => (
                                                    <div key={i} className="p-2.5 bg-red-50/40 rounded-xl border border-red-100/50 relative group/node hover:bg-white hover:shadow-sm transition-all focus-within:bg-white focus-within:shadow-sm focus-within:border-red-200 flex flex-col gap-1.5">
                                                        <div className="flex flex-col gap-0.5 pr-5">
                                                            <input 
                                                                className="w-1/2 text-[10px] font-extrabold text-red-400 bg-transparent border-none outline-none focus:bg-red-50 px-1 py-0.5 rounded transition-colors uppercase tracking-widest placeholder:font-normal placeholder:text-red-200"
                                                                value={node.stage}
                                                                onChange={(e) => updateConflictNode(i, 'stage', e.target.value)}
                                                                placeholder="阶段 [例: 新手首杀]"
                                                            />
                                                            <div className="flex items-center gap-2.5 px-0.5">
                                                                <div className="shrink-0 bg-red-500 text-white font-black italic text-xs px-2 py-0.5 rounded shadow shadow-red-200">VS</div>
                                                                <input 
                                                                    className="flex-1 font-black text-gray-800 text-base bg-transparent border-b border-transparent focus:border-red-300 outline-none p-0 focus:ring-0 placeholder:font-normal placeholder:text-gray-300 placeholder:text-sm"
                                                                    value={node.antagonist}
                                                                    onChange={(e) => updateConflictNode(i, 'antagonist', e.target.value)}
                                                                    placeholder="敌方角色、势力或极端困境"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="bg-white p-2 rounded-lg border border-red-50 shadow-sm focus-within:border-red-200 focus-within:ring-2 focus-within:ring-red-50/50 transition-all flex flex-col gap-1">
                                                            <div>
                                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-0.5">博弈激突</span>
                                                                <textarea 
                                                                    className="w-full text-xs text-gray-700 font-medium bg-transparent border-none resize-none px-1 py-0 focus:ring-0 leading-relaxed"
                                                                    value={node.conflict}
                                                                    onChange={(e) => updateConflictNode(i, 'conflict', e.target.value)}
                                                                    rows={3}
                                                                    placeholder="故事博弈详情..."
                                                                />
                                                            </div>
                                                            <div className="w-full h-px bg-red-50/50"></div>
                                                            <div className="bg-red-50 px-2 py-1.5 rounded-md border border-red-100/40">
                                                                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest block mb-0.5">关键终局</span>
                                                                <textarea 
                                                                    className="w-full text-xs text-red-700 font-black bg-transparent border-none resize-none p-0 focus:ring-0 leading-relaxed"
                                                                    value={node.result}
                                                                    onChange={(e) => updateConflictNode(i, 'result', e.target.value)}
                                                                    rows={2}
                                                                    placeholder="博弈结果..."
                                                                />
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => deleteConflictNode(i)}
                                                            className="absolute top-4 right-4 text-red-300 hover:text-red-500 opacity-0 group-hover/node:opacity-100 focus-within:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-red-50"
                                                        >
                                                            <X className="w-4 h-4"/>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        {/* Relationship Arc */}
                                        <div className="bg-white rounded-xl p-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 relative overflow-hidden group hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all animate-in fade-in zoom-in-95 duration-500">
                                             <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-400"></div>
                                            <div className="flex items-center gap-2 mb-2.5">
                                                <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                    <HeartHandshake className="w-4 h-4 text-emerald-500"/> 羁绊关系线
                                                </h4>
                                                <InfoHint
                                                    title="羁绊关系线"
                                                    summary="这里看主角和重要人物的关系怎么变：更亲近了、疏远了、反目了，还是从对立变成合作。"
                                                    metaphor="主角和谁更近了，和谁更远了。"
                                                    tone="emerald"
                                                />
                                            </div>
                                            {blueprint.relationshipArc.nodes.length === 0 ? (
                                                <div className="text-center p-6 border border-dashed border-emerald-100 rounded-xl text-sm text-gray-400 bg-emerald-50/30">
                                                    当前暂无可视化的关系线节点
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    {blueprint.relationshipArc.nodes.map((node, i) => (
                                                        <div key={i} className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100/50 relative group/node hover:bg-white hover:shadow-sm transition-all focus-within:bg-white focus-within:shadow-sm focus-within:border-emerald-200">
                                                            <div className="flex items-center gap-1.5 mb-1.5 pr-5">
                                                                <input
                                                                    className="flex-1 font-bold text-gray-800 text-sm bg-transparent border-none p-0 focus:ring-0 placeholder:font-normal placeholder:text-gray-400"
                                                                    value={node.character}
                                                                    onChange={(e) => updateRelationshipNode(i, 'character', e.target.value)}
                                                                    placeholder="人物名"
                                                                />
                                                                <input
                                                                    className="w-20 shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-100/60 px-1.5 py-1 rounded-md text-center border-none focus:bg-emerald-100 outline-none transition-colors placeholder:text-emerald-300"
                                                                    value={node.identity}
                                                                    onChange={(e) => updateRelationshipNode(i, 'identity', e.target.value)}
                                                                    placeholder="如: 宿敌"
                                                                />
                                                            </div>
                                                            <textarea
                                                                className="w-full text-xs text-gray-700 bg-white p-2 rounded-lg border border-emerald-100/50 focus:border-emerald-200 focus:ring-2 focus:ring-emerald-50/50 outline-none resize-none leading-relaxed shadow-inner transition-all"
                                                                value={node.change}
                                                                onChange={(e) => updateRelationshipNode(i, 'change', e.target.value)}
                                                                rows={3}
                                                                placeholder="羁绊互动详情..."
                                                            />
                                                            <button
                                                                onClick={() => deleteRelationshipNode(i)}
                                                                className="absolute top-3 right-3 text-emerald-300 hover:text-red-500 opacity-0 group-hover/node:opacity-100 focus-within:opacity-100 transition-opacity p-1 rounded-full hover:bg-red-50"
                                                            >
                                                                <X className="w-3.5 h-3.5"/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Mystery/Fate Arc */}
                                        {blueprint.mysteryArc && (
                                            <div className="bg-white rounded-xl p-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 relative overflow-hidden group hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all animate-in fade-in zoom-in-95 duration-500">
                                                 <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-900"></div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                        <Skull className="w-4 h-4 text-purple-900"/> 宿命与暗线
                                                    </h4>
                                                    <InfoHint
                                                        title="宿命与暗线"
                                                        summary="这里看表面剧情背后还藏着什么，比如身世秘密、埋下的伏笔、复仇线索，还有还没彻底说破的谜。"
                                                        metaphor="明面剧情之外，背后还藏着什么。"
                                                        tone="purple"
                                                    />
                                                </div>
                                                {blueprint.mysteryArc.summary?.trim() && (
                                                    <div className="mb-2">
                                                        <div className="flex items-center gap-1.5 mb-1 px-1">
                                                            <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest block">宿命暗线总纲</label>
                                                            <div className="h-px flex-1 bg-purple-50/50"></div>
                                                            <InfoHint
                                                                title="暗线摘要"
                                                                summary="把这条暗线目前已经露出来的线索，用几句话串起来，方便你快速回看。"
                                                                metaphor="把零散伏笔先串成一条线。"
                                                                tone="purple"
                                                                size="xs"
                                                            />
                                                        </div>
                                                        <textarea
                                                            className="w-full text-xs text-gray-700 p-2.5 bg-purple-100/40 rounded-lg border-none outline-none resize-none focus:bg-white focus:ring-2 focus:ring-purple-50 shadow-inner transition-all leading-relaxed"
                                                            value={blueprint.mysteryArc.summary || ""}
                                                            onChange={(e) => updateMysterySummary(e.target.value)}
                                                            rows={3}
                                                            placeholder="补完宿命/暗线的整体构想..."
                                                        />
                                                    </div>
                                                )}
                                                <div className="space-y-2">
                                                    {blueprint.mysteryArc.nodes.map((node, i) => (
                                                        <div key={i} className="p-2.5 bg-purple-50/60 rounded-xl border border-purple-100/50 relative group/node hover:bg-white hover:shadow-sm transition-all focus-within:bg-white focus-within:shadow-sm focus-within:border-purple-200 flex flex-col gap-1">
                                                            <div className="pr-5">
                                                                <textarea 
                                                                    className="w-full text-sm font-black text-gray-800 bg-transparent border-none p-0.5 focus:ring-0 resize-none leading-relaxed placeholder:font-normal placeholder:text-gray-400"
                                                                    value={node.origin}
                                                                    onChange={(e) => updateMysteryNode(i, 'origin', e.target.value)}
                                                                    rows={2}
                                                                    placeholder="核心暗线标题 / 伏笔来源"
                                                                />
                                                            </div>
                                                            <div className="bg-white/80 p-2 rounded-lg border border-purple-50 shadow-sm flex flex-col gap-1.5 focus-within:border-purple-200 focus-within:ring-2 focus-within:ring-purple-50/30 transition-all">
                                                                <div className="flex items-start gap-2">
                                                                    <div className="shrink-0 flex items-center justify-center gap-1 bg-gray-50 h-6 px-2 rounded border border-gray-100 text-[10px] text-gray-500 font-bold mt-0.5">
                                                                        <span>进展</span>
                                                                        <InfoHint
                                                                            title="进展"
                                                                            summary="写这条暗线现在推进到哪一步了，最近又露出了什么新线索。"
                                                                            metaphor="这个谜团现在查到哪了。"
                                                                            tone="purple"
                                                                            size="xs"
                                                                        />
                                                                    </div>
                                                                    <textarea 
                                                                        className="flex-1 text-xs text-gray-600 bg-transparent border-none resize-none p-0.5 focus:ring-0 leading-relaxed"
                                                                        value={node.progress}
                                                                        onChange={(e) => updateMysteryNode(i, 'progress', e.target.value)}
                                                                        rows={3}
                                                                        placeholder="目前这条暗线推进到哪一步了？"
                                                                    />
                                                                </div>
                                                                <div className="w-full h-px bg-purple-50/50"></div>
                                                                <div className="flex items-start gap-2">
                                                                    <div className="shrink-0 flex items-center justify-center gap-1 bg-purple-50 h-6 px-2 rounded border border-purple-100 text-[10px] text-purple-600 font-bold mt-0.5">
                                                                        <span>悬念</span>
                                                                        <InfoHint
                                                                            title="悬念"
                                                                            summary="写当前还没揭开的关键问题，也就是读者会继续追着想知道答案的那个点。"
                                                                            metaphor="还有什么秘密没说破。"
                                                                            tone="purple"
                                                                            size="xs"
                                                                            align="right"
                                                                        />
                                                                    </div>
                                                                    <textarea 
                                                                        className="flex-1 text-xs text-purple-700 font-medium bg-transparent border-none resize-none p-0.5 focus:ring-0 leading-relaxed"
                                                                        value={node.suspense}
                                                                        onChange={(e) => updateMysteryNode(i, 'suspense', e.target.value)}
                                                                        rows={2}
                                                                        placeholder="还有什么核心谜团没解开？"
                                                                    />
                                                                </div>
                                                                <div className="w-full h-px bg-purple-50/50"></div>
                                                                <div className="flex items-center gap-2 px-0.5 py-0.5">
                                                                    <div className="shrink-0 flex items-center justify-center bg-indigo-50 h-5 px-1.5 rounded border border-indigo-100/50 text-[10px] text-indigo-500 font-bold uppercase tracking-widest" title="伏笔初次出现的章节">
                                                                        起
                                                                    </div>
                                                                    <input 
                                                                        className="w-[100px] text-[10px] text-indigo-600 font-medium bg-transparent border-none p-0 focus:ring-0 placeholder:text-indigo-300"
                                                                        value={node.foreshadowingChapter || ''}
                                                                        onChange={(e) => updateMysteryNode(i, 'foreshadowingChapter', e.target.value)}
                                                                        placeholder="如: 第5章"
                                                                    />
                                                                    <div className="w-px h-3 bg-gray-200 mx-1"></div>
                                                                    <div className="shrink-0 flex items-center justify-center bg-teal-50 h-5 px-1.5 rounded border border-teal-100/50 text-[10px] text-teal-600 font-bold uppercase tracking-widest" title="伏笔揭晓/回收的章节">
                                                                        结
                                                                    </div>
                                                                    <input 
                                                                        className="flex-1 text-[10px] text-teal-600 font-medium bg-transparent border-none p-0 focus:ring-0 placeholder:text-teal-300"
                                                                        value={node.payoffChapter || ''}
                                                                        onChange={(e) => updateMysteryNode(i, 'payoffChapter', e.target.value)}
                                                                        placeholder="如: 第50章 或 暂无"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <button 
                                                                onClick={() => deleteMysteryNode(i)}
                                                                className="absolute top-3 right-3 text-purple-300 hover:text-red-500 opacity-0 group-hover/node:opacity-100 focus-within:opacity-100 transition-opacity p-1 rounded-full hover:bg-red-50"
                                                            >
                                                                <X className="w-3.5 h-3.5"/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'timeline' && (
                                    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2">
                                         <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-extrabold text-gray-700 text-lg">主线大纲 & 事件流</h3>
                                                <InfoHint
                                                    title="主线大纲 & 事件流"
                                                    summary="这里把整本书按大段剧情和关键事件拆开，方便你看节奏、做改编、继续往下生成。"
                                                    metaphor="把长故事拆成一段一段的主线地图。"
                                                    tone="slate"
                                                    widthClass="w-96"
                                                />
                                            </div>
                                            {canRetryLastBatch && (
                                                <button onClick={retryOutline} disabled={!!retryingSection} className="text-xs flex items-center gap-1 text-accent hover:bg-accent/5 px-2 py-1 rounded">
                                                    <RefreshCw className={`w-3 h-3 ${retryingSection === 'outline' ? 'animate-spin' : ''}`}/> {lastAnalysisRange && failedTasks.includes('outline') ? '重跑失败项' : '重跑上一批次'}
                                                </button>
                                            )}
                                        </div>

                                        {!blueprint.mainPlotArc?.phases || blueprint.mainPlotArc.phases.length === 0 ? (
                                            <div className="text-center p-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                                                暂无大纲数据，请开始分析...
                                            </div>
                                        ) : (
                                            <div className="space-y-8 relative pl-4 border-l-2 border-gray-100 ml-4">
                                                {blueprint.mainPlotArc.phases.map((phase, pIdx) => (
                                                    <div key={pIdx} className="relative pl-8 group/phase">
                                                        <div className="absolute left-[-21px] top-3 w-4 h-4 bg-white border-4 border-accent rounded-full z-10"></div>
                                                        
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <input 
                                                                className="text-lg font-bold text-gray-800 bg-transparent border-b border-transparent focus:border-accent outline-none w-full"
                                                                value={phase.phaseName}
                                                                onChange={(e) => updatePhaseName(pIdx, e.target.value)}
                                                            />
                                                            <InfoHint
                                                                title="剧情阶段"
                                                                summary="一个阶段是一整段连续的大剧情，比如同一场试炼、同一段副本、同一轮大战，不是一章一个阶段。"
                                                                metaphor="给这一大段故事起个标题。"
                                                                tone="slate"
                                                                size="xs"
                                                                widthClass="w-80"
                                                            />
                                                            <button onClick={() => deletePhase(pIdx)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover/phase:opacity-100 transition-opacity p-1">
                                                                <Trash2 className="w-4 h-4"/>
                                                            </button>
                                                        </div>
                                                        
                                                        <div className="space-y-4">
                                                            {phase.events.map((evt, eIdx) => (
                                                                <div key={eIdx} className="bg-white p-5 rounded-3xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] border border-gray-100 hover:border-accent/40 hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.15)] transition-all relative group/event">
                                                                    {/* Header: Range + Title + Stars */}
                                                                    <div className="flex items-center gap-3 mb-2">
                                                                        <input 
                                                                            className="text-xs font-bold text-white bg-gray-800 px-2 py-1 rounded-md w-20 text-center border-none outline-none"
                                                                            value={evt.range}
                                                                            onChange={(e) => updateEvent(pIdx, eIdx, 'range', e.target.value)}
                                                                        />
                                                                        <input 
                                                                            className="font-bold text-gray-800 text-lg flex-1 bg-transparent border-none outline-none"
                                                                            value={evt.title}
                                                                            onChange={(e) => updateEvent(pIdx, eIdx, 'title', e.target.value)}
                                                                        />
                                                                        <div className="flex gap-0.5">
                                                                            {renderStars(evt.importance || 0)}
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    {/* Main Summary */}
                                                                    <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
                                                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">事件摘要概要</span>
                                                                        <div className="h-px flex-1 bg-gray-100"></div>
                                                                        <InfoHint
                                                                            title="事件摘要"
                                                                            summary="用几句话讲清这件事是谁做了什么、为什么重要、最后结果怎样。"
                                                                            metaphor="这一小段剧情到底发生了什么。"
                                                                            tone="slate"
                                                                            size="xs"
                                                                            widthClass="w-80"
                                                                        />
                                                                    </div>
                                                                    <textarea 
                                                                        className="w-full text-sm text-gray-700 leading-relaxed bg-gray-100/50 p-3 rounded-2xl border-none focus:bg-white focus:ring-2 focus:ring-accent/10 outline-none resize-none mb-2 font-medium shadow-inner transition-all overflow-hidden"
                                                                        value={evt.summary || evt.content}
                                                                        onChange={(e) => {
                                                                            updateEvent(pIdx, eIdx, 'summary', e.target.value);
                                                                            e.target.style.height = 'auto';
                                                                            e.target.style.height = e.target.scrollHeight + 'px';
                                                                        }}
                                                                        onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                                        rows={3}
                                                                        style={{ minHeight: '4.5rem' }}
                                                                        ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                                                                        placeholder="核心事件摘要..."
                                                                    />

                                                                    {/* Detailed Fields Rendering (Restored) */}
                                                                    <div className="grid grid-cols-1 gap-3.5 mt-2">
                                                                        {/* 1. Plot Points */}
                                                                        {evt.plotPoints && evt.plotPoints.length > 0 && (
                                                                            <div className="bg-orange-100/30 p-3 rounded-2xl border border-orange-200/50 shadow-sm">
                                                                                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black text-orange-600 uppercase tracking-wider">
                                                                                    <Activity className="w-3 h-3"/> 关键聚焦情节点
                                                                                    <InfoHint
                                                                                        title="关键情节点"
                                                                                        summary="把这件事里最能推动剧情、最能带情绪的几个点拎出来，不用写流水账。"
                                                                                        metaphor="这段最该被记住的几个瞬间。"
                                                                                        tone="red"
                                                                                        size="xs"
                                                                                        widthClass="w-80"
                                                                                    />
                                                                                </div>
                                                                                <div className="space-y-2">
                                                                                    {evt.plotPoints.map((pt, i) => (
                                                                                        <div key={i} className="flex gap-2 items-start text-xs">
                                                                                            <span className="shrink-0 bg-white text-orange-500 font-bold px-1.5 rounded border border-orange-100">{pt.emotionalTag || "点"}</span>
                                                                                            <span className="text-gray-600 leading-relaxed break-words whitespace-pre-wrap">{pt.description}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* 2. Worldview & Golden Finger */}
                                                                        <div className="space-y-3">
                                                                            {evt.goldenFinger?.definition && (
                                                                                <div className="bg-yellow-100/40 p-3 rounded-2xl border border-yellow-200/60 flex items-start gap-3 shadow-sm">
                                                                                    <Fingerprint className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5"/>
                                                                                    <div>
                                                                                        <div className="flex items-center gap-1.5 text-[10px] font-black text-yellow-700 uppercase tracking-wider mb-1">
                                                                                            <span>神力/金手指</span>
                                                                                            <InfoHint
                                                                                                title="金手指"
                                                                                                summary="主角这一步靠了什么特殊优势、外挂、系统或独门能力，才能把局面扳回来。"
                                                                                                metaphor="主角这次是靠什么赢的。"
                                                                                                tone="red"
                                                                                                size="xs"
                                                                                                widthClass="w-80"
                                                                                            />
                                                                                        </div>
                                                                                        <div className="text-xs text-gray-700 font-medium leading-relaxed break-words whitespace-pre-wrap">{evt.goldenFinger.definition}</div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                            
                                                                            {evt.worldview && (
                                                                                <div className="bg-blue-100/40 p-3 rounded-2xl border border-blue-200/60 flex items-start gap-3 shadow-sm">
                                                                                    <Map className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"/>
                                                                                    <div className="text-xs text-gray-700 flex-1">
                                                                                        <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">
                                                                                            <span>世界观补完</span>
                                                                                            <InfoHint
                                                                                                title="设定补充"
                                                                                                summary="这段剧情里如果出现了新规则、新能力、新物品，就记在这里，方便后面不丢设定。"
                                                                                                metaphor="这段新冒出来的世界规则。"
                                                                                                tone="blue"
                                                                                                size="xs"
                                                                                                widthClass="w-80"
                                                                                            />
                                                                                        </div>
                                                                                        <div className="space-y-1">
                                                                                            {evt.worldview.powerSystem && <div className="break-words whitespace-pre-wrap"><span className="font-bold text-blue-400">体系轴:</span> {evt.worldview.powerSystem}</div>}
                                                                                            {evt.worldview.items && <div className="break-words whitespace-pre-wrap"><span className="font-bold text-blue-400">重型道具:</span> {evt.worldview.items}</div>}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* 3. Quotes */}
                                                                    {evt.quotes && evt.quotes.length > 0 && (
                                                                        <div className="mt-3 pl-3 border-l-2 border-gray-200">
                                                                            <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-gray-500">
                                                                                <span>金句</span>
                                                                                <InfoHint
                                                                                    title="金句"
                                                                                    summary="把最能代表人物、最有情绪冲击的台词留下来，不求多，求能记住。"
                                                                                    metaphor="最容易被观众记住的话。"
                                                                                    tone="slate"
                                                                                    size="xs"
                                                                                    widthClass="w-80"
                                                                                />
                                                                            </div>
                                                                            {evt.quotes.map((q, i) => (
                                                                                <p key={i} className="text-xs text-gray-500 italic mb-1">"{q}"</p>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    <button 
                                                                        onClick={() => deleteEvent(pIdx, eIdx)}
                                                                        className="absolute top-2 right-2 text-gray-200 hover:text-red-400 opacity-0 group-hover/event:opacity-100 transition-opacity"
                                                                    >
                                                                        <X className="w-3 h-3"/>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                             </>
                         )}
                     </div>
                </div>

                {/* Right Panel: Character Matrix (Refactored for Timeline) */}
                <div className="w-[30%] bg-white border-l border-gray-200 flex flex-col shadow-xl z-20 min-w-[300px]">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-extrabold text-gray-700 flex items-center gap-2">
                                <Users className="w-5 h-5 text-purple-500"/> 动态人物档案
                            </h3>
                            <InfoHint
                                title="动态人物档案"
                                summary="这里看人物不是固定设定，而是跟着剧情往前走的变化版档案：每个阶段的状态、目标和关系都会更新。"
                                metaphor="同一个人，在不同剧情节点会变成不同样子。"
                                tone="purple"
                                align="right"
                                widthClass="w-96"
                            />
                        </div>
                        <div className="flex gap-2">
                             {canRetryLastBatch && (
                                <button onClick={retryCharacters} disabled={!!retryingSection} className="p-1.5 text-purple-500 bg-purple-50 rounded hover:bg-purple-100" title={lastAnalysisRange && failedTasks.includes('char') ? '重跑失败人物' : '重跑上一批次人物'}>
                                    <RefreshCw className={`w-4 h-4 ${retryingSection === 'chars' ? 'animate-spin' : ''}`}/>
                                </button>
                             )}
                            <button 
                                onClick={() => openCharModal()}
                                className="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 shadow-sm"
                            >
                                <Plus className="w-4 h-4"/>
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
                        {characters.length === 0 && !blueprint && (
                             <div className="text-center text-gray-400 text-sm mt-20">暂无人物数据</div>
                        )}
                        
                        {characters.map(char => (
                            <div key={char.id} className="group relative bg-white border border-gray-100 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all">
                                <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                                    <button onClick={() => openCharModal(char)} className="p-1 text-gray-400 hover:text-blue-500 bg-gray-50 rounded"><Edit2 className="w-3 h-3"/></button>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs shrink-0">
                                        {char.role[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-gray-800 text-sm truncate">{char.name} <span className="text-xs text-gray-400 font-normal ml-1">({char.role})</span></div>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    {/* Static Bio */}
                                    <div className="text-[10px] text-gray-500 bg-gray-50 p-2 rounded leading-snug">
                                        {char.bio || "暂无简介"}
                                    </div>

                                    {/* Timeline Stages */}
                                    {char.timeline.map((stage, idx) => (
                                        <div key={stage.id} className="relative pl-3 border-l-2 border-purple-100 ml-1">
                                            <div className="mb-1 flex items-center justify-between cursor-pointer" onClick={() => setExpandedCharId(expandedCharId === stage.id ? null : stage.id)}>
                                                <div>
                                                    <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mr-2">
                                                        {stage.stageName}
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 font-mono">
                                                        {stage.sourceRange}
                                                    </span>
                                                </div>
                                                {expandedCharId === stage.id ? <ChevronUp className="w-3 h-3 text-gray-400"/> : <ChevronDown className="w-3 h-3 text-gray-400"/>}
                                            </div>
                                            
                                            {expandedCharId === stage.id ? (
                                                <div className="text-[9px] text-gray-600 space-y-1 bg-gray-50 p-2 rounded mt-1 animate-in fade-in zoom-in-95 duration-200">
                                                    <div><span className="font-bold text-purple-400">状态:</span> {stage.physicalState}</div>
                                                    <div><span className="font-bold text-purple-400">目标:</span> {stage.coreGoal}</div>
                                                    <div><span className="font-bold text-purple-400">性格:</span> {stage.personalityTags.join(', ')}</div>
                                                    {/* Added Relations Display */}
                                                    {stage.relations && stage.relations.length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-gray-200">
                                                            {stage.relations.map((rel, rIdx) => (
                                                                <div key={rIdx} className="flex gap-1 mb-0.5">
                                                                    <span className="text-gray-400">对</span>
                                                                    <span className="font-bold text-gray-700">{rel.target}:</span>
                                                                    <span className="text-purple-600">{rel.attitude}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BlueprintEditor;
