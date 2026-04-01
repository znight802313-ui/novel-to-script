
import React, { useState, useEffect, useRef } from 'react';
import { AuditReport, AuditAnnotation, ScriptVersion, Episode, ChatMessage, ComparisonReport } from '../types';
import { performDeepAudit, performBatchedDeepAudit, performIncrementalDeepAudit, getFixOptions, batchOptimizeScript, refineScript, auditScript, compareScripts, AVAILABLE_MODELS } from '../services/geminiService';
import { isCapacityError } from '../services/apiClient';
import { readFileAsText } from '../utils/fileParser';
import { AlertCircle, CheckCircle2, Zap, LayoutList, BookOpen, ChevronRight, Wand2, RefreshCw, X, MessageSquare, ArrowRight, Download, Eye, Layers, Settings, Play, Loader2, Save, History, ChevronDown, RotateCcw, MonitorPlay, FileText, Send, Quote, Search, SplitSquareHorizontal, Trophy, Upload, ThumbsUp, ThumbsDown, Scale, Home, Sparkles } from 'lucide-react';
import DiffTextView from './DiffTextView';
import { useAiTask } from '../utils/useAiTask';

interface ScriptAuditorProps {
    initialScript: string;
    novelContext: string; // Used for Full Audit
    outlineContext: string; // Used for Full Audit
    episodes?: Episode[]; // Used for Single Episode Audit
    chapters?: any[]; // Used for context extraction in Single Mode
    apiKey: string;
    baseUrl?: string;
    novelName?: string;
    onNovelNameChange?: (name: string) => void;
    onClose: () => void;
    onNewProject: () => void;
    onGoBack: () => void;
}

const ScriptAuditor: React.FC<ScriptAuditorProps> = ({ initialScript, novelContext, outlineContext, episodes = [], chapters = [], apiKey, baseUrl, novelName, onNovelNameChange, onClose, onNewProject, onGoBack }) => {
    // --- Mode State ---
    const [auditMode, setAuditMode] = useState<'full' | 'single' | 'compare'>('full');
    const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

    // --- 统一的剧本数据源：每集独立存储，全本模式动态合并 ---
    const [episodeScripts, setEpisodeScripts] = useState<{ [episodeIndex: number]: string }>(() => {
        // 初始化：从 episodes 中提取每集剧本
        const scripts: { [episodeIndex: number]: string } = {};
        episodes.forEach((ep, idx) => {
            scripts[idx] = ep.generatedScript || "";
        });
        return scripts;
    });

    // --- 计算当前显示的剧本 ---
    const getFullScript = () => {
        // 合并所有集的剧本
        return episodes
            .map((ep, idx) => episodeScripts[idx] || ep.generatedScript || "")
            .filter(s => s.length > 0)
            .join("\n\n");
    };

    const getCurrentScript = () => {
        if (auditMode === 'full') {
            return getFullScript();
        } else {
            return episodeScripts[currentEpisodeIndex] ?? episodes[currentEpisodeIndex]?.generatedScript ?? "";
        }
    };

    // --- 更新剧本的统一方法 ---
    const updateScript = (newScript: string) => {
        if (auditMode === 'full') {
            // 全本模式：需要解析并分配到各集
            // 简单策略：如果能识别集数标记，则分割；否则整体替换第一集
            const episodeMarkers = newScript.match(/第\s*(\d+)\s*集/g);
            if (episodeMarkers && episodeMarkers.length > 1) {
                // 尝试按集数分割
                const newScripts: { [idx: number]: string } = {};
                let remaining = newScript;

                for (let i = 0; i < episodes.length; i++) {
                    const currentMarker = `第${episodes[i].id}集`;
                    const nextMarker = i < episodes.length - 1 ? `第${episodes[i + 1].id}集` : null;

                    const startIdx = remaining.indexOf(currentMarker);
                    if (startIdx !== -1) {
                        let endIdx = nextMarker ? remaining.indexOf(nextMarker) : remaining.length;
                        if (endIdx === -1) endIdx = remaining.length;

                        newScripts[i] = remaining.substring(startIdx, endIdx).trim();
                    }
                }

                // 如果成功分割了至少一集，使用分割结果
                if (Object.keys(newScripts).length > 0) {
                    setEpisodeScripts(prev => ({ ...prev, ...newScripts }));
                } else {
                    // 分割失败，保持原样但更新缓存
                    setFullScriptCache(newScript);
                }
            } else {
                // 无法分割，保存到全本缓存
                setFullScriptCache(newScript);
            }
        } else {
            // 单集模式：直接更新当前集
            setEpisodeScripts(prev => ({
                ...prev,
                [currentEpisodeIndex]: newScript
            }));
        }
    };

    // --- 全本模式的额外缓存（用于无法分割的情况）---
    const [fullScriptCache, setFullScriptCache] = useState<string | null>(null);

    // --- 获取实际显示的剧本 ---
    const script = auditMode === 'full'
        ? (fullScriptCache ?? getFullScript())
        : getCurrentScript();

    // --- 审稿报告状态 ---
    const [report, setReport] = useState<AuditReport | null>(null);
    const [singleEpAuditItems, setSingleEpAuditItems] = useState<any[]>([]); // For single mode (uses different structure)

    // --- 可编辑的上下文 (Full Mode) ---
    const [editableNovelContext, setEditableNovelContext] = useState(novelContext);
    const [editableOutlineContext, setEditableOutlineContext] = useState(outlineContext);
    const [showContextEditor, setShowContextEditor] = useState(false);

    // --- 审稿报告缓存（分模式独立）---
    const [fullModeReport, setFullModeReport] = useState<AuditReport | null>(null);
    const [singleModeAuditItems, setSingleModeAuditItems] = useState<{ [episodeIndex: number]: any[] }>({});

    // --- 聊天历史缓存（分模式独立）---
    const [fullModeChatHistory, setFullModeChatHistory] = useState<ChatMessage[]>([]);
    const [singleModeChatHistories, setSingleModeChatHistories] = useState<{ [episodeIndex: number]: ChatMessage[] }>({});

    // --- 版本历史缓存（分模式独立）---
    const [fullModeHistory, setFullModeHistory] = useState<ScriptVersion[]>([]);
    const [singleModeHistories, setSingleModeHistories] = useState<{ [episodeIndex: number]: ScriptVersion[] }>({});

    // --- Comparison State ---
    const [comparisonFiles, setComparisonFiles] = useState<{name: string, content: string}[]>([]);
    const [comparisonReport, setComparisonReport] = useState<ComparisonReport | null>(null);
    const comparisonTask = useAiTask('剧本对比');
    const auditTask = useAiTask('剧本审稿');
    const fixOptionsTask = useAiTask('修复建议');
    const batchTask = useAiTask('批量优化');
    const chatTask = useAiTask('审稿聊天');

    const isComparing = comparisonTask.isRunning;
    const isAuditing = auditTask.isRunning;
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    const [fixOptions, setFixOptions] = useState<string[] | null>(null);
    const isGeneratingFix = fixOptionsTask.isRunning;
    const isBatchProcessing = batchTask.isRunning;
    const batchProgress = auditTask.progress;

    // --- Chat Assistant State (当前模式的) ---
    const chatHistory = auditMode === 'full'
        ? fullModeChatHistory
        : (singleModeChatHistories[currentEpisodeIndex] || []);

    const setChatHistory = (newHistory: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
        if (auditMode === 'full') {
            setFullModeChatHistory(typeof newHistory === 'function' ? newHistory(fullModeChatHistory) : newHistory);
        } else {
            setSingleModeChatHistories(prev => ({
                ...prev,
                [currentEpisodeIndex]: typeof newHistory === 'function'
                    ? newHistory(prev[currentEpisodeIndex] || [])
                    : newHistory
            }));
        }
    };

    const [chatInput, setChatInput] = useState("");
    const isChatProcessing = chatTask.isRunning;
    const [selectedText, setSelectedText] = useState<string | null>(null);

    // --- Versioning (当前模式的) ---
    const history = auditMode === 'full'
        ? fullModeHistory
        : (singleModeHistories[currentEpisodeIndex] || []);

    const setHistory = (newHistory: ScriptVersion[] | ((prev: ScriptVersion[]) => ScriptVersion[])) => {
        if (auditMode === 'full') {
            setFullModeHistory(typeof newHistory === 'function' ? newHistory(fullModeHistory) : newHistory);
        } else {
            setSingleModeHistories(prev => ({
                ...prev,
                [currentEpisodeIndex]: typeof newHistory === 'function'
                    ? newHistory(prev[currentEpisodeIndex] || [])
                    : newHistory
            }));
        }
    };

    const [showHistory, setShowHistory] = useState(false);
    const [previewVersion, setPreviewVersion] = useState<ScriptVersion | null>(null);
    const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit');

    // --- Config ---
    const [selectedModel, setSelectedModel] = useState<string>('claude-opus-4-6-a');

    // --- Capacity Error Modal ---
    const [showCapacityModal, setShowCapacityModal] = useState(false);

    // --- Refs ---
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const reportRef = useRef<HTMLDivElement>(null);
    const prevModeRef = useRef<'full' | 'single' | 'compare'>(auditMode);
    const prevEpisodeIndexRef = useRef<number>(currentEpisodeIndex);

    // --- 模式切换时同步审稿报告 ---
    useEffect(() => {
        const prevMode = prevModeRef.current;

        // 保存离开模式的审稿报告
        if (prevMode === 'full' && auditMode !== 'full') {
            setFullModeReport(report);
        } else if (prevMode === 'single' && auditMode !== 'single') {
            setSingleModeAuditItems(prev => ({
                ...prev,
                [prevEpisodeIndexRef.current]: singleEpAuditItems
            }));
        }

        // 恢复进入模式的审稿报告
        if (auditMode === 'full') {
            setReport(fullModeReport);
            setSingleEpAuditItems([]);
        } else if (auditMode === 'single' && episodes.length > 0) {
            setSingleEpAuditItems(singleModeAuditItems[currentEpisodeIndex] || []);
            setReport(null);
        }

        // 清除全本缓存，使用最新的合并结果
        if (auditMode === 'full') {
            setFullScriptCache(null);
        }

        prevModeRef.current = auditMode;
    }, [auditMode]);

    // --- 单集模式切换集数时同步 ---
    useEffect(() => {
        if (auditMode !== 'single' || episodes.length === 0) return;

        const prevIndex = prevEpisodeIndexRef.current;

        if (prevIndex !== currentEpisodeIndex) {
            // 保存离开集数的审稿结果
            setSingleModeAuditItems(prev => ({
                ...prev,
                [prevIndex]: singleEpAuditItems
            }));

            // 恢复新集数的审稿结果
            setSingleEpAuditItems(singleModeAuditItems[currentEpisodeIndex] || []);
        }

        prevEpisodeIndexRef.current = currentEpisodeIndex;
    }, [currentEpisodeIndex, auditMode, episodes]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, isChatProcessing]);

    // --- Helpers ---
    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
        if (score >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        return 'text-red-600 bg-red-50 border-red-200';
    };

    const getSeverityBadge = (severity: string) => {
        switch (severity?.toLowerCase()) {
            case 'high': return <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded font-bold border border-red-200 uppercase">High / 严重</span>;
            case 'medium': return <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded font-bold border border-orange-200 uppercase">Medium / 一般</span>;
            case 'low': return <span className="bg-blue-100 text-blue-600 text-[10px] px-2 py-0.5 rounded font-bold border border-blue-200 uppercase">Low / 轻微</span>;
            default: return <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded font-bold border border-gray-200">Info</span>;
        }
    };

    const saveVersion = (content: string, note: string, type: 'manual' | 'ai' | 'auto') => {
        const newVersion: ScriptVersion = {
            id: Date.now().toString(),
            content,
            timestamp: Date.now(),
            note,
            type
        };
        setHistory(prev => [...prev, newVersion]);
    };

    const handleManualSave = () => {
        saveVersion(script, "手动保存", 'manual');
        alert("已保存版本到历史记录");
    };

    const handleExport = async () => {
         const currentName = (novelName || '未命名项目').trim() || '未命名项目';
         const confirmedName = window.prompt('请确认导出的项目名称', currentName);
         if (confirmedName === null) return;
         const projectTitle = confirmedName.trim() || currentName;
         onNovelNameChange?.(projectTitle);
         const title = auditMode === 'single' 
            ? `${projectTitle}_第${episodes[currentEpisodeIndex]?.id}集_审稿修改版`
            : `${projectTitle}_剧本_全本审稿修改版`;
         const { exportScriptToDocx } = await import('../utils/docxGenerator');
         exportScriptToDocx(script, title);
    };

    const handleCompareUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles: {name: string, content: string}[] = [];
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                try {
                    const content = await readFileAsText(file);
                    newFiles.push({ name: file.name, content });
                } catch (err) {
                    console.error("Read Error", err);
                }
            }
            setComparisonFiles(prev => [...prev, ...newFiles]);
        }
    };

    const handleRunComparison = async () => {
        if (comparisonFiles.length < 2) {
            alert("请至少上传两个剧本进行对比");
            return;
        }
        setComparisonReport(null);
        try {
            const report = await comparisonTask.runTask(async ({ log }) => {
                log(`开始对比 ${comparisonFiles.length} 个剧本版本`);
                return compareScripts(apiKey, comparisonFiles, baseUrl, selectedModel);
            });
            setComparisonReport(report);
        } catch (e) {
            console.error(e);
            alert("对比分析失败");
        }
    };

    // --- Auditing Logic ---

    const handleRunAudit = async () => {
        setReport(null);
        setSingleEpAuditItems([]);
        setSelectedAnnotationId(null);
        setFixOptions(null);

        try {
            await auditTask.runTask(async ({ log, setProgress }) => {
                if (auditMode === 'full') {
                    const scriptLength = script.length;
                    const hasNovelContext = editableNovelContext && editableNovelContext.length > 1000;

                    if (hasNovelContext && scriptLength > 50000) {
                        log('使用增量式深度审稿');
                        const result = await performIncrementalDeepAudit(
                            apiKey,
                            script,
                            editableNovelContext,
                            editableOutlineContext,
                            baseUrl,
                            selectedModel,
                            (current, total, message) => {
                                setProgress({ current, total, message });
                            }
                        );
                        setReport(result);
                    } else if (scriptLength > 200000) {
                        log('使用分批深度审稿');
                        const result = await performBatchedDeepAudit(
                            apiKey,
                            script,
                            editableNovelContext,
                            editableOutlineContext,
                            baseUrl,
                            selectedModel,
                            (current, total, message) => {
                                setProgress({ current, total, message });
                            }
                        );
                        setReport(result);
                    } else {
                        log('使用标准深度审稿');
                        const result = await performDeepAudit(apiKey, script, editableNovelContext, editableOutlineContext, baseUrl, selectedModel);
                        setReport(result);
                    }
                    return;
                }

                const currentEp = episodes[currentEpisodeIndex];
                if (!currentEp) return;

                const auditConfig = {
                    novelContent: currentEp.draftNovelContent || currentEp.usedSourceText || "", 
                    outlineContent: currentEp.draftOutline || currentEp.content,
                    previousScriptContext: currentEpisodeIndex > 0 ? episodes[currentEpisodeIndex - 1].generatedScript || "" : "",
                    episodeId: currentEp.id,
                    episodeTitle: currentEp.title,
                    worldSetting: currentEp.draftWorldSetting,
                    keyQuotes: currentEp.draftKeyQuotes,
                    characterList: currentEp.draftCharacterList,
                    openingHook: currentEp.draftOpeningHook,
                    endingHook: currentEp.draftEndingHook,
                    foreshadowing: currentEp.draftForeshadowing,
                    targetChapter: currentEp.targetChapter
                };

                log(`审查第 ${currentEp.id} 集`);
                const auditItems = await auditScript(
                    apiKey,
                    script,
                    auditConfig,
                    selectedModel,
                    baseUrl
                );
                setSingleEpAuditItems(auditItems);
            });
        } catch (e: any) {
            console.error("审稿错误详情:", e);
            const errorMsg = e?.message || e?.toString() || "未知错误";

            // 检测是否为流量过载错误
            if (isCapacityError(e)) {
                setShowCapacityModal(true);
            } else {
                alert(`审稿失败: ${errorMsg}\n\n请检查：\n1. API Key 是否正确\n2. 网络连接是否正常\n3. 剧本长度是否过大（建议<20万字）`);
            }
        }
    };

    // --- Chat Assistant Logic ---
    const handleTextSelect = () => {
        if (editorRef.current) {
            const start = editorRef.current.selectionStart;
            const end = editorRef.current.selectionEnd;
            if (start !== end) {
                const text = editorRef.current.value.substring(start, end);
                if (text.trim().length > 0) {
                    setSelectedText(text);
                }
            }
        }
    };

    const handleChatSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!chatInput.trim() || isChatProcessing) return;

        const userMsg: ChatMessage = { 
            role: 'user', 
            text: chatInput, 
            timestamp: Date.now(),
            quotedText: selectedText || undefined
        };

        saveVersion(script, "Chat Edit Pre-save", 'auto');
        setChatHistory(prev => [...prev, userMsg]);
        setChatInput("");
        setSelectedText(null);
        try {
            const result = await chatTask.runTask(async ({ log }) => {
                log('处理审稿对话修改');
                return refineScript(
                    apiKey,
                    script,
                    userMsg.text,
                    [...chatHistory, userMsg],
                    selectedModel,
                    baseUrl,
                    userMsg.quotedText
                );
            });

            if (result.newScript) {
                updateScript(result.newScript);
                saveVersion(result.newScript, "AI Assistant Edit", 'ai');
                setViewMode('diff');
            }

            const aiMsg: ChatMessage = { role: 'model', text: result.textResponse, timestamp: Date.now() };
            setChatHistory(prev => [...prev, aiMsg]);
        } catch (error) {
            console.error(error);
            setChatHistory(prev => [...prev, { role: 'model', text: "处理请求时出错，请重试。", timestamp: Date.now() }]);
        }
    };

    // --- Deep Audit Fix Logic (Full Mode) ---
    const findAndScrollToText = (target: string) => {
        if (!editorRef.current || !target) return;
        const textarea = editorRef.current;
        const fullText = textarea.value;

        // 1. 首先尝试精确匹配
        let index = fullText.indexOf(target);
        let matchLength = target.length;

        // 2. 如果精确匹配失败，尝试清理后匹配（去除多余空格和换行）
        if (index === -1) {
            const cleanTarget = target.replace(/\s+/g, ' ').trim();
            const cleanFullText = fullText.replace(/\s+/g, ' ');
            const cleanIndex = cleanFullText.indexOf(cleanTarget);
            if (cleanIndex !== -1) {
                // 找到在清理后文本中的位置，需要映射回原始位置
                // 简化处理：在原文中搜索清理后的关键词
                const keywords = cleanTarget.split(' ').filter(k => k.length > 2);
                if (keywords.length > 0) {
                    const firstKeyword = keywords[0];
                    index = fullText.indexOf(firstKeyword);
                    matchLength = firstKeyword.length;
                }
            }
        }

        // 3. 如果还是失败，尝试匹配前20个字符
        if (index === -1) {
            const shortTarget = target.substring(0, Math.min(20, target.length)).trim();
            index = fullText.indexOf(shortTarget);
            matchLength = shortTarget.length;
        }

        // 4. 如果还是失败，尝试匹配中间的关键词（去除可能的引号和标点）
        if (index === -1) {
            const cleanedTarget = target.replace(/["""''「」『』【】（）()：:，,。.！!？?]/g, '').trim();
            if (cleanedTarget.length > 5) {
                const midStart = Math.floor(cleanedTarget.length / 4);
                const midEnd = Math.floor(cleanedTarget.length * 3 / 4);
                const midPart = cleanedTarget.substring(midStart, midEnd);
                if (midPart.length > 3) {
                    index = fullText.indexOf(midPart);
                    matchLength = midPart.length;
                }
            }
        }

        // 5. 最后尝试：提取中文关键词进行匹配
        if (index === -1) {
            const chineseMatch = target.match(/[\u4e00-\u9fa5]{4,}/g);
            if (chineseMatch && chineseMatch.length > 0) {
                // 找最长的中文片段
                const longestChinese = chineseMatch.sort((a, b) => b.length - a.length)[0];
                index = fullText.indexOf(longestChinese);
                matchLength = longestChinese.length;
            }
        }

        if (index !== -1) {
            textarea.focus();
            textarea.setSelectionRange(index, index + matchLength);

            // 计算滚动位置
            const div = document.createElement('div');
            const styles = window.getComputedStyle(textarea);
            ['width', 'padding', 'border', 'boxSizing', 'font', 'lineHeight', 'letterSpacing'].forEach((prop: any) => {
                div.style[prop] = styles[prop];
            });
            div.style.position = 'absolute';
            div.style.visibility = 'hidden';
            div.style.height = 'auto';
            div.style.whiteSpace = 'pre-wrap';
            div.style.wordWrap = 'break-word';
            div.textContent = fullText.substring(0, index);
            document.body.appendChild(div);
            const targetTop = div.clientHeight;
            document.body.removeChild(div);

            // 滚动到目标位置，让匹配文本显示在视口中间偏上
            textarea.scrollTop = Math.max(0, targetTop - (textarea.clientHeight / 3));
        } else {
            console.warn(`[定位失败] 未找到匹配文本: "${target.substring(0, 50)}..."`);
        }
    };

    const handleAnnotationClick = (anno: AuditAnnotation) => {
        setSelectedAnnotationId(anno.id);
        setFixOptions(null);
        findAndScrollToText(anno.location.lineContent);
    };

    const handleGenerateFix = async (anno: AuditAnnotation) => {
        try {
            const options = await fixOptionsTask.runTask(async ({ log }) => {
                log(`生成修复建议：${anno.dimension}`);
                return getFixOptions(apiKey, anno.location.lineContent, anno.issue, script, baseUrl);
            });
            setFixOptions(options);
        } catch (e) {
            alert("生成修复建议失败");
        }
    };

    // --- Batch Fix Logic ---
    const handleBatchFix = async (type: string) => {
        try {
            saveVersion(script, `Batch Optimization: ${type}`, 'auto');
            const optimizedScript = await batchTask.runTask(async ({ log }) => {
                log(`执行批量优化：${type}`);
                return batchOptimizeScript(apiKey, script, type, baseUrl);
            });
            updateScript(optimizedScript);
            saveVersion(optimizedScript, `Batch Result: ${type}`, 'ai');
            setViewMode('diff');
        } catch (e) {
            console.error(e);
            alert("批量优化失败");
        }
    };

    // --- Single Audit Fix Logic (Single Mode) ---
    const handleApplySingleAudit = async (item: any) => {
        if(isChatProcessing) return;
        const fixInstruction = `【主编修改指令】\n针对问题：${item.issue}\n具体要求：${item.suggestion}\n\n请修改剧本。`;
        const userMsg: ChatMessage = { 
            role: 'user', 
            text: `应用审稿意见：${item.suggestion}`, 
            timestamp: Date.now(), 
            quotedText: item.targetQuote 
        };
        
        saveVersion(script, `Fix: ${item.category}`, 'auto');
        setChatHistory(prev => [...prev, userMsg]);
        try {
            const result = await chatTask.runTask(async ({ log }) => {
                log(`应用单条审稿意见：${item.category}`);
                return refineScript(apiKey, script, fixInstruction, [...chatHistory, userMsg], selectedModel, baseUrl, item.targetQuote);
            });
            if(result.newScript) {
                updateScript(result.newScript);
                saveVersion(result.newScript, `AI Fix: ${item.category}`, 'ai');
                setViewMode('diff');
                // Mark item as fixed visually
                setSingleEpAuditItems(prev => prev.map(i => i.id === item.id ? {...i, status: 'applied'} : i));
            }
            setChatHistory(prev => [...prev, {role: 'model', text: result.textResponse, timestamp: Date.now()}]);
        } catch(e) {
            console.error(e);
            alert("修改失败");
        }
    };

    const applyFix = (newText: string) => {
        if (!selectedAnnotationId || !report) return;
        const anno = report.annotations.find(a => a.id === selectedAnnotationId);
        if (!anno || !editorRef.current) return;

        saveVersion(script, `修复前: ${anno.issue}`, 'auto');
        const newScript = script.replace(anno.location.lineContent, newText);
        updateScript(newScript);
        saveVersion(newScript, `AI修复: ${anno.issue}`, 'ai');
        setViewMode('diff');

        const updatedAnnotations = report.annotations.map(a =>
            a.id === selectedAnnotationId ? { ...a, status: 'fixed' as const } : a
        );
        setReport({ ...report, annotations: updatedAnnotations });
        setFixOptions(null);
        setSelectedAnnotationId(null);
    };

    const diffBaseVersion = history.length > 1 ? history[history.length - 2].content : "";

    return (
        <>
            {/* Capacity Error Modal */}
            {showCapacityModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4 text-3xl">
                                ⚠️
                            </div>
                            <h3 className="text-xl font-extrabold text-gray-800 mb-3">模型流量过载</h3>
                            <p className="text-gray-600 text-sm mb-2">
                                当前模型 <span className="font-bold text-primary">{AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name || selectedModel}</span> 正在经历高流量，请稍后重试。
                            </p>
                            <p className="text-gray-500 text-xs mb-6">
                                或者切换到更稳定的模型继续审稿
                            </p>

                            <div className="w-full space-y-3">
                                <button
                                    onClick={() => {
                                        setSelectedModel('[次]gemini-3-pro-preview-thinking');
                                        setShowCapacityModal(false);
                                        // 自动重新审稿
                                        setTimeout(() => handleRunAudit(), 500);
                                    }}
                                    className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 shadow-lg flex items-center justify-center gap-2 transition-all"
                                >
                                    <Zap className="w-5 h-5"/>
                                    切换到 Gemini 3.0 Pro（推荐）
                                </button>

                                <button
                                    onClick={() => setShowCapacityModal(false)}
                                    className="w-full py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
                                >
                                    稍后重试
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex h-full bg-gray-50 overflow-hidden">
            {/* Left Column: Navigation & Context */}
            <div className="w-1/4 min-w-[280px] max-w-[320px] border-r border-gray-200 bg-white flex flex-col z-20">
                {/* Home Button & Mode Switcher */}
                <div className="p-4 border-b border-gray-100">
                    <div className="flex gap-2 mb-3">
                        <button
                            onClick={onGoBack}
                            className="flex-1 py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center gap-2 text-gray-600 transition-colors text-sm font-bold"
                            title="返回上一步"
                        >
                            <ArrowRight className="w-4 h-4 rotate-180"/> 返回
                        </button>
                        <button
                            onClick={onNewProject}
                            className="flex-1 py-2 px-3 rounded-xl bg-blue-100 hover:bg-blue-200 flex items-center justify-center gap-2 text-blue-600 transition-colors text-sm font-bold"
                            title="重新开启新项目"
                        >
                            <Sparkles className="w-4 h-4"/> 新建
                        </button>
                    </div>
                    <div className="flex flex-col gap-2 bg-gray-100 p-1 rounded-xl mb-4">
                        <div className="flex gap-1">
                            <button
                                onClick={() => setAuditMode('full')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${auditMode === 'full' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <FileText className="w-3.5 h-3.5"/> 全本通审
                            </button>
                            <button 
                                onClick={() => {
                                    if (episodes.length === 0) {
                                        alert("未检测到分集数据，请先生成剧本或上传带分集的项目。");
                                        return;
                                    }
                                    setAuditMode('single');
                                }}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${auditMode === 'single' ? 'bg-white shadow-sm text-accent' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <MonitorPlay className="w-3.5 h-3.5"/> 单集精修
                            </button>
                        </div>
                        <button 
                            onClick={() => setAuditMode('compare')}
                            className={`w-full py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${auditMode === 'compare' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <SplitSquareHorizontal className="w-3.5 h-3.5"/> 横向对比 (AB Test)
                        </button>
                    </div>

                    <div className="font-bold text-gray-700 flex items-center gap-2 text-sm">
                        <BookOpen className="w-4 h-4 text-blue-500"/> 
                        {auditMode === 'full' ? '全剧参考资料' : (auditMode === 'single' ? '本集参考资料' : '待对比文件列表')}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto">
                    {auditMode === 'compare' ? (
                        <div className="p-4 space-y-4">
                            {/* Comparison File List */}
                            <div className="space-y-2">
                                {comparisonFiles.map((f, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-6 h-6 rounded bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-bold">{i+1}</div>
                                            <span className="text-xs font-medium text-gray-700 truncate">{f.name}</span>
                                        </div>
                                        <button onClick={() => setComparisonFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500">
                                            <X className="w-3 h-3"/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Upload Area */}
                            <label className="block w-full py-8 border-2 border-dashed border-gray-200 rounded-xl text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-all">
                                <input type="file" multiple accept=".txt" className="hidden" onChange={handleCompareUpload} />
                                <div className="flex flex-col items-center gap-1 text-gray-400">
                                    <Upload className="w-5 h-5 mb-1" />
                                    <span className="text-xs font-bold">点击上传多个剧本 (.txt)</span>
                                </div>
                            </label>

                            <button 
                                onClick={handleRunComparison}
                                disabled={comparisonFiles.length < 2 || isComparing}
                                className={`w-full py-3 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all ${
                                    comparisonFiles.length < 2 ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                                }`}
                            >
                                {isComparing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Scale className="w-4 h-4"/>}
                                开始 PK 对比
                            </button>
                        </div>
                    ) : (
                        auditMode === 'single' ? (
                            <div className="flex flex-col h-full">
                                {/* Episode List */}
                                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400">选择集数</div>
                                <div className="max-h-[30vh] overflow-y-auto border-b border-gray-100">
                                    {episodes.map((ep, idx) => (
                                        <button 
                                            key={ep.id}
                                            onClick={() => setCurrentEpisodeIndex(idx)}
                                            className={`w-full text-left px-4 py-2.5 text-xs font-medium border-l-4 transition-all hover:bg-gray-50 ${
                                                idx === currentEpisodeIndex 
                                                ? 'border-accent bg-accent/5 text-accent' 
                                                : 'border-transparent text-gray-600'
                                            }`}
                                        >
                                            <div className="flex justify-between">
                                                <span>第 {ep.id} 集</span>
                                                {ep.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-500"/>}
                                            </div>
                                            <div className="truncate opacity-70 mt-0.5">{ep.title}</div>
                                        </button>
                                    ))}
                                </div>
                                
                                {/* Current Context */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase mb-1">对应大纲</div>
                                        <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 leading-relaxed">
                                            {episodes[currentEpisodeIndex]?.draftOutline || episodes[currentEpisodeIndex]?.content || "无大纲"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase mb-1">原著参考</div>
                                        <div className="text-xs text-gray-500 bg-yellow-50/50 p-2 rounded border border-yellow-100 font-serif leading-relaxed max-h-[200px] overflow-y-auto">
                                            {episodes[currentEpisodeIndex]?.draftNovelContent || episodes[currentEpisodeIndex]?.usedSourceText || "未关联原文"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Full Mode Context - 可编辑
                            <div className="p-4 space-y-4 flex flex-col h-full">
                                {/* 编辑模式切换 */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-500">参考资料</span>
                                    <button
                                        onClick={() => setShowContextEditor(!showContextEditor)}
                                        className={`text-[10px] px-2 py-1 rounded-lg font-bold transition-all ${
                                            showContextEditor
                                                ? 'bg-primary text-white'
                                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                        }`}
                                    >
                                        {showContextEditor ? '✓ 编辑中' : '✎ 编辑'}
                                    </button>
                                </div>

                                {/* 分集大纲 */}
                                <div className="flex-1 min-h-0 flex flex-col">
                                    <div className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center justify-between">
                                        <span>分集大纲</span>
                                        <span className="text-[10px] text-gray-300 font-normal">{editableOutlineContext.length} 字</span>
                                    </div>
                                    {showContextEditor ? (
                                        <textarea
                                            value={editableOutlineContext}
                                            onChange={(e) => setEditableOutlineContext(e.target.value)}
                                            className="flex-1 min-h-[120px] text-xs text-gray-600 bg-white p-3 rounded-lg leading-relaxed border border-primary/30 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none"
                                            placeholder="输入分集大纲..."
                                        />
                                    ) : (
                                        <div className="flex-1 min-h-[120px] max-h-[200px] overflow-y-auto text-xs text-gray-600 bg-gray-50 p-3 rounded-lg leading-relaxed whitespace-pre-wrap border border-gray-100">
                                            {editableOutlineContext || "暂无大纲信息（点击编辑添加）"}
                                        </div>
                                    )}
                                </div>

                                {/* 小说原文 */}
                                <div className="flex-1 min-h-0 flex flex-col">
                                    <div className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center justify-between">
                                        <span>小说原文片段</span>
                                        <span className="text-[10px] text-gray-300 font-normal">{editableNovelContext.length} 字</span>
                                    </div>
                                    {showContextEditor ? (
                                        <textarea
                                            value={editableNovelContext}
                                            onChange={(e) => setEditableNovelContext(e.target.value)}
                                            className="flex-1 min-h-[150px] text-xs text-gray-500 bg-white p-3 rounded-lg leading-relaxed border border-yellow-300 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-200 outline-none resize-none font-serif"
                                            placeholder="粘贴小说原文..."
                                        />
                                    ) : (
                                        <div className="flex-1 min-h-[150px] max-h-[250px] overflow-y-auto text-xs text-gray-500 bg-yellow-50/50 p-3 rounded-lg leading-relaxed whitespace-pre-wrap border border-yellow-100 font-serif">
                                            {editableNovelContext || "暂无原文信息（点击编辑添加）"}
                                        </div>
                                    )}
                                </div>

                                {/* 提示信息 */}
                                {showContextEditor && (
                                    <div className="text-[10px] text-gray-400 bg-blue-50 p-2 rounded border border-blue-100">
                                        💡 修改后点击"开始审稿"将使用新的参考资料进行评估
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Center Column: Editor or Comparison Dashboard */}
            <div className="flex-1 flex flex-col min-w-[400px] relative">
                {auditMode === 'compare' ? (
                    // --- COMPARISON DASHBOARD ---
                    <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
                        {!comparisonReport ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <div className="w-24 h-24 bg-purple-50 rounded-full flex items-center justify-center mb-6">
                                    <Scale className="w-10 h-10 text-purple-300"/>
                                </div>
                                <h3 className="text-xl font-bold text-gray-600 mb-2">准备进行剧本 PK</h3>
                                <p className="text-sm max-w-md text-center">请在左侧上传同一集的多个版本剧本，AI 将从冲突、节奏、商业价值等多维度进行横向测评。</p>
                            </div>
                        ) : (
                            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                {/* Winner Banner */}
                                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-orange-100 rounded-3xl p-8 relative overflow-hidden shadow-lg">
                                    <div className="absolute top-0 right-0 p-6 opacity-20">
                                        <Trophy className="w-32 h-32 text-orange-400"/>
                                    </div>
                                    <div className="relative z-10">
                                        <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-orange-600 mb-4 shadow-sm border border-orange-200">
                                            <Trophy className="w-3.5 h-3.5"/> 最佳剧本
                                        </div>
                                        <h2 className="text-3xl font-extrabold text-gray-900 mb-4">{comparisonReport.winner}</h2>
                                        <p className="text-gray-700 leading-relaxed max-w-2xl text-sm font-medium">
                                            {comparisonReport.reasoning}
                                        </p>
                                    </div>
                                </div>

                                {/* Comparison Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {comparisonReport.items.sort((a,b) => a.rank - b.rank).map((item, idx) => (
                                        <div key={idx} className={`bg-white rounded-2xl p-6 shadow-sm border-2 flex flex-col ${item.rank === 1 ? 'border-orange-300 ring-4 ring-orange-50' : 'border-transparent'}`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-extrabold text-lg text-gray-500">
                                                    #{item.rank}
                                                </div>
                                                <div className={`text-2xl font-black ${item.score >= 90 ? 'text-green-500' : item.score >= 80 ? 'text-blue-500' : 'text-orange-500'}`}>
                                                    {item.score}
                                                </div>
                                            </div>
                                            <h3 className="font-bold text-gray-800 text-lg mb-2 truncate" title={item.fileName}>{item.fileName}</h3>
                                            <p className="text-xs text-gray-500 mb-4 h-10 line-clamp-2">{item.summary}</p>
                                            
                                            <div className="space-y-4 flex-1">
                                                <div className="bg-green-50 rounded-xl p-3">
                                                    <div className="flex items-center gap-1.5 text-xs font-bold text-green-700 mb-2">
                                                        <ThumbsUp className="w-3.5 h-3.5"/> 亮点
                                                    </div>
                                                    <ul className="text-[10px] text-gray-600 space-y-1 list-disc pl-3">
                                                        {item.pros.map((p, i) => <li key={i}>{p}</li>)}
                                                    </ul>
                                                </div>
                                                <div className="bg-red-50 rounded-xl p-3">
                                                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 mb-2">
                                                        <ThumbsDown className="w-3.5 h-3.5"/> 不足
                                                    </div>
                                                    <ul className="text-[10px] text-gray-600 space-y-1 list-disc pl-3">
                                                        {item.cons.map((p, i) => <li key={i}>{p}</li>)}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    // --- EXISTING EDITOR VIEW (Full / Single) ---
                    <>
                        {/* Toolbar */}
                        <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm z-10">
                            <div className="flex items-center gap-2">
                                <h2 className="font-bold text-gray-800">
                                    {auditMode === 'single' ? `第 ${episodes[currentEpisodeIndex]?.id} 集剧本` : '全本剧本'}
                                </h2>
                                {isBatchProcessing && <span className="text-xs text-purple-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> 全局优化中...</span>}
                                
                                {/* View Mode Toggle */}
                                {history.length > 1 && !previewVersion && (
                                    <div className="flex bg-gray-100 p-1 rounded-lg ml-2">
                                        <button onClick={() => setViewMode('edit')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'edit' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>编辑</button>
                                        <button onClick={() => setViewMode('diff')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'diff' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>对比</button>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <div className="relative">
                                    <button onClick={() => setShowHistory(!showHistory)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showHistory ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                        <History className="w-3.5 h-3.5"/> 历史 ({history.length}) <ChevronDown className="w-3 h-3"/>
                                    </button>
                                    {showHistory && (
                                        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 max-h-[300px] overflow-y-auto">
                                            {history.slice().reverse().map(ver => (
                                                <button key={ver.id} onClick={() => { setPreviewVersion(ver); setShowHistory(false); setViewMode('edit'); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                                                    <div className="flex justify-between items-center text-xs mb-1">
                                                        <span className="font-bold text-gray-700">{new Date(ver.timestamp).toLocaleTimeString()}</span>
                                                        <span className={`px-1.5 rounded text-[10px] ${ver.type === 'ai' ? 'bg-purple-100 text-purple-600' : ver.type === 'manual' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>{ver.type}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 truncate">{ver.note}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button onClick={handleManualSave} className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:text-green-600 hover:border-green-200"><Save className="w-3.5 h-3.5"/></button>
                                <button onClick={handleExport} className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-bold hover:bg-black flex items-center gap-1"><Download className="w-3.5 h-3.5"/> 导出</button>
                            </div>
                        </div>

                        {/* Preview Banner */}
                        {previewVersion && (
                            <div className="bg-amber-50 px-4 py-2 flex items-center justify-between border-b border-amber-100">
                                <span className="text-xs font-bold text-amber-700 flex items-center gap-2"><Eye className="w-4 h-4"/> 正在预览历史版本: {new Date(previewVersion.timestamp).toLocaleTimeString()}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => { if(confirm("确定恢复？")) { updateScript(previewVersion.content); saveVersion(previewVersion.content, `恢复版本`, 'manual'); setPreviewVersion(null); } }} className="px-3 py-1 bg-amber-500 text-white rounded text-xs font-bold hover:bg-amber-600">恢复此版本</button>
                                    <button onClick={() => setPreviewVersion(null)} className="px-3 py-1 bg-white border border-amber-200 text-amber-600 rounded text-xs font-bold">退出预览</button>
                                </div>
                            </div>
                        )}

                        {/* Editor Content */}
                        <div className="flex-1 overflow-y-auto relative bg-paper-dark/10">
                            {viewMode === 'diff' && !previewVersion ? (
                                <div className="min-h-full bg-white shadow-soft m-4 md:m-8 rounded-lg p-8 relative">
                                    <h4 className="text-sm font-bold text-gray-500 mb-4 border-b pb-2">修改对比 (Current vs Previous)</h4>
                                    <DiffTextView
                                      oldText={diffBaseVersion}
                                      newText={script}
                                      containerClassName="whitespace-pre-wrap font-mono text-base leading-loose p-8 bg-white/50 rounded-lg relative"
                                    />
                                    <button onClick={() => setViewMode('edit')} className="absolute bottom-8 right-8 bg-primary text-white px-4 py-2 rounded-full shadow-lg font-bold hover:scale-105 transition-transform z-30 flex items-center gap-1">
                                        <ArrowRight className="w-4 h-4"/> 返回编辑
                                    </button>
                                </div>
                            ) : (
                                <textarea
                                    ref={editorRef}
                                    className={`w-full min-h-full p-8 resize-none outline-none font-mono text-base leading-loose text-gray-800 bg-gray-50/30 focus:bg-white transition-colors ${previewVersion ? 'cursor-not-allowed opacity-70' : ''}`}
                                    value={previewVersion ? previewVersion.content : script}
                                    onChange={(e) => !previewVersion && updateScript(e.target.value)}
                                    onSelect={handleTextSelect}
                                    readOnly={!!previewVersion}
                                    spellCheck={false}
                                    placeholder="剧本内容..."
                                />
                            )}

                            {/* Quick Batch Actions (Bottom Overlay) - Only for Full Mode or manual single mode */}
                            {!previewVersion && viewMode === 'edit' && auditMode === 'full' && (
                                <div className="absolute bottom-4 left-4 flex gap-2">
                                    <button onClick={() => handleBatchFix('visualize_actions')} disabled={isBatchProcessing} className="px-3 py-1.5 text-[10px] font-bold text-purple-700 bg-white/90 border border-purple-100 shadow-lg rounded-full hover:bg-purple-50 flex items-center gap-1 backdrop-blur-sm"><Wand2 className="w-3 h-3"/> 动作可视化</button>
                                    <button onClick={() => handleBatchFix('remove_os')} disabled={isBatchProcessing} className="px-3 py-1.5 text-[10px] font-bold text-blue-700 bg-white/90 border border-blue-100 shadow-lg rounded-full hover:bg-blue-50 flex items-center gap-1 backdrop-blur-sm"><X className="w-3 h-3"/> 精简OS</button>
                                </div>
                            )}

                            {/* Fix Option Modal (For Deep Audit) */}
                            {selectedAnnotationId && fixOptions && (
                                <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-4 animate-in slide-in-from-bottom-10 z-20">
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="text-sm font-bold text-gray-700 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500"/> AI 优化建议</div>
                                        <button onClick={() => setFixOptions(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
                                    </div>
                                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                                        {fixOptions.map((opt, i) => (
                                            <div key={i} className="p-4 border border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-all group" onClick={() => applyFix(opt)}>
                                                <div className="flex justify-between mb-2"><span className="text-xs font-bold text-gray-400 uppercase">方案 {i+1}</span><span className="text-[10px] text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity font-bold">点击应用</span></div>
                                                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{opt}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Right Column: Audit Report & Assistant */}
            <div className="w-1/3 min-w-[320px] bg-white border-l border-gray-200 flex flex-col shadow-lg z-20">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        {auditMode === 'full' ? <LayoutList className="w-5 h-5 text-gray-600"/> : (auditMode === 'compare' ? <Scale className="w-5 h-5 text-purple-600"/> : <MessageSquare className="w-5 h-5 text-gray-600"/>)}
                        <span className="font-bold text-gray-800">{auditMode === 'full' ? 'AI 主编审稿' : (auditMode === 'compare' ? 'PK 结果详情' : '编剧助手')}</span>
                    </div>
                    <div className="flex gap-2">
                        <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none">
                            {AVAILABLE_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-50/30">
                    {/* Content Area for Right Panel */}
                    <div className="flex-1 overflow-y-auto p-4" ref={reportRef}>
                        
                        {/* 1. Full Mode: Show Deep Audit Report */}
                        {auditMode === 'full' && (
                            <>
                                {!report ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                                            {isAuditing ? <Loader2 className="w-8 h-8 text-purple-500 animate-spin"/> : <Eye className="w-8 h-8 text-gray-400"/>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-700 text-lg mb-2">
                                                {isAuditing ? (batchProgress ? `分批审稿中 (${batchProgress.current}/${batchProgress.total})` : "全本深度审稿中...") : "全本审稿就绪"}
                                            </h3>
                                            <p className="text-xs text-gray-500 max-w-[200px] mx-auto leading-relaxed">
                                                {isAuditing && batchProgress ? batchProgress.message : "将从剧情逻辑、人设一致性、节奏把控等宏观维度对整本剧本进行体检。"}
                                            </p>
                                            {!isAuditing && script.length > 100000 && (
                                                <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                                                    💡 检测到超长剧本 ({Math.round(script.length / 10000)}万字)
                                                    <br />
                                                    建议使用 <strong>Claude Opus 4.6 ⭐</strong> 获得完整评估
                                                </div>
                                            )}
                                            {isAuditing && batchProgress && (
                                                <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                                                    <div
                                                        className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                                                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        {!isAuditing && (
                                            <button onClick={handleRunAudit} className="bg-gray-900 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
                                                <Play className="w-4 h-4 fill-current"/> 开始审稿
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                        {/* Score Card */}
                                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                            <div className="flex items-center justify-between mb-4">
                                                <div><div className="text-xs text-gray-400 font-bold uppercase">综合评分</div><div className={`text-4xl font-extrabold ${getScoreColor(report.totalScore).split(' ')[0]}`}>{report.totalScore}</div></div>
                                                <button onClick={handleRunAudit} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800 bg-gray-50 px-2 py-1 rounded"><RefreshCw className="w-3 h-3"/> 重审</button>
                                            </div>
                                            <div className="space-y-3">
                                                {report.dimensionScores.map((ds, i) => (
                                                    <div key={i}>
                                                        <div className="flex justify-between text-xs font-bold text-gray-600 mb-1"><span>{ds.dimension}</span><span>{ds.score}</span></div>
                                                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden"><div className={`h-full rounded-full ${ds.score > 80 ? 'bg-green-500' : ds.score > 60 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{width: `${ds.score}%`}}></div></div>
                                                        <div className="text-[10px] text-gray-400 mt-0.5 whitespace-pre-wrap">{ds.comment}</div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-4 pt-3 border-t border-gray-50 text-xs text-gray-500 italic leading-relaxed">“{report.summary}”</div>
                                        </div>
                                        {/* Annotations */}
                                        <div className="space-y-3">
                                            {report.annotations.sort((a,b) => a.score - b.score).map((anno) => (
                                                <div key={anno.id} onClick={() => handleAnnotationClick(anno)} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedAnnotationId === anno.id ? 'bg-purple-50 border-purple-400 shadow-md transform scale-[1.02]' : anno.status === 'fixed' ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200 hover:border-purple-200 hover:shadow-sm'}`}>
                                                    <div className="flex justify-between items-start mb-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${anno.score === 0 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`}>{anno.dimension}</span>{anno.status === 'fixed' && <CheckCircle2 className="w-4 h-4 text-green-500"/>}</div>
                                                    <div className="text-sm font-bold text-gray-800 mb-1">{anno.issue}</div>
                                                    <div className="text-xs text-gray-400 line-clamp-1 italic mb-2 pl-2 border-l-2 border-gray-200">"{anno.location.lineContent}"</div>
                                                    <div className="text-xs text-gray-600 bg-white/50 p-2 rounded leading-relaxed"><span className="font-bold text-purple-600">建议：</span>{anno.suggestion}</div>
                                                    {selectedAnnotationId === anno.id && anno.status !== 'fixed' && (
                                                        <div className="mt-3 flex gap-2"><button onClick={(e) => { e.stopPropagation(); handleGenerateFix(anno); }} disabled={isGeneratingFix} className="flex-1 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 flex items-center justify-center gap-1">{isGeneratingFix ? <Loader2 className="w-3 h-3 animate-spin"/> : <Zap className="w-3 h-3 text-yellow-300"/>} AI 优化</button></div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* 2. Single Mode: Chat Assistant + Single Episode Audit */}
                        {auditMode === 'single' && (
                            <div className="space-y-4">
                                {/* Chat Area */}
                                <div className="space-y-3 mb-6">
                                    {chatHistory.length === 0 && (
                                        <div className="text-center p-4 bg-white rounded-xl border border-gray-100 text-xs text-gray-500">
                                            选中剧本文字，我来帮你修改...
                                        </div>
                                    )}
                                    {chatHistory.map((msg, i) => (
                                        <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            {msg.quotedText && <div className="max-w-[90%] px-2 py-1 bg-yellow-50 border-l-2 border-yellow-400 text-[10px] text-gray-500 rounded italic truncate">"{msg.quotedText.substring(0,20)}..."</div>}
                                            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-accent text-white' : 'bg-white border border-gray-100 text-gray-700'}`}>{msg.text}</div>
                                        </div>
                                    ))}
                                    {isChatProcessing && <div className="flex gap-1"><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></span></div>}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Single Audit Action */}
                                <div className="border-t border-gray-100 pt-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-gray-700 text-sm">本集审稿意见</h4>
                                        <button onClick={handleRunAudit} disabled={isAuditing} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-black disabled:opacity-50">
                                            {isAuditing ? <Loader2 className="w-3 h-3 animate-spin"/> : <Zap className="w-3 h-3 text-yellow-400"/>} 
                                            {singleEpAuditItems.length > 0 ? "重新审稿" : "一键审稿"}
                                        </button>
                                    </div>
                                    
                                    {/* Single Audit Items List */}
                                    <div className="space-y-3">
                                        {singleEpAuditItems.map((item) => (
                                            <div 
                                                key={item.id} 
                                                onClick={() => findAndScrollToText(item.targetQuote || "")}
                                                className={`p-3 rounded-xl border bg-white cursor-pointer transition-all ${item.status === 'applied' ? 'opacity-50 border-green-200' : 'hover:shadow-md hover:border-accent/30'}`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex gap-2">
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{item.category}</span>
                                                        {getSeverityBadge(item.severity)}
                                                    </div>
                                                    {item.status === 'applied' ? <CheckCircle2 className="w-3 h-3 text-green-500"/> : <Search className="w-3 h-3 text-gray-300"/>}
                                                </div>
                                                <div className="text-xs font-bold text-gray-800 mb-1">{item.issue}</div>
                                                {item.targetQuote && (
                                                    <div className="text-[10px] text-gray-400 italic mb-2 pl-2 border-l-2 border-gray-100 line-clamp-1">
                                                        "{item.targetQuote}"
                                                    </div>
                                                )}
                                                <div className="text-[10px] text-gray-600 bg-gray-50 p-1.5 rounded mb-2">{item.suggestion}</div>
                                                {item.status !== 'applied' && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleApplySingleAudit(item); }} disabled={isChatProcessing} className="w-full text-[10px] bg-accent/10 text-accent font-bold py-1.5 rounded hover:bg-accent/20">应用修改</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. Comparison Mode: Detailed Stats */}
                        {auditMode === 'compare' && (
                            <div className="h-full flex flex-col justify-center items-center text-gray-400 text-sm">
                                {comparisonReport ? (
                                    <div className="w-full h-full overflow-y-auto space-y-4">
                                        <div className="bg-white p-4 rounded-xl border border-gray-100">
                                            <h4 className="font-bold text-gray-800 mb-2">评测总结</h4>
                                            <p className="text-xs text-gray-600 leading-relaxed">{comparisonReport.reasoning}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <p>请在左侧上传剧本，右侧查看对比详情。</p>
                                        <p className="text-xs mt-2 opacity-60">AI 将自动生成对比雷达图与优劣势分析。</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Chat Input Area (Only visible in Single Mode) */}
                    {auditMode === 'single' && (
                        <div className="p-3 bg-white border-t border-gray-100">
                            {selectedText && (
                                <div className="mb-2 p-1.5 bg-accent/5 border border-accent/20 rounded flex items-center justify-between">
                                    <div className="flex items-center gap-1 overflow-hidden">
                                        <Quote className="w-3 h-3 text-accent shrink-0"/>
                                        <span className="text-[10px] text-accent truncate max-w-[150px]">{selectedText}</span>
                                    </div>
                                    <button onClick={() => setSelectedText(null)}><X className="w-3 h-3 text-gray-400"/></button>
                                </div>
                            )}
                            <form onSubmit={handleChatSubmit} className="relative">
                                <input 
                                    className="w-full bg-gray-100 border-none rounded-lg pl-3 pr-10 py-2.5 text-xs outline-none focus:ring-1 focus:ring-accent"
                                    placeholder="输入指令..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    disabled={isChatProcessing}
                                />
                                <button type="submit" disabled={!chatInput.trim() || isChatProcessing} className="absolute right-1.5 top-1.5 p-1 bg-white rounded shadow-sm text-accent hover:text-teal-600 disabled:opacity-50">
                                    <Send className="w-4 h-4"/>
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};

export default ScriptAuditor;
