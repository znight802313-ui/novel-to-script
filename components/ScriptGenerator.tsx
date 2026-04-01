
import React, { useState, useEffect, useRef } from 'react';
import { Episode, Chapter, ChatMessage, ScriptVersion, AuditItem, CharacterProfile, ScriptGenerationConfig, ScriptNarrativeType, StoryBlueprint } from '../types';
import { generateEpisodeScript, refineScript, parseOutlineWithAI, auditScript, AVAILABLE_MODELS, getRecommendedModel } from '../services/geminiService';
import { getRelevantChapterContent } from '../utils/fileParser';
import { Play, Loader2, RefreshCw, Settings, PauseCircle, Zap, BookOpen, ChevronDown, Send, MessageSquare, History, X, ArrowRight, AlertCircle, Check, ListChecks, Wand2, Plus, Trash2, UserPlus, Save, Eye, Quote, Anchor, Target, Users, Sparkles, Globe, Download, LayoutTemplate, Sparkle, Layers, User, Bot, RotateCcw, ScanEye, Home, Edit2 } from 'lucide-react';
import { useCapacityErrorHandler } from '../utils/useCapacityErrorHandler';
import DiffTextView from './DiffTextView';
import { useAiTask } from '../utils/useAiTask';

interface ScriptGeneratorProps {
  episodes: Episode[];
  chapters: Chapter[];
  blueprint?: StoryBlueprint | null; // 添加blueprint参数，用于获取主角信息
  onEpisodesUpdate: (episodes: Episode[]) => void;
  onNewProject: () => void;
  onGoBack: () => void;
  onGoToAudit?: () => void; // 新增：跳转到审稿界面
  apiKey?: string;
  baseUrl?: string;
  novelName?: string;
  onNovelNameChange?: (name: string) => void;
}

// --- Extracted Components to fix focus issues ---

interface GeneralModalProps {
  state: {
    isOpen: boolean;
    type: 'input' | 'confirm' | 'success';
    title: string;
    message?: string;
    defaultValue?: string;
    onConfirm: (val?: string) => void;
  } | null;
  onClose: () => void;
}

const GeneralModal: React.FC<GeneralModalProps> = ({ state, onClose }) => {
    // We use a key based on isOpen to reset state when reopening
    const [inputValue, setInputValue] = useState("");

    useEffect(() => {
        if (state?.isOpen) {
            setInputValue(state.defaultValue || "");
        }
    }, [state]);

    if (!state || !state.isOpen) return null;

    const { type, title, message, onConfirm } = state;

    const handleConfirm = () => {
        onConfirm(type === 'input' ? inputValue : undefined);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md transform scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
                        type === 'success' ? 'bg-green-100 text-green-600' : 
                        type === 'confirm' ? 'bg-amber-100 text-amber-600' : 
                        'bg-blue-100 text-blue-600'
                    }`}>
                        {type === 'success' ? <Check className="w-6 h-6"/> : 
                         type === 'confirm' ? <AlertCircle className="w-6 h-6"/> :
                         <Save className="w-6 h-6"/>}
                    </div>
                    <h3 className="text-xl font-extrabold text-gray-800 mb-2">{title}</h3>
                    <p className="text-gray-500 text-sm mb-6 whitespace-pre-wrap">{message}</p>
                    
                    {type === 'input' && (
                        <input 
                            autoFocus
                            type="text" 
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-6 focus:ring-2 focus:ring-primary/20 outline-none"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                        />
                    )}

                    <div className="flex gap-3 w-full">
                        {type !== 'success' && (
                            <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">
                                取消
                            </button>
                        )}
                        <button onClick={handleConfirm} className={`flex-1 py-3 rounded-xl font-bold text-white shadow-lg transform active:scale-95 transition-all ${
                            type === 'success' ? 'bg-green-500 hover:bg-green-600' : 
                            type === 'confirm' ? 'bg-amber-500 hover:bg-amber-600' :
                            'bg-primary hover:bg-primary-hover'
                        }`}>
                            {type === 'success' ? '知道了' : '确认'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface CharacterModalProps {
  isOpen: boolean;
  editingId: string | null;
  tempData: { name: string; desc: string };
  setTempData: (data: { name: string; desc: string }) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
}

const CharacterModal: React.FC<CharacterModalProps> = ({ 
    isOpen, editingId, tempData, setTempData, onClose, onSave, onDelete 
}) => {
    if (!isOpen) return null;
    
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-lg transform scale-100 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-primary"/>
                      {editingId ? '编辑人物人设' : '添加新人物'}
                  </h3>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                  </button>
              </div>
              
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">人物姓名</label>
                      <input 
                          type="text" 
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 outline-none font-bold"
                          placeholder="例如：简初夏"
                          value={tempData.name}
                          onChange={(e) => setTempData({...tempData, name: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">本集人设 / 心理 / 目的</label>
                      <textarea 
                          rows={4}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 outline-none resize-none text-sm"
                          placeholder="例如：刚出狱，性格隐忍但满怀复仇火焰，本集目的是寻找女儿下落..."
                          value={tempData.desc}
                          onChange={(e) => setTempData({...tempData, desc: e.target.value})}
                      />
                      <p className="text-[10px] text-gray-400 mt-1">AI 将根据此描述调整人物的台词风格和行为逻辑。</p>
                  </div>
              </div>

              <div className="flex gap-3 w-full mt-8">
                  {editingId && (
                      <button 
                          onClick={() => onDelete(editingId)}
                          className="px-4 py-3 rounded-xl bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-colors flex items-center justify-center"
                      >
                          <Trash2 className="w-5 h-5"/>
                      </button>
                  )}
                  <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">
                      取消
                  </button>
                  <button onClick={onSave} className="flex-1 py-3 rounded-xl font-bold text-white bg-primary hover:bg-primary-hover shadow-lg transform active:scale-95 transition-all">
                      保存人设
                  </button>
              </div>
          </div>
      </div>
    );
};


const ScriptGenerator: React.FC<ScriptGeneratorProps> = ({ episodes, chapters, blueprint, onEpisodesUpdate, onNewProject, onGoBack, onGoToAudit, apiKey, baseUrl, novelName, onNovelNameChange }) => {
  // Capacity Error Handler
  const { CapacityErrorModal, handleError: handleCapacityError } = useCapacityErrorHandler();
  const generationTask = useAiTask('剧本生成');
  const refineTask = useAiTask('剧本修订');

  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  // Narrative Type Selection
  const [narrativeType, setNarrativeType] = useState<ScriptNarrativeType>('third-person');
  const [useNovelReference, setUseNovelReference] = useState(true);

  // 第一人称叙述者信息（从blueprint中获取，或用户自定义）
  const [customNarrator, setCustomNarrator] = useState<{ name: string; identity: string } | null>(null);
  const narratorInfo = customNarrator || blueprint?.protagonist || null;

  // 叙述者编辑状态
  const [isEditingNarrator, setIsEditingNarrator] = useState(false);
  const [narratorEditName, setNarratorEditName] = useState('');
  const [narratorEditIdentity, setNarratorEditIdentity] = useState('');

  // Editor & Chat States
  const [selectedModel, setSelectedModel] = useState<string>(() => getRecommendedModel('generation'));
  const [auditModel, setAuditModel] = useState<string>(() => getRecommendedModel('audit'));
  const [showSourcePreview, setShowSourcePreview] = useState(false); 
  const [chatInput, setChatInput] = useState("");
  const [showSidePanel, setShowSidePanel] = useState(true); 
  const [sidePanelTab, setSidePanelTab] = useState<'chat' | 'audit'>('chat');
  const isGenerating = generationTask.isRunning;
  const isChatProcessing = refineTask.isRunning;
  
  // Diff View State
  const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit');
  
  // Selection & Versioning
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<ScriptVersion | null>(null); 

  // Outline Editing State
  const [isEditingOutline, setIsEditingOutline] = useState(false);

  // Character Editing State
  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [tempCharData, setTempCharData] = useState<{name: string, desc: string}>({name:'', desc:''});

  // Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'input' | 'confirm' | 'success';
    title: string;
    message?: string;
    defaultValue?: string;
    onConfirm: (val?: string) => void;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use a ref to access the latest episodes inside async callbacks without stale closures
  const episodesRef = useRef(episodes);
  useEffect(() => {
    episodesRef.current = episodes;
  }, [episodes]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowSourcePreview(false);
    setViewMode('edit'); 
    setSelectedText(null); 
    setShowHistoryDropdown(false);
    setPreviewVersion(null); 
    setIsEditingOutline(false); 
    setSidePanelTab('chat'); 
    setIsCharModalOpen(false);
  }, [currentEpisodeIndex]);

  // Scroll chat to bottom when history updates
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [episodes, currentEpisodeIndex, isChatProcessing]);

  // --- Helpers for Versioning ---
  const saveCurrentVersion = (
      episode: Episode, 
      note: string, 
      type: 'manual' | 'ai' | 'auto'
  ): Episode => {
    if (!episode.generatedScript) return episode;
    
    const newVersion: ScriptVersion = {
      id: Date.now().toString(),
      content: episode.generatedScript,
      timestamp: Date.now(),
      note: note,
      type: type
    };

    const versions = episode.scriptVersions ? [...(episode.scriptVersions || [])] : [];
    
    if (type !== 'manual' && versions.length > 0 && versions[versions.length - 1].content === episode.generatedScript) {
      return episode;
    }

    versions.push(newVersion);
    return { ...episode, scriptVersions: versions };
  };

  const closeModal = () => setModalState(null);

  const handleManualSave = () => {
    setModalState({
      isOpen: true,
      type: 'input',
      title: '保存当前版本',
      message: '请为当前版本添加一个备注（如：修改了结尾）：',
      defaultValue: '手动保存',
      onConfirm: (note) => {
        const finalNote = note || "手动保存";
        const updatedEpisode = saveCurrentVersion(
          episodes[currentEpisodeIndex], 
          finalNote,
          'manual'
        );
        const updatedEpisodes = [...episodes];
        updatedEpisodes[currentEpisodeIndex] = updatedEpisode;
        onEpisodesUpdate(updatedEpisodes);
        closeModal();
        
        // Show success feedback
        setTimeout(() => {
          setModalState({
            isOpen: true,
            type: 'success',
            title: '保存成功',
            message: '新版本已保存到历史记录中。',
            onConfirm: () => closeModal()
          });
        }, 100);
      }
    });
  };

  const handlePreviewVersion = (version: ScriptVersion) => {
      setPreviewVersion(version);
      setShowHistoryDropdown(false);
  };

  const confirmRestoreVersion = () => {
    if (!previewVersion) return;
    
    setModalState({
      isOpen: true,
      type: 'confirm',
      title: '确认恢复此版本？',
      message: `恢复到 ${new Date(previewVersion.timestamp).toLocaleTimeString()} 的版本后，当前编辑区的未保存内容将被覆盖。\n您确认要执行此操作吗？`,
      onConfirm: () => {
        const updatedEpisodes = [...episodes];
        updatedEpisodes[currentEpisodeIndex] = {
          ...updatedEpisodes[currentEpisodeIndex],
          generatedScript: previewVersion.content
        };
        onEpisodesUpdate(updatedEpisodes);
        setPreviewVersion(null); 
        closeModal();
        
        setTimeout(() => {
          setModalState({
            isOpen: true,
            type: 'success',
            title: '恢复成功',
            message: '剧本已恢复，您可以继续编辑。',
            onConfirm: () => closeModal()
          });
        }, 100);
      }
    });
  };

  // --- Background Batch Analysis Logic ---
  useEffect(() => {
    const runBatchAnalysis = async () => {
      const keyToUse = apiKey || import.meta.env.VITE_API_KEY || '';
      if (!keyToUse) return;
      
      const indicesToProcess = episodesRef.current
        .map((ep, idx) => ({ ...ep, idx }))
        .filter(ep => 
          (ep.status === 'pending' || ep.status === 'error') && 
          ep.draftOutline === undefined && 
          !ep.isAnalyzing
        )
        .map(ep => ep.idx);

      if (indicesToProcess.length === 0) return;

      const episodesMarked = [...episodesRef.current];
      indicesToProcess.forEach(idx => {
        episodesMarked[idx] = { ...episodesMarked[idx], isAnalyzing: true };
      });
      onEpisodesUpdate(episodesMarked);

      const CONCURRENCY_LIMIT = 2;
      let activePromises = 0;
      let currentIndex = 0;

      const processNext = async () => {
        if (currentIndex >= indicesToProcess.length) return;

        const targetIndex = indicesToProcess[currentIndex];
        currentIndex++;
        activePromises++;

        const ep = episodesRef.current[targetIndex];
        
        try {
          const novelContent = getRelevantChapterContent(chapters, ep.targetChapter); // FIXED: Pass chapters
          const result = await parseOutlineWithAI(keyToUse, ep.content, baseUrl);

          if (!episodesRef.current[targetIndex].isAnalyzing) {
             return;
          }

          const currentList = [...episodesRef.current];
          currentList[targetIndex] = {
            ...currentList[targetIndex],
            draftOutline: result.mainPlot,
            draftCharacterList: result.characterList,
            draftOpeningHook: result.openingHook,
            draftForeshadowing: result.foreshadowing,
            // REMOVED: draftTone
            draftKeyQuotes: result.keyQuotes,
            draftWorldSetting: result.worldSetting,
            draftTargetChapter: result.targetChapter || ep.targetChapter,
            draftNovelContent: novelContent,
            isAnalyzing: false 
          };

          onEpisodesUpdate(currentList);
        } catch (err) {
          console.error(`Analysis failed for episode ${ep.id}`, err);
          const currentList = [...episodesRef.current];
          if (!episodesRef.current[targetIndex].isAnalyzing) return;

          currentList[targetIndex] = { 
            ...currentList[targetIndex], 
            isAnalyzing: false,
            draftOutline: ep.content,
            draftNovelContent: getRelevantChapterContent(chapters, ep.targetChapter) || "" // FIXED: Pass chapters
          };
          onEpisodesUpdate(currentList);
        } finally {
          activePromises--;
          processNext();
        }
      };

      for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
        processNext();
      }
    };

    runBatchAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]); 

  // Auto-generation Logic
  useEffect(() => {
    if (!isAutoGenerating) return;

    const currentEp = episodes[currentEpisodeIndex];

    if (currentEp.status === 'completed') {
      if (currentEpisodeIndex < episodes.length - 1) {
        const timer = setTimeout(() => {
          setCurrentEpisodeIndex(prev => prev + 1);
        }, 3000); 
        return () => clearTimeout(timer);
      } else {
        setIsAutoGenerating(false);
      }
    } else if (currentEp.status === 'pending') {
      if (!currentEp.isAnalyzing) {
        generateEpisode(currentEpisodeIndex);
      }
    } else if (currentEp.status === 'error') {
      setIsAutoGenerating(false);
    }
  }, [isAutoGenerating, currentEpisodeIndex, episodes]);

  // --- Generation Logic ---

  const generateEpisode = async (index: number) => {
    if (index >= episodes.length) return;

    const keyToUse = apiKey || import.meta.env.VITE_API_KEY || '';
    if (!keyToUse) {
      alert("未配置 API Key，请在首页设置或配置环境变量。");
      setIsAutoGenerating(false);
      return;
    }

    const episode = episodes[index];
    if (episode.status === 'generating') return;

    let epToProcess = episode;

    if (episode.status === 'completed' && episode.generatedScript) {
        epToProcess = saveCurrentVersion(episode, "Archive before re-generation", 'auto');
    }

    const tempEpisodes = [...episodes];
    tempEpisodes[index] = { ...epToProcess, status: 'generating' };
    onEpisodesUpdate(tempEpisodes);
    setIsEditingOutline(false); 

    try {
      const { relevantContent, script } = await generationTask.runTask(async ({ log, signal }) => {
        const relevantContent = episode.draftNovelContent !== undefined && episode.draftNovelContent.trim() !== ""
          ? episode.draftNovelContent 
          : getRelevantChapterContent(chapters, episode.targetChapter);

        const outlineContent = episode.draftOutline !== undefined 
          ? episode.draftOutline 
          : episode.content;

        const prevScript = index > 0 ? episodes[index - 1].generatedScript || "" : "";

        const prevNovelTail = (() => {
          if (index === 0) return "";
          const prevSourceText = episodes[index - 1].usedSourceText || "";
          if (!prevSourceText) return "";
          const tail = prevSourceText.slice(-1200);
          const sentenceStart = tail.search(/(?<=[。！？\n])\S/);
          return sentenceStart > 0 ? tail.slice(sentenceStart) : tail;
        })();

        log(`生成第 ${episode.id} 集剧本`);

        // --- 智能提取匹配出场人物的羁绊和冲突线 ---
        let conflictArcFiltered = "";
        let relationshipArcFiltered = "";

        if (blueprint) {
          const appearingNames = (episode.draftCharacterList || []).map(c => c.name);
          const fallbackNames = episode.draftCharacters ? episode.draftCharacters.split(/[,，、\s]/).map(n => n.trim()) : [];
          const allNames = Array.from(new Set([...appearingNames, ...fallbackNames])).filter(Boolean);

          if (allNames.length > 0) {
            const isRelevant = (text: string) => allNames.some(name => text?.includes(name));

            if (blueprint.conflictArc && blueprint.conflictArc.nodes) {
              const relevantConflicts = blueprint.conflictArc.nodes.filter(n => isRelevant(n.antagonist) || isRelevant(n.conflict));
              if (relevantConflicts.length > 0) {
                conflictArcFiltered = relevantConflicts.map(n => `对手：${n.antagonist} | 冲突：${n.conflict} | 结果：${n.result}`).join('\n');
              }
            }

            if (blueprint.relationshipArc && blueprint.relationshipArc.nodes) {
              const relevantRels = blueprint.relationshipArc.nodes.filter(n => isRelevant(n.character) || isRelevant(n.change));
              if (relevantRels.length > 0) {
                relationshipArcFiltered = relevantRels.map(n => `角色：${n.character} | 身份：${n.identity} | 演变：${n.change}`).join('\n');
              }
            }
          }
        }

        const script = await generateEpisodeScript(
          keyToUse,
          {
            novelContent: relevantContent,
            outlineContent: outlineContent,
            previousScriptContext: prevScript,
            previousNovelTail: prevNovelTail,
            episodeId: episode.id,
            episodeTitle: episode.title,
            worldSetting: episode.draftWorldSetting,
            keyQuotes: episode.draftKeyQuotes,
            characters: episode.draftCharacters,
            characterList: episode.draftCharacterList,
            openingHook: episode.draftOpeningHook,
            endingHook: episode.draftEndingHook,
            endingClosure: episode.draftEndingClosure,
            foreshadowing: episode.draftForeshadowing,
            targetChapter: episode.draftTargetChapter || episode.targetChapter,
            targetWordCount: episode.targetWordCount,
            narrativeType: narrativeType,
            useNovelReference,
            viralTips: episode.viralTips,
            narratorInfo: narratorInfo || undefined,
            conflictArcFiltered: conflictArcFiltered || undefined,
            relationshipArcFiltered: relationshipArcFiltered || undefined
          },
          selectedModel,
          baseUrl,
          { signal }
        );

        return { relevantContent, script };
      });

      const latestEpisodes = [...episodesRef.current];
      const versionedEp = saveCurrentVersion({
        ...latestEpisodes[index],
        status: 'completed',
        generatedScript: script,
        lastVersionScript: null,
        usedSourceText: relevantContent,
        chatHistory: [] 
      }, "Generated from Outline", 'ai');

      latestEpisodes[index] = versionedEp;
      
      onEpisodesUpdate(latestEpisodes);
      setGeneratedCount(prev => prev + 1);

    } catch (error: any) {
      console.error(error);
      if (error.name === 'AbortError' || error.message?.includes('取消')) {
        // 当用户主动取消生成时，不再覆盖状态为 error
        return;
      }
      const errorEpisodes = [...episodesRef.current];
      errorEpisodes[index] = { ...errorEpisodes[index], status: 'error' };
      onEpisodesUpdate(errorEpisodes);
    }
  };

  // --- Handlers ---

  const handleManualScriptChange = (newText: string) => {
    const updatedEpisodes = [...episodes];
    updatedEpisodes[currentEpisodeIndex] = {
      ...updatedEpisodes[currentEpisodeIndex],
      generatedScript: newText
    };
    onEpisodesUpdate(updatedEpisodes);
  };

  const handleTextSelect = () => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== end) {
        const text = textareaRef.current.value.substring(start, end);
        if (text.trim().length > 0) {
          setSelectedText(text);
        }
      }
    }
  };

  type DraftField = 'draftOutline' | 'draftNovelContent' | 'draftWorldSetting' | 'draftKeyQuotes' | 'draftCharacters' | 'draftOpeningHook' | 'viralTips' | 'draftForeshadowing' | 'draftTargetChapter';

  const handleDraftChange = (field: DraftField, value: string) => {
    const updatedEpisodes = [...episodes];
    updatedEpisodes[currentEpisodeIndex] = {
      ...updatedEpisodes[currentEpisodeIndex],
      [field]: value
    };
    onEpisodesUpdate(updatedEpisodes);
  };

  // --- Character List Handlers ---
  const openCharModal = (char?: CharacterProfile) => {
    if (char) {
        setEditingCharId(char.id);
        setTempCharData({ name: char.name, desc: char.desc });
    } else {
        setEditingCharId(null);
        setTempCharData({ name: '', desc: '' });
    }
    setIsCharModalOpen(true);
  };

  const saveCharacter = () => {
    const currentEp = episodes[currentEpisodeIndex];
    let newList = [...(currentEp.draftCharacterList || [])];
    
    if (editingCharId) {
        newList = newList.map(c => c.id === editingCharId ? { ...c, ...tempCharData } : c);
    } else {
        newList.push({ id: Date.now().toString(), ...tempCharData });
    }
    
    const updatedEpisodes = [...episodes];
    updatedEpisodes[currentEpisodeIndex] = {
        ...updatedEpisodes[currentEpisodeIndex],
        draftCharacterList: newList
    };
    onEpisodesUpdate(updatedEpisodes);
    setIsCharModalOpen(false);
  };

  const deleteCharacter = (id: string) => {
      setModalState({
        isOpen: true,
        type: 'confirm',
        title: '删除人物',
        message: '确定删除这个人物吗？',
        onConfirm: () => {
          const currentEp = episodes[currentEpisodeIndex];
          const newList = (currentEp.draftCharacterList || []).filter(c => c.id !== id);
          const updatedEpisodes = [...episodes];
          updatedEpisodes[currentEpisodeIndex] = {
            ...updatedEpisodes[currentEpisodeIndex],
            draftCharacterList: newList
          };
          onEpisodesUpdate(updatedEpisodes);
          setIsCharModalOpen(false);
          closeModal();
        }
      });
  };

  // --- Episode Management Handlers ---
  const handleAddEpisode = () => {
    const newId = episodes.length + 1;
    const newEpisode: Episode = {
      id: newId,
      title: `第${newId}集`,
      content: "",
      targetChapter: "",
      generatedScript: null,
      chatHistory: [],
      status: 'pending',
      targetWordCount: 800
    };
    onEpisodesUpdate([...episodes, newEpisode]);
  };

  const handleDeleteEpisode = (index: number) => {
    if (episodes.length <= 1) return;
    setModalState({
      isOpen: true,
      type: 'confirm',
      title: '删除集数',
      message: `确定删除第 ${episodes[index].id} 集吗？`,
      onConfirm: () => {
        const newEpisodes = episodes.filter((_, i) => i !== index);
        // 重新编号
        const renumbered = newEpisodes.map((ep, i) => ({
          ...ep,
          id: i + 1,
          title: ep.title.replace(/第\d+集/, `第${i + 1}集`)
        }));
        onEpisodesUpdate(renumbered);
        // 调整当前选中的集数
        if (currentEpisodeIndex >= renumbered.length) {
          setCurrentEpisodeIndex(renumbered.length - 1);
        }
        closeModal();
      }
    });
  };

  const cancelAnalysis = (idx: number) => {
    const newEps = [...episodes];
    newEps[idx] = {
        ...newEps[idx],
        isAnalyzing: false,
        draftOutline: newEps[idx].draftOutline || newEps[idx].content,
        draftNovelContent: newEps[idx].draftNovelContent || getRelevantChapterContent(chapters, newEps[idx].targetChapter) // FIXED: Pass chapters
    };
    onEpisodesUpdate(newEps);
  };

  const handleRetryAnalysis = async (idx: number) => {
    const ep = episodes[idx];
    const tempEps = [...episodes];
    tempEps[idx] = { ...ep, isAnalyzing: true };
    onEpisodesUpdate(tempEps);

    try {
        const key = apiKey || import.meta.env.VITE_API_KEY || '';
        const relevantContent = getRelevantChapterContent(chapters, ep.targetChapter); // FIXED: Pass chapters
        const result = await parseOutlineWithAI(key, ep.content, baseUrl);
        
        const currentEps = [...episodesRef.current];
        currentEps[idx] = {
             ...currentEps[idx],
             draftOutline: result.mainPlot,
             draftCharacterList: result.characterList,
             draftOpeningHook: result.openingHook,
             draftForeshadowing: result.foreshadowing,
             // REMOVED: draftTone
             draftKeyQuotes: result.keyQuotes,
             draftWorldSetting: result.worldSetting,
             draftTargetChapter: result.targetChapter || ep.targetChapter,
             draftNovelContent: relevantContent,
             isAnalyzing: false
        };
        onEpisodesUpdate(currentEps);
    } catch (e) {
        console.error(e);
        const currentEps = [...episodesRef.current];
        currentEps[idx] = { ...currentEps[idx], isAnalyzing: false };
        onEpisodesUpdate(currentEps);
        alert("重新分析失败，请手动填写。");
    }
  };

  // --- Audit Logic ---
  const handleRunAudit = async () => {
    const keyToUse = apiKey || import.meta.env.VITE_API_KEY || '';
    const currentEp = episodes[currentEpisodeIndex];
    
    const prevEp = currentEpisodeIndex > 0 ? episodes[currentEpisodeIndex - 1] : null;
    const previousScript = prevEp?.generatedScript || "";
    
    const tempEps = [...episodes];
    tempEps[currentEpisodeIndex] = { ...currentEp, isAuditing: true };
    onEpisodesUpdate(tempEps);

    try {
        const auditConfig: ScriptGenerationConfig = {
            novelContent: currentEp.draftNovelContent || getRelevantChapterContent(chapters, currentEp.targetChapter), // FIXED: Pass chapters
            outlineContent: currentEp.draftOutline || currentEp.content,
            previousScriptContext: previousScript,
            episodeId: currentEp.id,
            episodeTitle: currentEp.title,
            worldSetting: currentEp.draftWorldSetting,
            // REMOVED: tone
            keyQuotes: currentEp.draftKeyQuotes,
            characterList: currentEp.draftCharacterList,
            openingHook: currentEp.draftOpeningHook,
            endingHook: currentEp.draftEndingHook,
            endingClosure: currentEp.draftEndingClosure,
            foreshadowing: currentEp.draftForeshadowing,
            targetChapter: currentEp.draftTargetChapter || currentEp.targetChapter
        };

        const auditItems = await auditScript(
            keyToUse,
            currentEp.generatedScript || "",
            auditConfig,
            auditModel,
            baseUrl
        );

        const finalEps = [...episodes];
        finalEps[currentEpisodeIndex] = { 
            ...finalEps[currentEpisodeIndex], 
            auditItems: auditItems,
            isAuditing: false
        };
        onEpisodesUpdate(finalEps);
    } catch (e) {
        console.error("Audit failed", e);
        const finalEps = [...episodes];
        finalEps[currentEpisodeIndex] = { ...finalEps[currentEpisodeIndex], isAuditing: false };
        onEpisodesUpdate(finalEps);
        alert("审稿失败，请检查网络或 Key。");
    }
  };

  const handleApplyAudit = async (item: AuditItem) => {
    if (isChatProcessing) return;

    setSidePanelTab('chat');
    const fixInstruction = `【主编修改指令】\n针对问题：${item.issue}\n具体要求：${item.suggestion}\n\n请修改剧本。`;
    const userMsg: ChatMessage = { 
        role: 'user', 
        text: `应用主编审稿意见：${item.suggestion}`, 
        timestamp: Date.now(),
        quotedText: item.targetQuote
    };

    const currentEp = episodes[currentEpisodeIndex];
    let tempEp = saveCurrentVersion(currentEp, `Before Audit Fix: ${item.category}`, 'auto');
    
    const tempEpisodes = [...episodes];
    tempEpisodes[currentEpisodeIndex] = tempEp;
    tempEpisodes[currentEpisodeIndex].chatHistory = [...(tempEp.chatHistory || []), userMsg];
    if (tempEpisodes[currentEpisodeIndex].auditItems) {
        tempEpisodes[currentEpisodeIndex].auditItems = tempEpisodes[currentEpisodeIndex].auditItems?.map(
            it => it.id === item.id ? { ...it, status: 'applied' } : it
        );
    }
    onEpisodesUpdate(tempEpisodes);

    try {
        const keyToUse = apiKey || import.meta.env.VITE_API_KEY || '';
        const result = await refineTask.runTask(async ({ log }) => {
            log(`应用审稿意见：${item.category}`);
            return refineScript(
                keyToUse,
                currentEp.generatedScript || "",
                fixInstruction,
                tempEpisodes[currentEpisodeIndex].chatHistory,
                selectedModel,
                baseUrl,
                item.targetQuote,
                narrativeType
            );
        });

        const finalEpisodes = [...episodes];
        if (result.newScript) {
             finalEpisodes[currentEpisodeIndex].lastVersionScript = currentEp.generatedScript;
             finalEpisodes[currentEpisodeIndex].generatedScript = result.newScript;
             finalEpisodes[currentEpisodeIndex] = saveCurrentVersion(finalEpisodes[currentEpisodeIndex], `Audit Fix: ${item.category}`, 'ai');
             setViewMode('diff');
        }

        const aiMsg: ChatMessage = { role: 'model', text: result.textResponse, timestamp: Date.now() };
        finalEpisodes[currentEpisodeIndex].chatHistory.push(aiMsg);
        onEpisodesUpdate(finalEpisodes);
    } catch (e) {
        console.error(e);
        const errEps = [...episodes];
        if (errEps[currentEpisodeIndex].auditItems) {
            errEps[currentEpisodeIndex].auditItems = errEps[currentEpisodeIndex].auditItems?.map(
                it => it.id === item.id ? { ...it, status: 'pending' } : it
            );
        }
        onEpisodesUpdate(errEps);
        alert("应用修改失败，请重试");
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isChatProcessing) return;

    const keyToUse = apiKey || import.meta.env.VITE_API_KEY || '';
    const currentEp = episodes[currentEpisodeIndex];
    const currentScript = currentEp.generatedScript || "";

    const userMsg: ChatMessage = { 
      role: 'user', 
      text: chatInput, 
      timestamp: Date.now(),
      quotedText: selectedText || undefined
    };
    
    let tempEp = saveCurrentVersion(currentEp, "Pre-chat Edit", 'auto');
    
    const tempEpisodes = [...episodes];
    tempEpisodes[currentEpisodeIndex] = tempEp;
    tempEpisodes[currentEpisodeIndex].chatHistory = [...(tempEp.chatHistory || []), userMsg];
    onEpisodesUpdate(tempEpisodes);
    
    setChatInput("");
    try {
      const result = await refineTask.runTask(async ({ log }) => {
        log(`处理第 ${currentEp.id} 集创作对话`);
        return refineScript(
          keyToUse,
          currentScript,
          userMsg.text,
          tempEpisodes[currentEpisodeIndex].chatHistory,
          selectedModel,
          baseUrl,
          selectedText || undefined,
          narrativeType
        );
      });

      const finalEpisodes = [...episodes];
      if (result.newScript) {
        finalEpisodes[currentEpisodeIndex].lastVersionScript = currentScript; 
        finalEpisodes[currentEpisodeIndex].generatedScript = result.newScript;
        
        finalEpisodes[currentEpisodeIndex] = saveCurrentVersion(finalEpisodes[currentEpisodeIndex], "AI Assistant Edit", 'ai');
        
        setViewMode('diff');
      }
      const aiMsg: ChatMessage = { role: 'model', text: result.textResponse, timestamp: Date.now() };
      finalEpisodes[currentEpisodeIndex].chatHistory.push(aiMsg);
      onEpisodesUpdate(finalEpisodes);
      setSelectedText(null); 

    } catch (error) {
      console.error(error);
      const errorEpisodes = [...episodes];
      const errorMsg: ChatMessage = { role: 'model', text: "抱歉，处理您的请求时出现错误，请重试。", timestamp: Date.now() };
      errorEpisodes[currentEpisodeIndex].chatHistory.push(errorMsg);
      onEpisodesUpdate(errorEpisodes);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  const handleGenerateNext = () => {
    generateEpisode(currentEpisodeIndex);
  };

  const toggleAutoGenerate = () => {
    setIsAutoGenerating(prev => !prev);
  };

  const revertToLastVersion = () => {
    if (!episodes[currentEpisodeIndex].lastVersionScript) return;
    setModalState({
      isOpen: true,
      type: 'confirm',
      title: '撤销到上一版本',
      message: '确定要撤销到上一个版本吗？当前修改将丢失。',
      onConfirm: () => {
        const updatedEpisodes = [...episodes];
        updatedEpisodes[currentEpisodeIndex] = {
          ...updatedEpisodes[currentEpisodeIndex],
          generatedScript: updatedEpisodes[currentEpisodeIndex].lastVersionScript!,
          lastVersionScript: null
        };
        onEpisodesUpdate(updatedEpisodes);
        setViewMode('edit');
        closeModal();
      }
    });
  };

  const downloadAll = () => {
    const projectTitle = (novelName || "未命名项目").trim() || "未命名项目";
    const safeProjectTitle = projectTitle.replace(/[\\/:*?"<>|]/g, '_');
    const allText = [
      `《${projectTitle}》完整剧本`,
      ...episodes
        .filter(e => e.generatedScript)
        .map(e => {
          const separator = "=".repeat(60);
          return `${separator}\n${e.title}\n${separator}\n\n${e.generatedScript}`;
        })
    ]
      .join("\n\n\n");

    const blob = new Blob([allText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeProjectTitle}_完整剧本.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearAllScripts = () => {
    const generatedScriptCount = episodes.filter(ep => ep.generatedScript || ep.lastVersionScript).length;
    if (generatedScriptCount === 0 && !isGenerating && !isAutoGenerating) return;

    setModalState({
      isOpen: true,
      type: 'confirm',
      title: '清空全文',
      message: `确认清空全部${generatedScriptCount ? ` ${generatedScriptCount} ` : ''}集的剧本正文吗？\n如果正在生成，这会终止当前的生成进程，并保留集纲、章节映射和人物信息。`,
      onConfirm: () => {
        if (isGenerating || isAutoGenerating) {
          generationTask.cancel();
          setIsAutoGenerating(false);
        }

        const clearedEpisodes = episodes.map(ep => ({
          ...ep,
          generatedScript: null,
          scriptVersions: [],
          lastVersionScript: null,
          usedSourceText: undefined,
          chatHistory: [],
          auditItems: [],
          auditReport: null,
          status: (ep.status === 'generating' || ep.status === 'error' || ep.status === 'completed') ? 'pending' : ep.status,
          isAuditing: false,
        }));

        // @ts-ignore
        onEpisodesUpdate(clearedEpisodes);
        setPreviewVersion(null);
        setViewMode('edit');
        setShowHistoryDropdown(false);
        setSidePanelTab('chat');
        closeModal();
      }
    });
  };

  const hasGeneratedScripts = episodes.some(ep => ep.generatedScript || ep.lastVersionScript);

  const currentEpisode = episodes[currentEpisodeIndex];
  const progressPercent = Math.round(((currentEpisodeIndex + (currentEpisode.status === 'completed' ? 1 : 0)) / episodes.length) * 100);
  const sourcePreviewContent = currentEpisode.usedSourceText || getRelevantChapterContent(chapters, currentEpisode.targetChapter); // FIXED: Pass chapters
  const isAnalyzing = currentEpisode.isAnalyzing;
  const isAuditing = currentEpisode.isAuditing;

  // --- Diff Rendering Logic ---
  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <CapacityErrorModal />
      <GeneralModal state={modalState} onClose={closeModal} />
      
      <CharacterModal 
          isOpen={isCharModalOpen} 
          editingId={editingCharId} 
          tempData={tempCharData} 
          setTempData={setTempCharData} 
          onClose={() => setIsCharModalOpen(false)} 
          onSave={saveCharacter} 
          onDelete={deleteCharacter} 
      />

      {/* Sidebar: Episode Track */}
      <div className="w-20 lg:w-72 shrink-0 bg-white border-r border-gray-100 flex flex-col shadow-soft z-30 transition-all duration-300">
        <div className="p-4 border-b border-gray-50 bg-paper-dark/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onGoBack}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
              title="返回上一步"
            >
              <ArrowRight className="w-4 h-4 rotate-180"/>
            </button>
            <button
              onClick={onNewProject}
              className="w-8 h-8 rounded-lg bg-blue-100 hover:bg-blue-200 flex items-center justify-center text-blue-600 transition-colors"
              title="新建项目"
            >
              <Sparkles className="w-4 h-4"/>
            </button>
            <h2 className="font-extrabold text-lg text-gray-700 hidden lg:block">故事线</h2>
          </div>
          <div className="flex items-center gap-1">
             <button
               onClick={handleAddEpisode}
               className="w-6 h-6 rounded-lg bg-accent/10 hover:bg-accent/20 flex items-center justify-center text-accent transition-colors"
               title="添加新集"
             >
               <Plus className="w-4 h-4"/>
             </button>
             <div className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{progressPercent}%</div>
          </div>
        </div>

        {/* 剧本类型选择器 */}
        <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="text-xs font-bold text-gray-600 mb-2 hidden lg:block">剧本类型</div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                console.log('🔄 切换到第三人称模式');
                setNarrativeType('third-person');
                if (episodes.some(e => e.status === 'completed')) {
                  alert('已切换到第三人称模式。请重新生成剧本以应用新的风格。');
                }
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                narrativeType === 'third-person'
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
              title="第三人称演绎剧本"
            >
              <span className="hidden lg:inline">第三人称</span>
              <span className="lg:hidden">3rd</span>
            </button>
            <button
              onClick={() => {
                console.log('🔄 切换到第一人称模式');
                setNarrativeType('first-person');
                if (episodes.some(e => e.status === 'completed')) {
                  alert('已切换到第一人称模式。请重新生成剧本以应用新的风格。');
                }
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                narrativeType === 'first-person'
                  ? 'bg-accent text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
              title="第一人称解说剧本"
            >
              <span className="hidden lg:inline">第一人称</span>
              <span className="lg:hidden">1st</span>
            </button>
          </div>
          <div className="text-[10px] text-gray-500 mt-1 hidden lg:block text-center">
            {narrativeType === 'third-person' ? '演绎剧本（场景+对话）' : '解说文案（口播稿）'}
          </div>

          {/* 第一人称叙述者设置 */}
          {narrativeType === 'first-person' && (
            <div className="mt-2">
              {!isEditingNarrator ? (
                // 显示模式
                <div className="px-2 py-1.5 bg-blue-100 rounded-lg text-[10px] text-blue-800">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 flex-1">
                      <User className="w-3 h-3" />
                      <span className="font-bold">叙述者:</span>
                      {narratorInfo ? (
                        <span>{narratorInfo.name}</span>
                      ) : (
                        <span className="text-blue-600">未设置</span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setNarratorEditName(narratorInfo?.name || '');
                        setNarratorEditIdentity(narratorInfo?.identity || '主角');
                        setIsEditingNarrator(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                      title="修改叙述者"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  {narratorInfo && (
                    <div className="text-[9px] text-blue-600 mt-0.5">
                      {narratorInfo.identity} · 全系列固定视角
                    </div>
                  )}
                </div>
              ) : (
                // 编辑模式
                <div className="px-2 py-2 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-[10px] font-bold text-blue-800 mb-1.5">设置叙述者</div>
                  <input
                    type="text"
                    placeholder="角色名（如：林婉儿）"
                    value={narratorEditName}
                    onChange={(e) => setNarratorEditName(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] rounded border border-blue-200 mb-1.5 focus:ring-1 focus:ring-blue-400 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="身份（如：女主角）"
                    value={narratorEditIdentity}
                    onChange={(e) => setNarratorEditIdentity(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] rounded border border-blue-200 mb-1.5 focus:ring-1 focus:ring-blue-400 outline-none"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        if (narratorEditName.trim()) {
                          setCustomNarrator({
                            name: narratorEditName.trim(),
                            identity: narratorEditIdentity.trim() || '主角'
                          });
                          setIsEditingNarrator(false);
                          alert(`✅ 已设置叙述者：${narratorEditName.trim()}\n后续所有集数将使用此视角`);
                        } else {
                          alert('请输入角色名');
                        }
                      }}
                      className="flex-1 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      确定
                    </button>
                    <button
                      onClick={() => setIsEditingNarrator(false)}
                      className="flex-1 py-1 text-[10px] bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 原文参考开关 */}
        <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-cyan-50">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-700">参考小说正文</div>
              <div className="text-[10px] text-gray-500 mt-1">
                开启后会参考章节原文提炼台词、细节与衔接；关闭后仅依据集纲与设定生成。
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextValue = !useNovelReference;
                setUseNovelReference(nextValue);
                if (episodes.some(e => e.status === 'completed')) {
                  alert(`已${nextValue ? '开启' : '关闭'}小说正文参考。请重新生成相关集数以应用新设置。`);
                }
              }}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                useNovelReference ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
              title={useNovelReference ? '已开启小说正文参考' : '已关闭小说正文参考'}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  useNovelReference ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 全局字数设置 */}
        <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-yellow-50">
          <div className="text-xs font-bold text-gray-600 mb-2 hidden lg:block">目标字数</div>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              placeholder="800"
              className="flex-1 px-3 py-2 rounded-xl text-xs border border-gray-200 focus:ring-2 focus:ring-primary/20 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = parseInt((e.target as HTMLInputElement).value);
                  if (value && value > 0) {
                    const updatedEpisodes = episodes.map(ep => ({
                      ...ep,
                      targetWordCount: value
                    }));
                    onEpisodesUpdate(updatedEpisodes);
                    alert(`已将所有集的目标字数设置为 ${value} 字`);
                    (e.target as HTMLInputElement).value = '';
                  }
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.querySelector('input[type="number"]') as HTMLInputElement;
                const value = parseInt(input?.value || '800');
                if (value && value > 0) {
                  const updatedEpisodes = episodes.map(ep => ({
                    ...ep,
                    targetWordCount: value
                  }));
                  onEpisodesUpdate(updatedEpisodes);
                  alert(`已将所有集的目标字数设置为 ${value} 字`);
                  if (input) input.value = '';
                }
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-sm"
              title="应用到所有集"
            >
              <span className="hidden lg:inline">应用</span>
              <span className="lg:hidden">✓</span>
            </button>
          </div>
          <div className="text-[10px] text-gray-500 mt-1 hidden lg:block">
            输入字数后按回车或点击应用
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {episodes.map((ep, idx) => (
            <div
              key={ep.id}
              onClick={() => setCurrentEpisodeIndex(idx)}
              className={`group relative p-3 rounded-2xl cursor-pointer transition-all border-2 flex items-center gap-3 ${
                idx === currentEpisodeIndex
                  ? 'bg-primary/5 border-primary shadow-sm'
                  : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs shadow-sm transition-colors ${
                 idx === currentEpisodeIndex ? 'bg-primary text-white' :
                 ep.status === 'completed' ? 'bg-green-100 text-green-600' :
                 'bg-gray-100 text-gray-400'
              }`}>
                 {ep.status === 'generating' ? <RefreshCw className="w-4 h-4 animate-spin"/> :
                  ep.status === 'pending' && ep.isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin"/> :
                  ep.id}
              </div>
              <div className="hidden lg:block min-w-0 flex-1">
                  <div className={`font-bold text-sm truncate ${idx === currentEpisodeIndex ? 'text-primary' : 'text-gray-700'}`}>
                    第 {ep.id} 集
                  </div>
                  <p className="text-xs text-gray-400 truncate max-w-[140px]">
                     {ep.title.replace(/^第\d+集[:：]\s*/, '')}
                  </p>
              </div>
              {/* Delete button - only show for pending episodes */}
              {ep.status === 'pending' && episodes.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteEpisode(idx); }}
                  className="hidden lg:flex w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 items-center justify-center text-red-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                  title="删除此集"
                >
                  <Trash2 className="w-3 h-3"/>
                </button>
              )}
              {/* Status Dot for mobile/collapsed */}
              {ep.status === 'completed' && <div className="lg:hidden absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></div>}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-100 space-y-2">
          {/* 进入审稿按钮 - 当有已完成的剧本时显示 */}
          {onGoToAudit && episodes.some(e => e.status === 'completed') && (
            <button
              onClick={onGoToAudit}
              className="w-full flex items-center justify-center gap-2 bg-accent text-white py-3 rounded-2xl hover:bg-teal-600 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              title="进入审稿"
            >
              <ScanEye className="w-5 h-5" /> <span className="hidden lg:inline font-bold">进入审稿</span>
            </button>
          )}
          <button
            onClick={downloadAll}
            className="w-full flex items-center justify-center gap-2 bg-gray-800 text-white py-3 rounded-2xl hover:bg-black transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            title="导出全部"
          >
            <Download className="w-5 h-5" /> <span className="hidden lg:inline font-bold">导出剧本</span>
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col bg-paper h-screen overflow-hidden relative">
        {/* Header */}
        <div className="h-16 shrink-0 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 z-20">
           <div className="flex items-center gap-4 flex-1 min-w-0">
             <h3 className="font-extrabold text-xl text-gray-800 truncate tracking-tight">
               {currentEpisode.title}
             </h3>
             <div className="hidden md:flex items-center gap-2 bg-soft-blue px-3 py-1.5 rounded-full text-xs text-blue-700 font-medium border border-blue-100">
                <Settings className="w-3 h-3" />
                <select 
                  value={selectedModel} 
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-transparent border-none outline-none cursor-pointer min-w-[100px]"
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
             </div>
           </div>

           <div className="flex gap-3 shrink-0 items-center">
             <button
                onClick={toggleAutoGenerate}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold shadow-sm transition-all border-2 ${
                  isAutoGenerating 
                    ? 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200' 
                    : 'bg-white text-gray-500 border-gray-200 hover:border-primary hover:text-primary'
                }`}
             >
                {isAutoGenerating ? (
                  <>
                    <PauseCircle className="w-4 h-4 animate-pulse" /> 暂停
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" /> 自动生成
                  </>
                )}
             </button>

             <button
               onClick={handleClearAllScripts}
               disabled={isAnalyzing || (!hasGeneratedScripts && !isGenerating && !isAutoGenerating)}
               className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:hover:bg-red-50"
               title="清空全部剧本正文，如果在生成中可以随时打断！"
             >
               <Trash2 className="w-4 h-4" /> 清空全文
             </button>

             <div className="h-6 w-px bg-gray-200 mx-2"></div>

             {/* Modify Outline Button for Completed Episodes */}
             {currentEpisode.status === 'completed' && !isEditingOutline && (
               <button 
                 onClick={() => setIsEditingOutline(true)}
                 className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
               >
                 <LayoutTemplate className="w-4 h-4" />
                 调整大纲
               </button>
             )}

             {/* Side Panel Toggle Button */}
             {currentEpisode.status === 'completed' && !isEditingOutline && (
                <button 
                  onClick={() => setShowSidePanel(!showSidePanel)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all border-2 ${
                    showSidePanel ? 'bg-soft-blue border-blue-200 text-blue-700' : 'bg-white border-transparent text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {showSidePanel ? <ArrowRight className="w-4 h-4" /> : <ListChecks className="w-4 h-4" />}
                  {showSidePanel ? '收起面板' : '辅助面板'}
                </button>
             )}
             
             {/* Action Buttons for Pending/Next */}
             {(currentEpisode.status === 'pending' || currentEpisode.status === 'error') && (
                   <button 
                    onClick={handleGenerateNext}
                    disabled={isGenerating || isAutoGenerating || isAnalyzing}
                    className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-full font-bold shadow-float hover:bg-primary-hover hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
                  >
                    {isGenerating ? '生成中...' : (isAnalyzing ? '分析中...' : '开始生成')} 
                    {!isAnalyzing && <Play className="w-4 h-4 fill-current" />}
                  </button>
             )}

              {currentEpisode.status === 'completed' && !isEditingOutline && currentEpisodeIndex < episodes.length - 1 && episodes[currentEpisodeIndex+1].status === 'pending' && (
                  <button 
                    onClick={() => setCurrentEpisodeIndex(currentEpisodeIndex + 1)}
                    disabled={isAutoGenerating}
                    className="flex items-center gap-2 bg-accent text-white px-6 py-2.5 rounded-full font-bold shadow-lg hover:bg-teal-600 transition-all disabled:opacity-50"
                  >
                    下一集 <ArrowRight className="w-4 h-4" />
                  </button>
              )}
           </div>
        </div>

        {/* Workspace: Split View */}
        <div className="flex-1 flex overflow-hidden p-4 gap-4">
          
          {/* Main Content Area */}
          <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 rounded-3xl overflow-hidden shadow-card border border-white ${showSidePanel && currentEpisode.status === 'completed' && !isEditingOutline ? 'mr-0' : ''}`}>
            
              
              {currentEpisode.status === 'pending' || currentEpisode.status === 'error' || isEditingOutline ? (
                // --- PRE-GENERATION / EDIT OUTLINE VIEW (Updated Layout) ---
                 <div className="flex-1 overflow-y-auto bg-paper-dark/20 p-8">
                    <div className="max-w-7xl mx-auto pb-20">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-extrabold text-gray-800 mb-2 tracking-tight">
                                {isEditingOutline ? `调整第 ${currentEpisode.id} 集构思` : `第 ${currentEpisode.id} 集创作工坊`}
                            </h2>
                            <div className="flex items-center justify-center gap-2 text-gray-500 font-medium">
                                {isAnalyzing ? (
                                    <span className="flex items-center gap-2 text-primary animate-pulse"><Sparkle className="w-5 h-5 animate-spin"/> AI 正在拆解大纲，请稍候...</span>
                                ) : (
                                    isEditingOutline ? "调整下方的卡片内容，重新生成剧本。" : "AI 已为您预填大纲，确认无误即可生成。"
                                )}
                                {isAnalyzing && (
                                    <button onClick={() => cancelAnalysis(currentEpisodeIndex)} className="text-sm underline text-red-400 hover:text-red-500 ml-2">手动填写</button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Left Column (8): Plot, Hooks, Characters, Details */}
                            <div className="lg:col-span-8 flex flex-col gap-6">
                                {/* Core Plot Card */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                                    <div className="absolute top-0 left-0 w-2 h-full bg-primary/20 group-hover:bg-primary transition-colors"></div>
                                    <div className="flex justify-between items-center mb-4 pl-4">
                                        <h3 className="font-bold text-lg text-gray-700 flex items-center gap-2"><Layers className="w-5 h-5 text-primary"/> 核心剧情</h3>
                                        <div className="flex items-center gap-3">
                                            {/* Target Word Count Setting */}
                                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full">
                                                <span className="text-xs text-gray-500">目标字数</span>
                                                <input
                                                    type="number"
                                                    value={currentEpisode.targetWordCount || 800}
                                                    onChange={(e) => {
                                                        const updatedEpisodes = [...episodes];
                                                        updatedEpisodes[currentEpisodeIndex] = {
                                                            ...updatedEpisodes[currentEpisodeIndex],
                                                            targetWordCount: parseInt(e.target.value) || 800
                                                        };
                                                        onEpisodesUpdate(updatedEpisodes);
                                                    }}
                                                    className="w-16 px-2 py-1 bg-white border border-gray-200 rounded text-center text-xs font-bold"
                                                    min={200}
                                                    max={5000}
                                                    step={100}
                                                />
                                                <span className="text-xs text-gray-400">字</span>
                                            </div>
                                            {!isAnalyzing && (
                                                <button onClick={() => handleRetryAnalysis(currentEpisodeIndex)} className="text-xs text-primary bg-primary/5 px-3 py-1.5 rounded-full hover:bg-primary hover:text-white transition-colors flex items-center gap-1 font-bold">
                                                    <RefreshCw className="w-3 h-3" /> AI 重析
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {isAnalyzing ? <div className="h-40 bg-gray-100 rounded-xl animate-pulse"></div> : (
                                        <textarea
                                            className="w-full h-40 p-4 bg-gray-50 border-none rounded-2xl resize-none focus:ring-2 focus:ring-primary/20 text-base leading-relaxed text-gray-700 placeholder-gray-400"
                                            value={currentEpisode.draftOutline || ""}
                                            onChange={(e) => handleDraftChange('draftOutline', e.target.value)}
                                            placeholder="这里是本集的故事骨架..."
                                        />
                                    )}
                                </div>

                                {/* Hooks & Tips Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {currentEpisodeIndex === 0 && (
                                        <div className="bg-soft-yellow/50 p-5 rounded-3xl border border-yellow-100 shadow-sm">
                                            <label className="text-xs font-bold text-amber-600 uppercase mb-2 block flex items-center gap-1"><Anchor className="w-3 h-3"/> 开篇钩子 (仅第一阶段)</label>
                                            <textarea rows={3} className="w-full bg-white/60 border-none rounded-xl text-sm p-3 focus:ring-2 focus:ring-amber-200 resize-none" 
                                                placeholder="如何开场即炸？"
                                                value={currentEpisode.draftOpeningHook || ""}
                                                onChange={(e) => handleDraftChange('draftOpeningHook', e.target.value)}
                                            />
                                        </div>
                                    )}
                                    <div className={`bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-3xl border border-indigo-100 shadow-sm ${currentEpisodeIndex === 0 ? '' : 'col-span-full'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-bold text-indigo-600 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3"/> 爆款创作技巧</label>
                                            <button 
                                                onClick={() => {
                                                    const tips = currentEpisode.viralTips;
                                                    if (!tips) return;
                                                    const updated = episodes.map(ep => ({...ep, viralTips: tips}));
                                                    onEpisodesUpdate(updated);
                                                    alert("已将该爆款技巧应用到所有集纲！");
                                                }}
                                                className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full font-bold hover:bg-indigo-200 transition-colors"
                                                title="一键应用此技巧到所有集纲"
                                            >
                                                一键应用全文
                                            </button>
                                        </div>
                                        <textarea rows={3} className="w-full bg-white/60 border-none rounded-xl text-sm p-3 focus:ring-2 focus:ring-indigo-200 resize-none" 
                                            placeholder="比如：重点突出情绪反差、加快打脸节奏..."
                                            value={currentEpisode.viralTips || ""}
                                            onChange={(e) => handleDraftChange('viralTips', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Character Wall (Refactored) */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="font-bold text-lg text-gray-700 flex items-center gap-2"><Users className="w-5 h-5 text-purple-500"/> 出场人物 & 人设</label>
                                        <button onClick={() => openCharModal()} className="text-xs bg-purple-50 text-purple-600 px-3 py-1.5 rounded-full font-bold hover:bg-purple-100 transition-colors flex items-center gap-1">
                                            <Plus className="w-3 h-3"/> 添加人物
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {/* Fallback for legacy string data if no structured data */}
                                        {(!currentEpisode.draftCharacterList || currentEpisode.draftCharacterList.length === 0) && currentEpisode.draftCharacters && (
                                            <div className="col-span-full p-3 bg-gray-50 rounded-xl text-sm text-gray-500 italic border border-dashed border-gray-200">
                                                自动提取: {currentEpisode.draftCharacters} (建议手动添加结构化人设以获得更好效果)
                                            </div>
                                        )}
                                        
                                        {currentEpisode.draftCharacterList?.map((char) => (
                                            <div 
                                                key={char.id}
                                                onClick={() => openCharModal(char)}
                                                className="group cursor-pointer p-3 bg-gray-50 border border-gray-100 rounded-2xl hover:bg-purple-50 hover:border-purple-100 transition-all flex items-start gap-3"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-lg shrink-0">
                                                    {char.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-gray-800 text-sm truncate">{char.name}</div>
                                                    <div className="text-xs text-gray-400 line-clamp-2 mt-0.5 leading-snug group-hover:text-purple-700/70">
                                                        {char.desc || "暂无人设描述"}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        <button 
                                            onClick={() => openCharModal()}
                                            className="p-3 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-500 hover:bg-purple-50/50 transition-all min-h-[80px]"
                                        >
                                            <Plus className="w-5 h-5 mb-1"/>
                                            <span className="text-xs font-bold">添加</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Details Grid - Removed Tone */}
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="bg-soft-purple/40 p-4 rounded-2xl border border-purple-100">
                                        <label className="text-xs font-bold text-purple-600 mb-2 block flex items-center gap-1"><Sparkles className="w-3 h-3"/> 关键台词</label>
                                        <input type="text" className="w-full bg-white/60 border-none rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-purple-200 outline-none" 
                                            placeholder="一定要说的那句话..."
                                            value={currentEpisode.draftKeyQuotes || ""}
                                            onChange={(e) => handleDraftChange('draftKeyQuotes', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Right Column (4): Reference Material (Merged) */}
                            <div className="lg:col-span-4 flex flex-col gap-6">
                                {/* Combined Source Card */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col h-full min-h-[500px]">
                                    <div className="flex items-center gap-2 mb-4 text-gray-700 font-bold border-b border-gray-50 pb-2">
                                        <BookOpen className="w-5 h-5 text-accent"/> 原著参考 (Source Material)
                                    </div>
                                    
                                    <div className="mb-4">
                                        <label className="text-xs font-bold text-gray-400 mb-1.5 block">对应章节范围</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-accent/20 outline-none" 
                                                placeholder="例如：第5-6章"
                                                value={currentEpisode.draftTargetChapter || ""}
                                                onChange={(e) => handleDraftChange('draftTargetChapter', e.target.value)}
                                            />
                                            {/* Button to reload content based on chapter number */}
                                            {currentEpisode.draftTargetChapter && (
                                                <button 
                                                    onClick={() => handleDraftChange('draftNovelContent', getRelevantChapterContent(chapters, currentEpisode.draftTargetChapter || ""))}
                                                    className="absolute right-2 top-2 p-1.5 bg-white border border-gray-200 rounded-lg hover:text-accent hover:border-accent transition-colors"
                                                    title="重新提取原文"
                                                >
                                                    <RefreshCw className="w-3.5 h-3.5"/>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 flex flex-col">
                                         <label className="text-xs font-bold text-gray-400 mb-1.5 block flex items-center justify-between">
                                            <span>原文内容</span>
                                            <span className="font-normal text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500">AI 将基于此内容改编</span>
                                         </label>
                                         <textarea 
                                            className="flex-1 w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono text-gray-600 leading-relaxed resize-none focus:ring-2 focus:ring-accent/20 custom-scrollbar"
                                            placeholder="系统会自动根据章节号提取原文，您也可以手动粘贴补充..."
                                            value={currentEpisode.draftNovelContent || ""}
                                            onChange={(e) => handleDraftChange('draftNovelContent', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                                    <label className="text-xs font-bold text-gray-400 mb-2 block flex items-center gap-1"><Globe className="w-3 h-3"/> 世界观备注</label>
                                    <textarea rows={4} className="w-full bg-gray-50 border-none rounded-xl text-xs p-3 focus:ring-2 focus:ring-gray-200 resize-none" 
                                        placeholder="特殊设定..."
                                        value={currentEpisode.draftWorldSetting || ""}
                                        onChange={(e) => handleDraftChange('draftWorldSetting', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex justify-center mt-8 gap-4">
                            {isEditingOutline && (
                                <button onClick={() => setIsEditingOutline(false)} className="px-8 py-3 rounded-full bg-white border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition-colors">
                                    取消
                                </button>
                            )}
                            <button 
                                onClick={handleGenerateNext}
                                disabled={isGenerating || isAnalyzing}
                                className="px-12 py-3 rounded-full bg-primary text-white font-extrabold text-lg shadow-float hover:scale-105 hover:bg-primary-hover transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
                            >
                                {isGenerating ? "生成中..." : (isEditingOutline ? "保存并生成" : "开始生成")}
                                {!isGenerating && <Play className="w-5 h-5 fill-current"/>}
                            </button>
                        </div>
                    </div>
                 </div>
              ) : (
                // --- COMPLETED / GENERATING VIEW ---
                <div className="flex-1 flex flex-col h-full bg-white relative">
                   {/* Editor Toolbar (UNIFIED - Fixes Obstruction) */}
                   <div className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-gray-100 bg-gray-50/50">
                       <div className="flex items-center gap-3">
                          <button 
                            onClick={() => setShowSourcePreview(!showSourcePreview)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${showSourcePreview ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
                          >
                             <BookOpen className="w-3.5 h-3.5" />
                             {showSourcePreview ? '隐藏原文' : '参考原文'}
                          </button>
                          
                          {/* View Mode Switcher */}
                          {!previewVersion && currentEpisode.lastVersionScript && (
                              <div className="flex bg-gray-200/50 p-1 rounded-lg">
                                 <button 
                                   onClick={() => setViewMode('edit')}
                                   className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'edit' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                                 >
                                    编辑
                                 </button>
                                 <button 
                                   onClick={() => setViewMode('diff')}
                                   className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'diff' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                                 >
                                    对比
                                 </button>
                              </div>
                          )}
                       </div>

                       <div className="flex items-center gap-2">
                          {/* PREVIEW MODE CONTROLS - Integrated here */}
                          {previewVersion ? (
                             <div className="flex items-center gap-2 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 animate-in fade-in slide-in-from-top-1">
                                <span className="text-xs text-amber-700 font-bold flex items-center gap-1 px-1">
                                    <Eye className="w-3 h-3" /> 预览: {new Date(previewVersion.timestamp).toLocaleTimeString()}
                                </span>
                                <div className="h-4 w-px bg-amber-200"></div>
                                <button onClick={confirmRestoreVersion} className="px-3 py-1 bg-amber-500 text-white rounded text-xs font-bold hover:bg-amber-600 transition-colors">恢复此版</button>
                                <button onClick={() => setPreviewVersion(null)} className="px-3 py-1 bg-white border border-amber-200 text-amber-700 rounded text-xs font-bold hover:bg-amber-100 transition-colors">退出</button>
                             </div>
                          ) : (
                             // NORMAL CONTROLS
                             <>
                               {currentEpisode.status === 'completed' && (
                                   <button onClick={handleManualSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-colors">
                                       <Save className="w-3.5 h-3.5" /> 保存
                                   </button>
                               )}
                               
                               {/* History Dropdown */}
                               {(currentEpisode.scriptVersions && currentEpisode.scriptVersions.length > 0) ? (
                                <div className="relative z-50">
                                   <button 
                                     onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                                     className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showHistoryDropdown ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                   >
                                      <History className="w-3.5 h-3.5" /> 历史 ({currentEpisode.scriptVersions.length})
                                      <ChevronDown className="w-3 h-3" />
                                   </button>
                                   
                                   {showHistoryDropdown && (
                                     <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in zoom-in-95 origin-top-right">
                                       <div className="p-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400">选择版本进行预览</div>
                                       <div className="max-h-[300px] overflow-y-auto">
                                         {currentEpisode.scriptVersions.slice().reverse().map((ver) => (
                                           <button 
                                             key={ver.id}
                                             onClick={() => handlePreviewVersion(ver)}
                                             className="w-full text-left px-4 py-3 hover:bg-soft-blue transition-colors border-b border-gray-50 last:border-0 group"
                                           >
                                             <div className="flex items-center justify-between mb-1">
                                                 <span className="text-xs font-bold text-gray-700">{new Date(ver.timestamp).toLocaleTimeString()}</span>
                                                 <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                                     ver.type === 'manual' ? 'bg-green-100 text-green-700' : 
                                                     ver.type === 'ai' ? 'bg-primary/10 text-primary' : 
                                                     'bg-gray-100 text-gray-500'
                                                 }`}>
                                                     {ver.type === 'manual' ? '手动' : (ver.type === 'ai' ? 'AI生成' : '自动')}
                                                 </span>
                                             </div>
                                             <div className="text-xs text-gray-500 truncate group-hover:text-gray-700 flex items-center gap-1">
                                                {ver.type === 'manual' ? <User className="w-3 h-3"/> : <Bot className="w-3 h-3"/>}
                                                {ver.note}
                                             </div>
                                           </button>
                                         ))}
                                       </div>
                                     </div>
                                   )}
                                </div>
                               ) : null}
                               
                               {viewMode === 'diff' && (
                                   <button onClick={revertToLastVersion} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-1">
                                       <RotateCcw className="w-3.5 h-3.5" /> 撤销修改
                                   </button>
                               )}
                             </>
                          )}
                       </div>
                   </div>

                   <div className="flex-1 overflow-hidden relative flex flex-col">
                        {/* Source Preview Panel */}
                        {showSourcePreview && (
                            <div className="shrink-0 max-h-48 overflow-y-auto bg-soft-yellow/30 border-b border-yellow-100 p-4 text-xs text-gray-600 font-mono leading-relaxed">
                                <div className="font-bold text-amber-600 mb-2 flex items-center gap-1"><BookOpen className="w-3 h-3"/> 参考原文内容</div>
                                {sourcePreviewContent}
                            </div>
                        )}

                        {/* Text Editor Area */}
                        <div className="flex-1 overflow-y-auto relative bg-paper-dark/10">
                            <div className="max-w-3xl mx-auto min-h-full bg-white shadow-soft my-6 p-8 rounded-none md:rounded-lg">
                                {currentEpisode.status === 'generating' ? (
                                    <div className="space-y-4 animate-pulse">
                                        <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                                        <div className="h-4 bg-gray-100 rounded w-full"></div>
                                        <div className="h-4 bg-gray-100 rounded w-full"></div>
                                        <div className="h-4 bg-gray-100 rounded w-2/3"></div>
                                        <div className="flex items-center justify-center py-10 text-primary gap-2">
                                            <RefreshCw className="w-6 h-6 animate-spin" />
                                            <span className="font-bold">AI 正在疯狂码字中...</span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {viewMode === 'diff' && currentEpisode.lastVersionScript && !previewVersion ? (
                                            <DiffTextView
                                              oldText={currentEpisode.lastVersionScript}
                                              newText={currentEpisode.generatedScript || ""}
                                              containerClassName="whitespace-pre-wrap font-mono text-sm leading-relaxed p-4 bg-gray-50/50 rounded-lg"
                                            />
                                        ) : (
                                            <textarea 
                                                ref={textareaRef}
                                                value={previewVersion ? previewVersion.content : (currentEpisode.generatedScript || "")}
                                                onChange={(e) => !previewVersion && handleManualScriptChange(e.target.value)}
                                                onSelect={handleTextSelect}
                                                readOnly={!!previewVersion}
                                                className={`w-full h-full min-h-[60vh] border-none outline-none font-mono text-base text-gray-800 leading-loose resize-none bg-transparent ${previewVersion ? 'cursor-default text-gray-500 select-none' : ''}`}
                                                placeholder="等待生成..."
                                                spellCheck={false}
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                   </div>
                </div>
              )}
            
          </div>

          {/* Right: Side Panel (Chat / Audit) */}
          {currentEpisode.status === 'completed' && showSidePanel && !isEditingOutline && (
            <div className="w-[350px] shrink-0 bg-white rounded-3xl shadow-float flex flex-col border border-gray-100 overflow-hidden animate-in slide-in-from-right-4 duration-300">
               {/* Tab Switcher */}
               <div className="flex items-center border-b border-gray-100 bg-gray-50/50">
                  <button 
                     onClick={() => setSidePanelTab('chat')}
                     className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${sidePanelTab === 'chat' ? 'bg-white text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                  >
                     <MessageSquare className="w-4 h-4"/> 编剧助手
                  </button>
                  <div className="w-px h-6 bg-gray-200"></div>
                  <button 
                     onClick={() => setSidePanelTab('audit')}
                     className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors relative ${sidePanelTab === 'audit' ? 'bg-white text-accent border-b-2 border-accent' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                  >
                     <ListChecks className="w-4 h-4"/> 主编审稿
                     {currentEpisode.auditItems?.some(i => i.status === 'pending') && (
                        <span className="absolute top-2 right-6 w-2 h-2 bg-red-500 rounded-full"></span>
                     )}
                  </button>
                  <button onClick={() => setShowSidePanel(false)} className="px-3 text-gray-400 hover:text-gray-600">
                     <X className="w-4 h-4" />
                  </button>
               </div>
               
               {/* TAB 1: Chat Panel */}
               {sidePanelTab === 'chat' && (
                 <>
                   {/* Messages List */}
                   <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
                     {(!currentEpisode.chatHistory || currentEpisode.chatHistory.length === 0) && (
                       <div className="text-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
                         <p className="text-sm font-bold text-gray-600 mb-2">👋 嗨！我是你的 AI 助理</p>
                         <p className="text-xs text-gray-400 mb-4">选中剧本中的任意文字，我可以帮你重写、润色或添加细节。</p>
                         <div className="flex flex-wrap gap-2 justify-center">
                            <span className="text-[10px] bg-gray-100 px-2 py-1 rounded-full text-gray-500">把这句改得更有张力</span>
                            <span className="text-[10px] bg-gray-100 px-2 py-1 rounded-full text-gray-500">增加一段心理描写</span>
                         </div>
                       </div>
                     )}
                     {currentEpisode.chatHistory?.map((msg, i) => (
                       <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                          {msg.quotedText && (
                            <div className="max-w-[90%] mb-1 px-3 py-2 bg-yellow-50 border-l-2 border-yellow-400 text-xs text-gray-500 rounded-r-lg italic line-clamp-2 shadow-sm">
                               "{msg.quotedText}"
                            </div>
                          )}
                          <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                            msg.role === 'user' 
                              ? 'bg-primary text-white rounded-tr-none' 
                              : 'bg-white border border-gray-100 text-gray-700 rounded-tl-none'
                          }`}>
                            {msg.text}
                          </div>
                       </div>
                     ))}
                     {isChatProcessing && (
                       <div className="flex justify-start">
                         <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex gap-1 items-center">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></span>
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                         </div>
                       </div>
                     )}
                     <div ref={chatBottomRef} />
                   </div>

                   {/* Chat Input */}
                   <div className="p-4 bg-white border-t border-gray-50">
                     {selectedText && (
                       <div className="mb-2 p-2 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between animate-in slide-in-from-bottom-2">
                          <div className="flex items-center gap-2 overflow-hidden px-1">
                             <Quote className="w-3 h-3 text-primary shrink-0" />
                             <div className="text-xs text-primary font-medium truncate max-w-[200px]">
                                已选中: "{selectedText}"
                             </div>
                          </div>
                          <button onClick={() => setSelectedText(null)} className="text-gray-400 hover:text-red-500 p-1">
                             <X className="w-3 h-3" />
                          </button>
                       </div>
                     )}
                     <form onSubmit={handleChatSubmit} className="relative">
                       <textarea
                         ref={chatInputRef}
                         value={chatInput}
                         onChange={(e) => setChatInput(e.target.value)}
                         onKeyDown={handleKeyDown}
                         placeholder={selectedText ? "告诉 AI 怎么改..." : "输入指令..."}
                         disabled={isChatProcessing}
                         className="w-full pl-4 pr-12 py-3 bg-gray-100 border-transparent focus:bg-white focus:ring-2 focus:ring-primary/20 rounded-2xl text-sm transition-all outline-none resize-none placeholder-gray-400"
                         rows={1}
                         style={{ minHeight: '46px' }} 
                       />
                       <button 
                         type="submit"
                         disabled={!chatInput.trim() || isChatProcessing}
                         className="absolute right-2 top-1.5 p-2 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:opacity-50 disabled:bg-gray-300 transition-colors shadow-sm"
                       >
                         <Send className="w-4 h-4" />
                       </button>
                     </form>
                   </div>
                 </>
               )}

               {/* TAB 2: Audit Panel */}
               {sidePanelTab === 'audit' && (
                 <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30 relative">
                     {/* Loading State */}
                     {isAuditing && (
                        <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center text-accent">
                            <Loader2 className="w-8 h-8 animate-spin mb-2"/>
                            <span className="font-bold text-sm">主编正在审稿中...</span>
                        </div>
                     )}
                     
                     <div className="flex-1 overflow-y-auto p-4 space-y-4">
                         {/* Empty State / Start Button */}
                         {(!currentEpisode.auditItems || currentEpisode.auditItems.length === 0) && (
                             <div className="flex flex-col items-center justify-center py-10 text-center">
                                 <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mb-4 text-accent">
                                     <ScanEye className="w-8 h-8"/>
                                 </div>
                                 <h3 className="font-bold text-gray-700 mb-2">一键主编审稿</h3>
                                 <p className="text-xs text-gray-500 max-w-[240px] mb-6">
                                     AI 主编将从节奏、冲突、人设等维度对剧本进行毒舌点评，并提供修改建议。
                                 </p>
                                 <div className="mb-6 w-full max-w-[240px]">
                                     <div className="text-[10px] text-gray-400 font-bold mb-1 mr-auto text-left pl-1">审稿模型</div>
                                     <div className="flex bg-gray-50 rounded-xl border border-gray-200 px-3 py-1.5 items-center">
                                         <Settings className="w-3.5 h-3.5 text-gray-400 shrink-0 mr-2" />
                                         <select 
                                             value={auditModel} 
                                             onChange={(e) => setAuditModel(e.target.value)}
                                             className="bg-transparent text-xs font-bold text-gray-600 outline-none border-none cursor-pointer flex-1 w-full"
                                         >
                                             {AVAILABLE_MODELS.map(m => (
                                                 <option key={m.id} value={m.id}>{m.name}</option>
                                             ))}
                                         </select>
                                     </div>
                                 </div>
                                 <button 
                                     onClick={handleRunAudit}
                                     disabled={isAuditing}
                                     className="bg-accent hover:bg-teal-600 text-white px-6 py-2.5 rounded-full font-bold shadow-lg transition-all transform hover:scale-105 flex items-center gap-2"
                                 >
                                     <Wand2 className="w-4 h-4"/> 开始审稿
                                 </button>
                             </div>
                         )}

                         {/* Audit Items List */}
                         {currentEpisode.auditItems?.map((item) => (
                             <div 
                                key={item.id} 
                                className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${
                                    item.status === 'applied' ? 'border-green-200 opacity-60' : 'border-gray-200 hover:shadow-md'
                                }`}
                             >
                                 <div className="flex justify-between items-start mb-2">
                                     <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                         item.severity === 'high' ? 'bg-red-100 text-red-600' :
                                         item.severity === 'medium' ? 'bg-orange-100 text-orange-600' :
                                         'bg-blue-100 text-blue-600'
                                     }`}>
                                         {item.category} · {item.severity === 'high' ? '严重' : item.severity === 'medium' ? '一般' : '轻微'}
                                     </span>
                                     {item.status === 'applied' && (
                                         <span className="text-xs font-bold text-green-600 flex items-center gap-1"><Check className="w-3 h-3"/> 已修复</span>
                                     )}
                                 </div>
                                 
                                 <h4 className="font-bold text-gray-800 text-sm mb-2">{item.issue}</h4>
                                 
                                 {item.targetQuote && (
                                     <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-500 italic mb-3 border-l-2 border-gray-300 line-clamp-2">
                                         "{item.targetQuote}"
                                     </div>
                                 )}
                                 
                                 <div className="text-xs text-gray-600 mb-4 leading-relaxed">
                                     <span className="font-bold text-accent">建议：</span>{item.suggestion}
                                 </div>
                                 
                                 {item.status !== 'applied' && (
                                     <button 
                                        onClick={() => handleApplyAudit(item)}
                                        disabled={isChatProcessing}
                                        className="w-full py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-accent transition-colors flex items-center justify-center gap-2"
                                     >
                                         <Zap className="w-3 h-3 text-yellow-300"/> 一键修改
                                     </button>
                                 )}
                             </div>
                         ))}
                         
                         {currentEpisode.auditItems && currentEpisode.auditItems.length > 0 && (
                            <div className="pt-4 flex justify-between items-center text-xs px-2">
                                <select 
                                     value={auditModel} 
                                     onChange={(e) => setAuditModel(e.target.value)}
                                     className="bg-gray-100/50 hover:bg-gray-100 font-bold text-gray-500 outline-none border border-gray-200/60 rounded-full py-1.5 px-3 cursor-pointer max-w-[120px]"
                                >
                                     {AVAILABLE_MODELS.map(m => (
                                         <option key={`a2-${m.id}`} value={m.id}>{m.name}</option>
                                     ))}
                                </select>
                                <button 
                                    onClick={handleRunAudit}
                                    className="text-gray-400 hover:text-accent flex items-center gap-1 font-bold"
                                >
                                    <RefreshCw className="w-3 h-3"/> 重新审稿
                                </button>
                            </div>
                         )}
                     </div>
                 </div>
               )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ScriptGenerator;
