
import React, { useState } from 'react';
import { readFileAsText, readDocxAsText, parseNovelChapters, parseOutlineEpisodes, parseScriptToEpisodes } from '../utils/fileParser';
import { ProjectState, AppStep, Episode } from '../types';
import { Upload, FileText, BookOpen, ArrowRight, Sparkles, CheckCircle2, ScanEye, FileType, Feather, Film, Wand2, Activity, History, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';

// 版本记录
const VERSION_HISTORY = [
  {
    version: "1.0.0",
    date: "2026-02-06",
    title: "初始版本",
    changes: [
      "小说全流程改编：故事蓝图解构 → 人物小传提取 → 分集大纲生成 → 剧本创作",
      "大纲直出剧本：支持文件上传或手动输入集纲，可增删集数、设置生成字数",
      "AI 剧本生成：支持多模型切换，自动分析大纲提取人物/世界观/钩子",
      "AI 主编审稿：7维度深度审核（逻辑/节奏/人设/改编/情绪/画面/情节）",
      "剧本精修工坊：AI 对话式修改、版本历史管理、差异对比",
      "剧本对比评分：多版本剧本横向对比，AI 评选最优方案"
    ]
  }
];

const MANUAL_OUTLINE_PROJECT_NAME = "手动输入大纲";

const getBaseNameFromFile = (file: File | null) => file?.name.replace(/\.(txt|docx)$/i, '') || "";

interface FileUploadProps {
  onDataParsed: (data: ProjectState) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataParsed }) => {
  const [novelFile, setNovelFile] = useState<File | null>(null);
  const [outlineFile, setOutlineFile] = useState<File | null>(null);
  const [scriptFile, setScriptFile] = useState<File | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [lastAutoProjectName, setLastAutoProjectName] = useState("");
  const [showProjectNamePrompt, setShowProjectNamePrompt] = useState(false);
  const [pendingMode, setPendingMode] = useState<'standard' | 'outline_only' | 'audit' | 'manual_outline' | null>(null);

  const getSuggestedProjectName = (mode?: 'standard' | 'outline_only' | 'audit' | 'manual_outline' | null) => {
    if (mode === 'manual_outline') {
      return projectName.trim() || lastAutoProjectName || MANUAL_OUTLINE_PROJECT_NAME;
    }

    if (mode === 'standard') {
      return projectName.trim() || getBaseNameFromFile(novelFile) || lastAutoProjectName || 'Untitled';
    }

    if (mode === 'outline_only') {
      return projectName.trim() || getBaseNameFromFile(outlineFile) || lastAutoProjectName || 'Untitled';
    }

    if (mode === 'audit') {
      return projectName.trim() || getBaseNameFromFile(scriptFile) || lastAutoProjectName || 'Untitled';
    }

    return projectName.trim() || lastAutoProjectName || getBaseNameFromFile(novelFile) || getBaseNameFromFile(outlineFile) || getBaseNameFromFile(scriptFile) || MANUAL_OUTLINE_PROJECT_NAME;
  };

  const syncProjectNameWithAutoValue = (nextAutoName: string) => {
    setProjectName(prev => {
      const trimmedPrev = prev.trim();
      if (!trimmedPrev || trimmedPrev === lastAutoProjectName) {
        return nextAutoName;
      }
      return prev;
    });
    setLastAutoProjectName(nextAutoName);
  };

  const resolveProjectName = (fallbackName: string) => {
    const trimmed = projectName.trim();
    return trimmed || fallbackName;
  };

  const getValidationError = (mode: 'standard' | 'outline_only' | 'audit' | 'manual_outline') => {
    if (mode === 'standard' && !novelFile) {
      return '全流程改编需要上传小说原文。';
    }
    if (mode === 'outline_only' && !outlineFile) {
      return '纯大纲模式需要上传集纲文件。';
    }
    if (mode === 'audit' && !scriptFile) {
      return '进入审稿模式必须上传剧本文件。';
    }
    return null;
  };

  const openProjectNamePrompt = (mode: 'standard' | 'outline_only' | 'audit' | 'manual_outline') => {
    const validationError = getValidationError(mode);
    if (validationError) {
      setError(validationError);
      return;
    }

    const suggestedName = getSuggestedProjectName(mode);
    setProjectName(suggestedName);
    setLastAutoProjectName(suggestedName);
    setPendingMode(mode);
    setShowProjectNamePrompt(true);
    setError(null);
  };

  const closeProjectNamePrompt = () => {
    setShowProjectNamePrompt(false);
    setPendingMode(null);
  };

  // 手动输入集纲 - 直接跳转到创作工坊
  const processManualOutline = (resolvedProjectName?: string) => {
    const apiKey = import.meta.env.VITE_API_KEY || "";
    console.log('🔑 Environment API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND');

    const episodes: Episode[] = [{
      id: 1,
      title: "第1集",
      content: "",
      targetChapter: "",
      generatedScript: null,
      chatHistory: [],
      status: 'pending' as const,
      targetWordCount: 800
    }];

    onDataParsed({
      novelName: resolvedProjectName || resolveProjectName(MANUAL_OUTLINE_PROJECT_NAME),
      novelChapters: [],
      episodes: episodes,
      blueprint: null,
      characters: [],
      currentStep: AppStep.SCRIPT,
      standaloneScript: "",
      outlineGlobalSettings: { viralTips: '' },
      isParsing: false,
      apiKey: apiKey,
      baseUrl: ""
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'novel' | 'outline' | 'script') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const nextAutoName = getBaseNameFromFile(file) || MANUAL_OUTLINE_PROJECT_NAME;

      if (type === 'novel') {
          setNovelFile(file);
      }
      else if (type === 'outline') {
          setOutlineFile(file);
      }
      else if (type === 'script') {
          setScriptFile(file);
      }

      syncProjectNameWithAutoValue(nextAutoName);
      setError(null);
    }
  };

  const processFiles = async (mode: 'standard' | 'outline_only' | 'audit', resolvedProjectName?: string) => {
    const validationError = getValidationError(mode);
    if (validationError) {
        setError(validationError);
        return;
    }

    setIsProcessing(true);
    setError(null);

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      let novelText = "";
      let chapters: any[] = [];
      if (novelFile) {
          if (novelFile.name.endsWith('.docx')) novelText = await readDocxAsText(novelFile);
          else novelText = await readFileAsText(novelFile);
          chapters = parseNovelChapters(novelText);
      }

      let episodes: any[] = [];
      let nextStep = AppStep.IP_ANALYSIS;

      if (outlineFile) {
        let outlineText = "";
        if (outlineFile.name.endsWith('.docx')) outlineText = await readDocxAsText(outlineFile);
        else outlineText = await readFileAsText(outlineFile);
        episodes = parseOutlineEpisodes(outlineText);

        if (episodes.length > 0) {
            nextStep = AppStep.SCRIPT;
        }
      }

      let standaloneScript = "";
      if (scriptFile) {
          if (scriptFile.name.endsWith('.docx')) standaloneScript = await readDocxAsText(scriptFile);
          else standaloneScript = await readFileAsText(scriptFile);

          if (episodes.length === 0) {
              episodes = parseScriptToEpisodes(standaloneScript);
          }
      }

      if (mode === 'outline_only') {
          nextStep = AppStep.SCRIPT;
      }
      if (mode === 'audit') {
          nextStep = AppStep.AUDIT;
      }

      const apiKey = import.meta.env.VITE_API_KEY || "";
      console.log('🔑 Environment API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND');

      const defaultProjectName = mode === 'standard'
        ? getBaseNameFromFile(novelFile)
        : mode === 'outline_only'
          ? getBaseNameFromFile(outlineFile)
          : getBaseNameFromFile(scriptFile);

      onDataParsed({
        novelName: resolvedProjectName || resolveProjectName(defaultProjectName || "Untitled"),
        novelChapters: chapters,
        episodes: episodes,
        blueprint: null,
        characters: [],
        currentStep: nextStep,
        standaloneScript: standaloneScript,
        outlineGlobalSettings: { viralTips: '' },
        isParsing: false,
        apiKey: apiKey,
        baseUrl: ""
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "解析文件时出错，请检查文件格式。");
      setIsProcessing(false);
    }
  };

  const confirmProjectNameAndContinue = async () => {
    const resolvedName = resolveProjectName(getSuggestedProjectName(pendingMode));
    closeProjectNamePrompt();

    if (pendingMode === 'manual_outline') {
      processManualOutline(resolvedName);
      return;
    }

    if (pendingMode) {
      await processFiles(pendingMode, resolvedName);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 md:p-12 max-w-7xl mx-auto font-sans">
      
      {/* Hero Section */}
      <div className="text-center mb-16 space-y-6 relative z-10">
         <div className="inline-flex items-center justify-center p-4 bg-gradient-to-br from-primary/20 to-orange-100 rounded-3xl mb-2 shadow-inner">
            <Feather className="w-10 h-10 text-primary" />
         </div>
         <h1 className="text-5xl md:text-6xl font-extrabold text-gray-800 tracking-tight leading-tight">
           NovelToScript <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-500">AI Studio</span>
         </h1>
         <p className="text-lg md:text-xl text-gray-500 font-medium max-w-2xl mx-auto leading-relaxed">
           专业的长篇小说影视化改编引擎。从解构蓝图到剧本生成，一站式 AI 赋能。
         </p>
      </div>

      {/* Main Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-16 relative z-10">
        
        {/* Card 1: Full Adaptation */}
        <div className={`relative group bg-white rounded-[2rem] p-8 shadow-card hover:shadow-float transition-all duration-300 border-2 flex flex-col ${novelFile ? 'border-primary/50 ring-4 ring-primary/5' : 'border-transparent hover:border-gray-100'}`}>
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-primary rounded-t-[2rem] opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="flex items-center gap-4 mb-6">
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${novelFile ? 'bg-primary text-white shadow-lg' : 'bg-orange-50 text-orange-500'}`}>
                <BookOpen className="w-6 h-6" />
             </div>
             <div>
                <h3 className="font-bold text-lg text-gray-800">全流程改编</h3>
                <p className="text-xs text-gray-400">Novel to Script</p>
             </div>
          </div>
          
          <div className="space-y-4 flex-1">
             <p className="text-sm text-gray-500 leading-relaxed min-h-[40px]">
                上传小说原文，AI 将协助您拆解故事架构、提取人物小传，并逐步完成分集与剧本创作。
             </p>
             
             {/* Upload Area */}
             <div className="relative">
                <input type="file" accept=".txt,.docx" className="hidden" id="novel-upload" onChange={(e) => handleFileChange(e, 'novel')} />
                <label htmlFor="novel-upload" className={`block w-full py-4 px-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${novelFile ? 'bg-orange-50 border-primary/30 text-primary font-bold' : 'border-gray-200 hover:border-primary/30 hover:bg-gray-50 text-gray-400 text-xs'}`}>
                    {novelFile ? (
                        <div className="flex items-center justify-center gap-2">
                            <CheckCircle2 className="w-4 h-4"/> {novelFile.name}
                        </div>
                    ) : "+ 上传小说文件 (.txt/.docx)"}
                </label>
             </div>
          </div>

          <div className="mt-8">
             <button 
                onClick={() => openProjectNamePrompt('standard')}
                disabled={!novelFile || isProcessing}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    novelFile && !isProcessing
                    ? 'bg-gray-900 text-white hover:bg-black shadow-lg transform hover:-translate-y-1' 
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
             >
                {isProcessing ? <Activity className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
                开始 IP 改编
             </button>
          </div>
        </div>

        {/* Card 2: Outline to Script (Fast Track) */}
        <div className={`relative group bg-white rounded-[2rem] p-8 shadow-card hover:shadow-float transition-all duration-300 border-2 flex flex-col ${outlineFile ? 'border-accent/50 ring-4 ring-accent/5' : 'border-transparent hover:border-gray-100'}`}>
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-teal-400 to-accent rounded-t-[2rem] opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div className="flex items-center gap-4 mb-6">
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${outlineFile ? 'bg-accent text-white shadow-lg' : 'bg-teal-50 text-accent'}`}>
                <Film className="w-6 h-6" />
             </div>
             <div>
                <h3 className="font-bold text-lg text-gray-800">大纲直出剧本</h3>
                <p className="text-xs text-gray-400">Outline to Script</p>
             </div>
          </div>

          <div className="space-y-4 flex-1">
             <p className="text-sm text-gray-500 leading-relaxed min-h-[40px]">
                上传分集大纲文件，AI 将根据大纲快速生成标准格式剧本。
             </p>

             {/* Upload Area */}
             <div className="relative">
                <input type="file" accept=".txt,.docx" className="hidden" id="outline-upload" onChange={(e) => handleFileChange(e, 'outline')} />
                <label htmlFor="outline-upload" className={`block w-full py-4 px-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${outlineFile ? 'bg-teal-50 border-accent/30 text-accent font-bold' : 'border-gray-200 hover:border-accent/30 hover:bg-gray-50 text-gray-400 text-xs'}`}>
                    {outlineFile ? (
                        <div className="flex items-center justify-center gap-2">
                            <CheckCircle2 className="w-4 h-4"/> {outlineFile.name}
                        </div>
                    ) : "+ 上传分集大纲 (.txt/.docx)"}
                </label>
             </div>

             {/* Manual Input Button - 直接跳转到创作工坊 */}
             <button
               onClick={() => openProjectNamePrompt('manual_outline')}
               className="w-full py-3 text-sm text-accent hover:text-white hover:bg-accent font-bold flex items-center justify-center gap-2 transition-all rounded-xl border-2 border-dashed border-accent/30 hover:border-accent"
             >
               <Edit3 className="w-4 h-4" /> 手动输入集纲
             </button>
          </div>

          <div className="mt-8">
             <button
                onClick={() => openProjectNamePrompt('outline_only')}
                disabled={!outlineFile || isProcessing}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    outlineFile && !isProcessing
                    ? 'bg-accent text-white hover:bg-teal-600 shadow-lg transform hover:-translate-y-1'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
             >
                {isProcessing ? <Activity className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                生成剧本
             </button>
          </div>
        </div>

        {/* Card 3: Audit */}
        <div className={`relative group bg-white rounded-[2rem] p-8 shadow-card hover:shadow-float transition-all duration-300 border-2 flex flex-col ${scriptFile ? 'border-purple-400/50 ring-4 ring-purple-100' : 'border-transparent hover:border-gray-100'}`}>
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-400 to-purple-600 rounded-t-[2rem] opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div className="flex items-center gap-4 mb-6">
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${scriptFile ? 'bg-purple-600 text-white shadow-lg' : 'bg-purple-50 text-purple-600'}`}>
                <ScanEye className="w-6 h-6" />
             </div>
             <div>
                <h3 className="font-bold text-lg text-gray-800">AI 主编审稿</h3>
                <p className="text-xs text-gray-400">Script Audit</p>
             </div>
          </div>
          
          <div className="space-y-4 flex-1">
             <p className="text-sm text-gray-500 leading-relaxed min-h-[40px]">
                上传已完成的剧本，AI 主编将从节奏、冲突、人设等维度进行毒舌点评并提供修改建议。
             </p>
             
             {/* Upload Area */}
             <div className="relative">
                <input type="file" accept=".txt,.docx" className="hidden" id="script-upload" onChange={(e) => handleFileChange(e, 'script')} />
                <label htmlFor="script-upload" className={`block w-full py-4 px-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${scriptFile ? 'bg-purple-50 border-purple-300 text-purple-600 font-bold' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50 text-gray-400 text-xs'}`}>
                    {scriptFile ? (
                        <div className="flex items-center justify-center gap-2">
                            <CheckCircle2 className="w-4 h-4"/> {scriptFile.name}
                        </div>
                    ) : "+ 上传剧本文件 (.txt/.docx)"}
                </label>
             </div>
          </div>

          <div className="mt-8">
             <button 
                onClick={() => openProjectNamePrompt('audit')}
                disabled={!scriptFile || isProcessing}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    scriptFile && !isProcessing
                    ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg transform hover:-translate-y-1' 
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
             >
                {isProcessing ? <Activity className="w-4 h-4 animate-spin"/> : <ScanEye className="w-4 h-4"/>}
                进入审稿台
             </button>
          </div>
        </div>

      </div>

      {showProjectNamePrompt && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white shadow-2xl border border-gray-100 p-7 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-gray-800">填写项目名称</h3>
                <p className="text-xs text-gray-400">默认取上传文件名，你可以在进入下一步前改成正式项目名。</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">项目名称</label>
                <input
                  autoFocus
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void confirmProjectNameAndContinue();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      closeProjectNamePrompt();
                    }
                  }}
                  placeholder={getSuggestedProjectName(pendingMode) || '请输入项目名称'}
                  className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50/80 focus:bg-white focus:border-primary/40 focus:ring-4 focus:ring-primary/5 outline-none text-sm font-medium text-gray-800 transition-all"
                />
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-500">
                默认建议：<span className="font-bold text-gray-700">{getSuggestedProjectName(pendingMode)}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeProjectNamePrompt}
                className="px-4 py-2.5 rounded-xl font-bold text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmProjectNameAndContinue()}
                className="px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary/90 shadow-sm transition-colors"
              >
                确认并继续
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 p-4 bg-red-600 text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-10 z-50">
          <div className="bg-white/20 p-1 rounded-full"><CheckCircle2 className="w-4 h-4"/></div>
          <span className="font-bold text-sm">{error}</span>
        </div>
      )}

      {/* Version History Section */}
      <div className="w-full max-w-4xl mx-auto mb-8 relative z-10">
        <button
          onClick={() => setShowVersionHistory(!showVersionHistory)}
          className="w-full flex items-center justify-center gap-2 py-3 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <History className="w-4 h-4" />
          <span className="text-sm font-medium">版本记录 v{VERSION_HISTORY[0].version}</span>
          {showVersionHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showVersionHistory && (
          <div className="mt-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {VERSION_HISTORY.map((release, idx) => (
              <div key={release.version} className={`p-6 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 bg-primary/10 text-primary font-bold text-sm rounded-full">
                    v{release.version}
                  </span>
                  <span className="text-gray-400 text-sm">{release.date}</span>
                  {idx === 0 && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-600 text-xs font-bold rounded-full">
                      当前版本
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-gray-800 mb-3">{release.title}</h4>
                <ul className="space-y-2">
                  {release.changes.map((change, changeIdx) => (
                    <li key={changeIdx} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decorative Background Elements */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-100/40 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/40 rounded-full blur-[120px]"></div>
          <div className="absolute top-[40%] left-[60%] w-[20%] h-[20%] bg-purple-100/30 rounded-full blur-[80px]"></div>
      </div>

    </div>
  );
};

export default FileUpload;
