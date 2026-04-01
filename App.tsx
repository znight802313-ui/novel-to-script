
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from './components/FileUpload';
import { ProjectState, Episode, AppStep, StoryBlueprint, AnalyzedCharacter, CharacterProfile, AnalysisRange, BlueprintRetrySnapshot, OutlineGlobalSettings } from './types';
import { getRelevantChapterContent, getChapterRange } from './utils/fileParser';
import { buildCharacterProfileForEpisode, refreshCharacterProfileList } from './utils/characterProfile';
import { clearProjectState, loadProjectState, persistProjectState } from './utils/projectPersistence';

const PERSIST_DEBOUNCE_MS = 400;

const BlueprintEditor = lazy(() => import('./components/BlueprintEditor'));
const OutlineBuilder = lazy(() => import('./components/OutlineBuilder'));
const ScriptGenerator = lazy(() => import('./components/ScriptGenerator'));
const ScriptAuditor = lazy(() => import('./components/ScriptAuditor'));

const StepLoadingFallback: React.FC<{ message?: string }> = ({ message = '正在加载模块...' }) => (
  <div className="min-h-screen bg-paper flex items-center justify-center font-sans">
    <div className="flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
      <div className="text-gray-500 font-bold tracking-widest text-sm animate-pulse">{message}</div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [projectState, _setProjectState] = useState<ProjectState | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const persistTimeoutRef = useRef<number | null>(null);
  const hasInitializedPersistenceRef = useRef(false);

  // 从 IndexedDB 恢复状态，支持存储几百 MB 的大文件和分析结果
  useEffect(() => {
    const init = async () => {
      try {
        const saved = await loadProjectState();
        if (saved) {
          _setProjectState(saved);
        }
      } catch (e) {
        console.warn('读取项目状态失败:', e);
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (isInitializing) {
      return;
    }

    if (!hasInitializedPersistenceRef.current) {
      hasInitializedPersistenceRef.current = true;
      return;
    }

    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }

    if (projectState === null) {
      clearProjectState().catch(e => console.warn('清除 IndexedDB 失败:', e));
      return;
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      persistProjectState(projectState).catch(e => console.warn('存入 IndexedDB 失败:', e));
      persistTimeoutRef.current = null;
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [projectState, isInitializing]);

  const setProjectState = useCallback((updater: React.SetStateAction<ProjectState | null>) => {
    _setProjectState(prev => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  // 新建项目确认弹窗状态
  const [showNewProjectConfirm, setShowNewProjectConfirm] = useState(false);

  // 返回上一步确认弹窗状态
  const [showGoBackConfirm, setShowGoBackConfirm] = useState(false);

  const handleDataParsed = (data: ProjectState) => {
    setProjectState(data);
  };

  const handleProjectNameChange = useCallback((nextName: string) => {
    const trimmedName = nextName.trim();
    if (!trimmedName) return;

    setProjectState(prev => prev ? {
      ...prev,
      novelName: trimmedName,
    } : prev);
  }, [setProjectState]);

  const handleBlueprintComplete = (blueprint: StoryBlueprint, characters: AnalyzedCharacter[]) => {
    if (projectState) {
        setProjectState({
            ...projectState,
            blueprint,
            characters,
            currentStep: AppStep.OUTLINE
        });
    }
  };

  const handleBlueprintAutoSave = useCallback((
    blueprint: StoryBlueprint | null,
    characters: AnalyzedCharacter[],
    lastAnalysisRange: AnalysisRange | null,
    retrySnapshot: BlueprintRetrySnapshot | null,
  ) => {
    setProjectState(prev => prev ? {
        ...prev,
        blueprint,
        characters,
        blueprintLastAnalysisRange: lastAnalysisRange,
        blueprintRetrySnapshot: retrySnapshot,
    } : null);
  }, [setProjectState]);

  const handleOutlineComplete = (episodes: Episode[], outlineGlobalSettings: OutlineGlobalSettings) => {
    if (projectState) {
        // --- NEW LOGIC: Match & Inject Characters from Step 1 AND Source Text ---
        
        const enrichedEpisodes = episodes.map(ep => {
            let characterList = ep.draftCharacterList;

            // 1. Inject Characters if missing
            // Logic updated to handle the new deep "timeline" structure AND dynamic range matching
            const epRange = getChapterRange(ep.targetChapter || ep.draftTargetChapter || "");
            if (!characterList || characterList.length === 0) {
                 characterList = projectState.characters.map(c => buildCharacterProfileForEpisode(c, epRange));
            } else {
                 characterList = refreshCharacterProfileList(characterList, projectState.characters, epRange);
            }

            // 2. Inject Source Text Reference (Crucial fix for Step 2 -> Step 3)
            // If the episode has a targetChapter (e.g. "第1-2章"), we extract the text immediately
            // so Step 3's "Workshop" is pre-filled.
            const sourceText = getRelevantChapterContent(
                projectState.novelChapters, 
                ep.targetChapter || ep.draftTargetChapter || ""
            );

            return {
                ...ep,
                draftCharacterList: characterList,
                draftNovelContent: sourceText, // Pre-fill source content
                // Ensure draftOutline is populated so Step 3 skips redundant analysis
                draftOutline: ep.draftOutline || ep.content,
                status: ep.generatedScript && ep.generatedScript.trim() ? 'completed' : ep.status
            };
        });

        setProjectState({
            ...projectState,
            episodes: enrichedEpisodes,
            outlineGlobalSettings,
            currentStep: AppStep.SCRIPT
        });
    }
  };

  const handleOutlineAutoSave = useCallback((episodes: Episode[], outlineGlobalSettings: OutlineGlobalSettings) => {
    setProjectState(prev => prev ? {
        ...prev,
        episodes,
        outlineGlobalSettings,
    } : null);
  }, [setProjectState]);

  const handleEpisodesUpdate = (updatedEpisodes: Episode[]) => {
    if (projectState) {
      setProjectState({
        ...projectState,
        episodes: updatedEpisodes
      });
    }
  };

  // 从剧本生成页面进入审稿页面
  const goToAudit = () => {
    if (projectState) {
      setProjectState({
        ...projectState,
        currentStep: AppStep.AUDIT
      });
    }
  };

  const closeAuditor = () => {
    // If entered via upload, go back to upload. If generated flow, maybe go back to script?
    // For simplicity, reset to upload if standalone, or logic can be refined.
    if (projectState?.currentStep === AppStep.AUDIT && !projectState.episodes.length) {
       setProjectState(null); // Back to upload
    } else {
       // Just go back to Script view? Or remain in state but hidden?
       // Current requirement is audit mode. Let's just go back to Script Step.
       setProjectState(prev => prev ? { ...prev, currentStep: AppStep.SCRIPT } : null);
    }
  };

  // 新建项目函数
  const newProject = () => setShowNewProjectConfirm(true);
  const confirmNewProject = () => {
    setProjectState(null);
    setShowNewProjectConfirm(false);
  };

  // 返回上一步函数
  const goBack = () => setShowGoBackConfirm(true);
  const confirmGoBack = () => {
    if (projectState) {
      switch (projectState.currentStep) {
        case AppStep.BLUEPRINT:
          setProjectState(null);
          break;
        case AppStep.OUTLINE:
          setProjectState({ ...projectState, currentStep: AppStep.BLUEPRINT });
          break;
        case AppStep.SCRIPT:
          setProjectState({ ...projectState, currentStep: AppStep.OUTLINE });
          break;
        case AppStep.AUDIT:
          setProjectState({ ...projectState, currentStep: AppStep.SCRIPT });
          break;
        default:
          break;
      }
    }
    setShowGoBackConfirm(false);
  };

  const auditContext = useMemo(() => {
    if (!projectState || projectState.currentStep !== AppStep.AUDIT) {
      return null;
    }

    const completedEpisodes = projectState.episodes.filter(e => e.status === 'completed' && e.generatedScript);

    const usedNovelContent = completedEpisodes
      .map(e => e.usedSourceText || e.draftNovelContent || '')
      .filter(text => text.length > 0)
      .join("\n\n---\n\n");

    const novelContext = usedNovelContent ||
      projectState.novelChapters.slice(0, 10).map(c => c.content).join("\n\n") ||
      '无小说上下文';

    const outlineContext = projectState.episodes
      .map(e => `【第${e.id}集】${e.title}\n${e.draftOutline || e.content}`)
      .join("\n\n") || '无大纲上下文';

    const targetScript = projectState.standaloneScript ||
      completedEpisodes.map(e => e.generatedScript).filter(Boolean).join("\n\n") ||
      '';

    return {
      novelContext,
      outlineContext,
      targetScript,
    };
  }, [projectState]);

  // 新建项目确认 Modal
  const NewProjectModal = showNewProjectConfirm ? (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-4 text-2xl">
            ✨
          </div>
          <h3 className="text-lg font-extrabold text-gray-800 mb-2">新建项目</h3>
          <p className="text-gray-500 text-sm mb-6">新建项目后当前进度将丢失，确定要新建吗？</p>
          <div className="flex gap-3 w-full">
            <button onClick={() => setShowNewProjectConfirm(false)} className="flex-1 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 border border-gray-200">取消</button>
            <button onClick={confirmNewProject} className="flex-1 py-2.5 rounded-xl font-bold text-white bg-blue-500 hover:bg-blue-600 shadow-sm">确定新建</button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // 返回上一步确认 Modal
  const GoBackModal = showGoBackConfirm ? (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4 text-2xl">
            ⬅️
          </div>
          <h3 className="text-lg font-extrabold text-gray-800 mb-2">返回上一步</h3>
          <p className="text-gray-500 text-sm mb-6">返回上一步后当前步骤的修改可能丢失，确定要返回吗？</p>
          <div className="flex gap-3 w-full">
            <button onClick={() => setShowGoBackConfirm(false)} className="flex-1 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 border border-gray-200">取消</button>
            <button onClick={confirmGoBack} className="flex-1 py-2.5 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-sm">确定返回</button>
          </div>
        </div>
      </div>
    </div>
  ) : null;


  // Render Logic
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
          <div className="text-gray-500 font-bold tracking-widest text-sm animate-pulse">正在恢复项目数据...</div>
        </div>
      </div>
    );
  }

  if (!projectState) {
      return (
        <div className="min-h-screen bg-paper font-sans">
             <FileUpload onDataParsed={handleDataParsed} />
             <footer className="fixed bottom-4 w-full text-center text-xs text-gray-400">
                Provided by Li Sui with full-chain technology
            </footer>
        </div>
      );
  }

  // Step 1: Blueprint
  if (projectState.currentStep === AppStep.BLUEPRINT) {
      return (
        <>
          {NewProjectModal}
          {GoBackModal}
          <Suspense fallback={<StepLoadingFallback message="正在加载故事蓝图模块..." />}>
            <BlueprintEditor
              chapters={projectState.novelChapters}
              initialBlueprint={projectState.blueprint}
              initialCharacters={projectState.characters}
              initialLastAnalysisRange={projectState.blueprintLastAnalysisRange || null}
              initialRetrySnapshot={projectState.blueprintRetrySnapshot || null}
              onComplete={handleBlueprintComplete}
              onAutoSave={handleBlueprintAutoSave}
              onNewProject={newProject}
              onGoBack={goBack}
              apiKey={projectState.apiKey || ""}
              baseUrl={projectState.baseUrl}
              novelName={projectState.novelName}
              onNovelNameChange={handleProjectNameChange}
            />
          </Suspense>
        </>
      );
  }

  // Step 2: Outline
  if (projectState.currentStep === AppStep.OUTLINE) {
      return (
        <>
          {NewProjectModal}
          {GoBackModal}
          <Suspense fallback={<StepLoadingFallback message="正在加载分集大纲模块..." />}>
            <OutlineBuilder
              chapters={projectState.novelChapters}
              blueprint={projectState.blueprint!}
              characters={projectState.characters}
              initialEpisodes={projectState.episodes}
              initialGlobalSettings={projectState.outlineGlobalSettings}
              onComplete={handleOutlineComplete}
              onAutoSave={handleOutlineAutoSave}
              onNewProject={newProject}
              onGoBack={goBack}
              apiKey={projectState.apiKey || ""}
              baseUrl={projectState.baseUrl}
              novelName={projectState.novelName}
              onNovelNameChange={handleProjectNameChange}
            />
          </Suspense>
        </>
      );
  }

  // Step 4: Standalone Audit Mode (or navigated to)
  if (projectState.currentStep === AppStep.AUDIT) {
      return (
          <div className="h-screen bg-white font-sans">
              {NewProjectModal}
              {GoBackModal}
                  <Suspense fallback={<StepLoadingFallback message="正在加载剧本审稿模块..." />}>
                <ScriptAuditor
                   initialScript={auditContext?.targetScript || ''}
                   novelContext={auditContext?.novelContext || '无小说上下文'}
                   outlineContext={auditContext?.outlineContext || '无大纲上下文'}
                   episodes={projectState.episodes}
                   chapters={projectState.novelChapters}
                   apiKey={projectState.apiKey || ""}
                   baseUrl={projectState.baseUrl}
                   novelName={projectState.novelName}
                   onNovelNameChange={handleProjectNameChange}
                   onClose={closeAuditor}
                   onNewProject={newProject}
                   onGoBack={goBack}
                />
              </Suspense>
          </div>
      )
  }

  // Step 3: Script Generation
  return (
    <>
      {NewProjectModal}
      {GoBackModal}
      <div className="min-h-screen bg-comic-blue font-sans">
          <Suspense fallback={<StepLoadingFallback message="正在加载剧本创作模块..." />}>
            <ScriptGenerator
              episodes={projectState.episodes}
              chapters={projectState.novelChapters}
              blueprint={projectState.blueprint}
              onEpisodesUpdate={handleEpisodesUpdate}
              onNewProject={newProject}
              onGoBack={goBack}
              onGoToAudit={goToAudit}
              apiKey={projectState.apiKey}
              baseUrl={projectState.baseUrl}
              novelName={projectState.novelName}
              onNovelNameChange={handleProjectNameChange}
            />
          </Suspense>
      </div>
    </>
  );
};

export default App;
