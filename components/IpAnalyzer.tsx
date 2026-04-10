/**
 * IP 价值分析落地页
 * 评估小说短剧改编适配度，展示8维度评分和改编策略建议
 */

import React, { useState, useCallback, useMemo } from 'react';
import { HelpCircle, BarChart3, Sparkles, ChevronRight, RotateCcw, Home, BookOpen, FileDown } from 'lucide-react';
import { analyzeIpValue } from '../services/gemini/ipAnalysis';
import { AVAILABLE_MODELS, getRecommendedModel } from '../services/apiClient';
import type { IpAnalysisReport, IpDimensionScore, Chapter } from '../types';

// ==================== 类型定义 ====================

interface ProgressState {
  current: number;
  total: number;
  message: string;
  phase: 'preparing' | 'analyzing' | 'scoring' | 'finalizing' | 'complete' | 'error';
}

interface LiveDimensionScore {
  dimension: string;
  score: number | null;
  comment: string;
}

interface IpAnalyzerProps {
  novelChapters: Chapter[];
  novelName: string;
  initialReport?: IpAnalysisReport | null;
  onComplete: (report: IpAnalysisReport) => void;
  onAutoSave?: (report: IpAnalysisReport) => void;
  onAbort: () => void;
  apiKey: string;
  baseUrl?: string;
  onNewProject: () => void;
  onGoBack: () => void;
}

// ==================== 常量 ====================

const DIMENSION_LABELS: Record<string, { label: string; desc: string }> = {
  '剧情节奏': { label: '剧情节奏', desc: '爽点密度、情绪起伏' },
  '人物塑造': { label: '人物塑造', desc: '人物立体度、成长弧' },
  '短剧改编适配度': { label: '短剧适配度', desc: '场景数量、章节长度' },
  '世界观设定': { label: '世界观设定', desc: '视觉化可行性、AI制作适配度' },
  '冲突强度': { label: '冲突强度', desc: '矛盾尖锐程度' },
  '情感共鸣': { label: '情感共鸣', desc: '催泪/爽点密度' },
  '钩子设计': { label: '钩子设计', desc: '开篇吸引力' },
  '叙事结构': { label: '叙事结构', desc: '主线清晰度' },
};

// ==================== 工具函数 ====================

function getScoreColor(score: number): { bg: string; text: string; border: string } {
  if (score >= 85) return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400' };
  if (score >= 70) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-400' };
  if (score >= 55) return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-400' };
  if (score >= 40) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-400' };
  return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-400' };
}

function getScoreLabel(score: number): string {
  if (score >= 86) return '优秀';
  if (score >= 71) return '良好';
  if (score >= 55) return '中等';
  if (score >= 40) return '较差';
  return '很差';
}

function getTotalScoreColor(score: number): { bg: string; text: string; shadow: string } {
  if (score >= 80) return { bg: 'from-emerald-400 to-teal-500', text: 'text-white', shadow: 'shadow-emerald-500/30' };
  if (score >= 65) return { bg: 'from-green-400 to-emerald-500', text: 'text-white', shadow: 'shadow-green-500/30' };
  if (score >= 50) return { bg: 'from-amber-400 to-orange-500', text: 'text-white', shadow: 'shadow-amber-500/30' };
  if (score >= 35) return { bg: 'from-orange-400 to-red-500', text: 'text-white', shadow: 'shadow-orange-500/30' };
  return { bg: 'from-red-500 to-rose-600', text: 'text-white', shadow: 'shadow-red-500/30' };
}

// ==================== 子组件 ====================

const DimensionScoreBar: React.FC<{
  dimension: string;
  score: IpDimensionScore | LiveDimensionScore;
  isLive?: boolean;
}> = ({ dimension, score, isLive }) => {
  const info = DIMENSION_LABELS[dimension] || { label: dimension, desc: '' };
  const scoreNum = 'score' in score ? score.score : null;
  const comment = ('comment' in score && score.comment) ? score.comment : '';
  const color = scoreNum !== null ? getScoreColor(scoreNum) : { bg: 'bg-slate-50', text: 'text-gray-400', border: 'border-gray-100' };

  return (
    <div className="py-3 px-4 mb-2 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-all duration-300 group">
      {/* Top row: label + bar + score + badge */}
      <div className="flex items-center gap-4">
        <div className="w-28 flex-shrink-0">
          <div className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">{info.label}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{info.desc}</div>
        </div>
        <div className="flex-1 relative">
          <div className="h-3 bg-slate-100/80 rounded-full overflow-hidden shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out relative ${scoreNum !== null ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-slate-200 animate-pulse'}`}
              style={{ width: scoreNum !== null ? `${scoreNum}%` : '0%' }}
            >
              {scoreNum !== null && (
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
              )}
            </div>
          </div>
        </div>
        <div className="w-14 text-right flex-shrink-0">
          {scoreNum !== null ? (
            <span className={`font-black text-lg ${color.text} drop-shadow-sm`}>{scoreNum}</span>
          ) : (
            <span className="text-sm font-bold text-slate-300 animate-pulse">--</span>
          )}
        </div>
        <div className="w-14 text-right flex-shrink-0">
          {scoreNum !== null && !isLive ? (
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold shadow-sm ${color.bg} ${color.text} border border-white`}>
              {getScoreLabel(scoreNum)}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">待评估</span>
          )}
        </div>
      </div>
      {/* Comment row: AI's reasoning for this score */}
      {comment && comment !== '暂无评语' && comment !== '正则提取' && !isLive && (
        <div className="mt-2 pl-28 ml-4">
          <p className="text-xs text-slate-500 leading-relaxed bg-slate-50/80 rounded-lg px-3 py-2 border-l-2 border-indigo-300/50 italic">
            {comment}
          </p>
        </div>
      )}
    </div>
  );
};

const StrategyCard: React.FC<{ report: IpAnalysisReport }> = ({ report }) => {
  const isHighFidelity = report.recommendation.strategy === 'high_fidelity';

  return (
    <div className={`backdrop-blur-sm rounded-[20px] p-4 ${isHighFidelity ? 'bg-emerald-50/80 border border-emerald-200/50' : 'bg-amber-50/80 border border-amber-200/50'}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${isHighFidelity ? 'bg-emerald-200' : 'bg-amber-200'}`}>
          {isHighFidelity ? '✓' : '⚡'}
        </div>
        <div>
          <div className={`font-bold text-lg ${isHighFidelity ? 'text-emerald-800' : 'text-amber-800'}`}>
            {isHighFidelity ? '推荐：高保真剧情压缩改编' : '建议：剔骨剥皮式结构魔改'}
          </div>
        </div>
      </div>
      <p className={`text-sm leading-relaxed ${isHighFidelity ? 'text-emerald-700' : 'text-amber-700'}`}>
        {report.recommendation.reasoning}
      </p>
    </div>
  );
};

const PhaseBadge: React.FC<{ phase: ProgressState['phase'] }> = ({ phase }) => {
  const config: Record<string, { label: string; color: string }> = {
    preparing: { label: '准备中', color: 'bg-gray-100 text-gray-600' },
    analyzing: { label: 'AI 分析中', color: 'bg-blue-100 text-blue-700' },
    scoring: { label: '评分计算中', color: 'bg-indigo-100 text-indigo-700' },
    finalizing: { label: '生成报告', color: 'bg-purple-100 text-purple-700' },
    complete: { label: '分析完成', color: 'bg-emerald-100 text-emerald-700' },
    error: { label: '分析失败', color: 'bg-red-100 text-red-700' },
  };
  const c = config[phase] || config.analyzing;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${c.color}`}>
      {phase === 'analyzing' && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />}
      {c.label}
    </span>
  );
};

// ==================== 评估标准弹窗 ====================

const SCORE_RANGES = [
  { range: '86–100', label: '神作级', color: 'bg-emerald-50 border-emerald-300 text-emerald-700', desc: '完美契合短剧逻辑，可直接做分镜。在所有 IP 中属于万里挑一的顶尖，甚至头部制片公司都会抢购。评审极不轻易给出此区间分数。' },
  { range: '76–85', label: '爆款潜质', color: 'bg-green-50 border-green-300 text-green-700', desc: '属于前 10% 的头部作品，具备爆款短剧改编基因。核心剧情张力强、爽点密集、角色有记忆点，只需专业编剧做精雕细琢。' },
  { range: '61–75', label: '勉强可拍', color: 'bg-yellow-50 border-yellow-300 text-yellow-700', desc: '有一定改编价值但需经过专业编剧大幅度"魔改"提纯。通常存在节奏拖沓、人设模糊或世界观过于复杂等问题，改编成本较高。' },
  { range: '41–60', label: '低于行业线', color: 'bg-orange-50 border-orange-300 text-orange-700', desc: '套路老旧、情绪拉扯不足、冲突节奏偏平。绝大多数普通网文都落在此区间。直接改编大概率数据惨淡，需要彻底重构为原创剧本。' },
  { range: '0–40', label: '致命缺陷', color: 'bg-red-50 border-red-300 text-red-700', desc: '毫无短剧改编价值，存在根本性叙事问题（如无主线、无冲突、人设崩塌等），建议直接放弃或推倒重来。' },
];

const DIMENSIONS_DETAIL = [
  { key: '剧情节奏', name: '剧情节奏', desc: '评估每5000字内是否至少出现1个"爽点"或"反转"，章末是否有足够的悬念钩子。短剧要求前30秒就抓人，节奏拖沓会直接导致用户划走。' },
  { key: '人物塑造', name: '人物塑造', desc: '评估主角是否具备"极端人设反差"（如扮猪吃虎、黑化逆袭），配角是否有功能性记忆点。短剧要求角色3秒被记住、3集有成长弧。' },
  { key: '短剧适配度', name: '短剧改编适配度', desc: '评估章节是否天然短小精悍（每集1-3分钟）、对白是否足够口语化、AI短剧化程度。长篇心理描写多、环境描写多的作品适配度会偏低。' },
  { key: '世界观设定', name: '世界观设定', desc: '评估视觉化可行性与AI制作适配度，规则是否简单到观众3秒内理解。过于庞杂的修仙等级体系、复杂政治设定在短剧中反而是减分项。' },
  { key: '冲突强度', name: '冲突强度', desc: '评估每集是否有"情绪爆点"（被欺辱后反杀、真相揭穿、身份逆转等），矛盾是否层层递进到高潮。平铺直叙、温吞水式推进是短剧大忌。' },
  { key: '情感共鸣', name: '情感共鸣', desc: '评估是否有能引发弹幕刷屏的"共情时刻"——催泪、解气、揪心。衡量标准：观众会不会忍不住截图分享或在评论区写"我哭了"。' },
  { key: '钩子设计', name: '钩子设计', desc: '专门评估前3章/前3集的"黄金开篇"。第一句话是否抓人？前30秒有没有构建出"必须看下去"的悬念？开篇直接决定了短剧的完播率。' },
  { key: '叙事结构', name: '叙事结构', desc: '评估主线是否一句话能说清、支线是否为主线服务而非干扰、每集结尾是否有"下集预告感"的天然断点。结构松散的作品改编工程量巨大。' },
];

interface CriteriaModalProps {
  onClose: () => void;
}

const CriteriaModal: React.FC<CriteriaModalProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#fcfbff] rounded-[28px] border border-purple-100/40 shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-100/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-100 to-fuchsia-100 flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-purple-600" />
            </div>
            <h2 className="font-bold text-gray-900 text-base">评估标准说明</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 flex items-center justify-center text-gray-500 transition-all"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Score Ranges */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-2.5 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-500">1</span>
              分值定义
            </h3>
            <div className="space-y-2">
              {SCORE_RANGES.map((r) => (
                <div key={r.range} className={`flex items-center gap-3 p-2.5 rounded-xl border ${r.color}`}>
                  <span className="text-xs font-black w-12 flex-shrink-0 text-center">{r.range}</span>
                  <span className="text-sm font-bold flex-shrink-0">{r.label}</span>
                  <span className="text-xs opacity-80">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 8 Dimensions */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-2.5 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-500">2</span>
              八大评估维度
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {DIMENSIONS_DETAIL.map((d, idx) => (
                <div key={d.key} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-black text-indigo-600">{idx + 1}</span>
                  </div>
                  <div>
                    <div className="font-bold text-gray-800 text-sm">{d.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{d.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Adaptation Strategy */}
          <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4">
            <h3 className="text-sm font-bold text-indigo-800 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              改编策略决策
            </h3>
            <div className="space-y-2 text-xs text-indigo-700">
              <div className="flex items-start gap-2">
                <span className="font-bold flex-shrink-0">高遵循度改编：</span>
                <span>总分 ≥ 65 且短剧适配度 ≥ 60，保留原著精华的剧情压缩改编</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold flex-shrink-0">魔改式改编：</span>
                <span>总分 &lt; 65 或短剧适配度 &lt; 60，需大幅度结构化重组</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all text-sm shadow-sm"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const IpAnalyzer: React.FC<IpAnalyzerProps> = ({
  novelChapters,
  novelName,
  initialReport,
  onComplete,
  onAutoSave,
  onAbort,
  apiKey,
  baseUrl,
  onNewProject,
  onGoBack,
}) => {
  const [progress, setProgress] = useState<ProgressState>({
    current: 0,
    total: 0,
    message: '准备开始分析...',
    phase: 'preparing',
  });
  const [liveScores, setLiveScores] = useState<LiveDimensionScore[]>([]);
  const [report, setReport] = useState<IpAnalysisReport | null>(initialReport || null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);

  // 模型选择状态
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const gemini3Pro = AVAILABLE_MODELS.find(m => m.id === '[次]gemini-3-pro-preview-thinking');
    return gemini3Pro ? gemini3Pro.id : getRecommendedModel('analysis');
  });
  const [fallbackModel, setFallbackModel] = useState<string>(() => {
    const gemini31Pro = AVAILABLE_MODELS.find(m => m.id === '[次]gemini-3.1-pro-preview' || m.id === '[次]gemini-3.1-pro-preview-thinking');
    return gemini31Pro ? gemini31Pro.id : getRecommendedModel('fallback');
  });
  const [enableGeminiFallback, setEnableGeminiFallback] = useState(true);

  const isFallbackModelSelected = selectedModel === fallbackModel;

  const getFallbackModel = (modelId: string): string => {
    const model = AVAILABLE_MODELS.find(m => m.id === modelId);
    return model?.fallback || getRecommendedModel('fallback');
  };

  // If we have an initialReport, set progress to complete immediately
  React.useEffect(() => {
    if (initialReport) {
      setReport(initialReport);
      setProgress({
        current: initialReport.dimensionScores.length,
        total: initialReport.dimensionScores.length,
        message: '已恢复分析结果',
        phase: 'complete',
      });
    }
  }, [initialReport]);

  const totalChars = useMemo(
    () => novelChapters.reduce((sum, ch) => sum + ch.content.length, 0),
    [novelChapters]
  );

  const isLongText = totalChars > 200000;

  const startAnalysis = useCallback(async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setError(null);
    setReport(null);
    setLiveScores(
      Object.keys(DIMENSION_LABELS).map(d => ({
        dimension: d,
        score: null,
        comment: '',
      }))
    );

    try {
      const novelText = novelChapters.map(ch => ch.content).join('\n\n');

      const result = await analyzeIpValue(novelText, novelName, {
        apiKey,
        baseUrl,
        modelId: selectedModel,
        fallbackModelId: enableGeminiFallback && !isFallbackModelSelected ? fallbackModel : undefined,
        onProgress: (current, total, message) => {
          setProgress({
            current,
            total,
            message,
            phase: 'analyzing',
          });
        },
      });

      setReport(result);
      if (onAutoSave) onAutoSave(result);
      setProgress({
        current: result.dimensionScores.length,
        total: result.dimensionScores.length,
        message: '分析完成！',
        phase: 'complete',
      });
    } catch (err: any) {
      console.error('[IP Analysis] Error:', err);
      setError(err.message || '分析过程中发生未知错误');
      setProgress(prev => ({ ...prev, phase: 'error' }));
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, novelChapters, novelName, apiKey, baseUrl, selectedModel, fallbackModel, enableGeminiFallback, isFallbackModelSelected]);

  // Auto-start on mount (only if no initialReport from IndexedDB restore)
  React.useEffect(() => {
    if (initialReport) return;
    const timer = setTimeout(() => {
      startAnalysis();
    }, 500);
    return () => clearTimeout(timer);
  }, [initialReport]);

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const liveTotalScore = useMemo(() => {
    const valid = liveScores.filter(s => s.score !== null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((sum, s) => sum + (s.score || 0), 0) / valid.length);
  }, [liveScores]);

  const handleExport = useCallback(async () => {
    if (!report) return;

    const currentName = (novelName || '小说IP价值分析').trim() || '小说IP价值分析';
    const confirmedName = window.prompt('请确认导出的项目名称', currentName);
    if (confirmedName === null) return;

    const finalName = confirmedName.trim() || currentName;
    const { exportIpAnalysisToDocx } = await import('../utils/docxGenerator');
    exportIpAnalysisToDocx(report, finalName);
  }, [report, novelName]);

  return (
    <div className="min-h-screen bg-slate-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50/40 via-slate-50 to-slate-50 font-sans relative">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] rounded-b-[28px] sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 mr-1">
                <button
                  onClick={onNewProject}
                  className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                  title="新建项目"
                >
                  <Home className="w-4 h-4" />
                </button>
                <button
                  onClick={onGoBack}
                  className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                  title="返回"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
              </div>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20 flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-gray-900 text-sm">IP 价值分析</h1>
                <p className="text-[10px] text-gray-400">评估小说短剧改编适配度</p>
              </div>
            </div>
            {/* Model Selector */}
            <div className="flex items-center gap-1.5">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isAnalyzing}
                className="text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 cursor-pointer disabled:opacity-50"
              >
                {AVAILABLE_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <label className={`flex items-center gap-1 whitespace-nowrap ${isFallbackModelSelected ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={enableGeminiFallback}
                  onChange={(e) => setEnableGeminiFallback(e.target.checked)}
                  disabled={isAnalyzing || isFallbackModelSelected}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-50"
                />
                <span className="text-[11px] font-bold text-gray-500">兜底</span>
              </label>
              {enableGeminiFallback && !isFallbackModelSelected && (
                <select
                  value={fallbackModel}
                  onChange={(e) => setFallbackModel(e.target.value)}
                  disabled={isAnalyzing}
                  className="text-xs font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 cursor-pointer disabled:opacity-50"
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={`fb-${m.id}`} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {/* 评估标准 Button */}
              <button
                onClick={() => setShowCriteriaModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                评估标准
              </button>
              
              {report && (
                <>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100/80 hover:bg-slate-200 text-slate-600 font-bold transition-all text-xs border border-slate-200 whitespace-nowrap flex-shrink-0"
                    title="导出 IP 价值分析为 Word"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    导出报告
                  </button>
                  <button
                    onClick={() => { setReport(null); startAnalysis(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100/80 hover:bg-slate-200 text-slate-600 font-bold transition-all text-xs border border-slate-200 whitespace-nowrap flex-shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    重新分析
                  </button>
                  <button
                    onClick={() => onComplete(report)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow shadow-indigo-500/25 transition-all text-xs whitespace-nowrap flex-shrink-0"
                  >
                    采纳并继续解构
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8">

        {/* Novel Info Card */}
        <div className="bg-white rounded-[28px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 mb-8 relative overflow-hidden transition-all duration-500">
          <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-500 to-indigo-600" />
          <h2 className="font-extrabold text-slate-800 text-lg mb-5 pl-2 tracking-wide">《{novelName}》</h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-gradient-to-b from-slate-50 to-white border border-slate-100 rounded-2xl p-4 text-center shadow-[0_2px_10px_rgba(0,0,0,0.01)]">
              <div className="text-3xl font-black text-indigo-600 tracking-tight">{novelChapters.length}</div>
              <div className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">章节数量</div>
            </div>
            <div className="bg-gradient-to-b from-slate-50 to-white border border-slate-100 rounded-2xl p-4 text-center shadow-[0_2px_10px_rgba(0,0,0,0.01)]">
              <div className="text-3xl font-black text-indigo-600 tracking-tight">
                {(totalChars / 10000).toFixed(1)}万
              </div>
              <div className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">总字数</div>
            </div>
            <div className="bg-gradient-to-b from-slate-50 to-white border border-slate-100 rounded-2xl p-4 text-center shadow-[0_2px_10px_rgba(0,0,0,0.01)] flex flex-col justify-center">
              <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">
                {isLongText ? '长篇分批' : '短篇单次'}
              </div>
              <div className="text-xs font-medium text-slate-400 mt-1.5 uppercase tracking-wider">分析模式</div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-rose-50/90 backdrop-blur-sm rounded-[20px] border border-rose-200/50 p-4 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-rose-500 text-lg">⚠️</span>
              <span className="font-bold text-rose-700 text-sm">分析失败</span>
            </div>
            <p className="text-sm text-rose-600 mb-3">{error}</p>
            <button
              onClick={() => { setError(null); startAnalysis(); }}
              className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-xl font-medium text-xs hover:from-rose-600 hover:to-pink-600 shadow-lg shadow-rose-500/25 transition-all"
            >
              重新分析
            </button>
          </div>
        )}

        {/* Analysis Progress / Results */}
        {report ? (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            
            {/* Top Row: Score + Strategy + Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Score Orb - compact */}
              <div className="lg:col-span-3 bg-white rounded-[28px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 text-center relative overflow-hidden flex flex-col items-center justify-center">
                <div className="absolute top-0 w-full h-1.5 bg-gradient-to-r from-blue-400 to-purple-500 left-0" />
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-3 font-bold">
                  IP 价值综合评分
                </div>
                <div className="relative inline-flex items-center justify-center w-28 h-28 mb-3">
                  <div className={`absolute inset-0 rounded-full ring-6 ${getTotalScoreColor(report.totalScore).bg}/10`} />
                  <div className="absolute inset-1 rounded-full ring-2 ring-indigo-100" />
                  <div className={`relative w-full h-full rounded-full bg-gradient-to-br ${getTotalScoreColor(report.totalScore).bg} shadow-xl ${getTotalScoreColor(report.totalScore).shadow} flex items-center justify-center overflow-hidden`}>
                    <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent rounded-full" />
                    <span className={`relative text-[42px] leading-[1] font-black drop-shadow-md ${getTotalScoreColor(report.totalScore).text}`}>
                      {report.totalScore}
                    </span>
                  </div>
                </div>
                <div className="text-[13px] text-slate-600 font-bold bg-slate-50 px-3 py-1.5 rounded-xl">
                  短剧适配度 <span className="font-black text-indigo-600 text-base mx-0.5">{report.shortDramaCompatibility}</span> 分
                </div>
                <div className="mt-2 text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full inline-block">
                  {report.totalScore >= 70 ? '改编潜力优秀' : report.totalScore >= 55 ? '改编潜力良好' : report.totalScore >= 40 ? '改编难度中等' : '改编难度较大'}
                </div>
              </div>

              {/* Summary + Strategy - takes majority width */}
              <div className="lg:col-span-9 flex flex-col gap-4">
                {/* Summary */}
                <div className="bg-white rounded-[28px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 relative overflow-hidden group flex-1">
                  <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-400 to-indigo-500" />
                  <h3 className="font-extrabold text-slate-800 mb-2 flex items-center gap-2 pl-2 text-sm">
                    <BarChart3 className="w-4 h-4 text-blue-500" /> 综合评价
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed pl-2 font-medium">{report.summary}</p>
                </div>

                {/* Strategy Recommendation */}
                <div className="bg-white rounded-[28px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                  <div className="bg-slate-50/50 px-5 py-3 border-b border-slate-100">
                    <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" /> 核心建议
                    </h3>
                  </div>
                  <div className="p-4">
                    <StrategyCard report={report} />
                  </div>
                </div>
              </div>
            </div>

            {/* AI Drama Style & Narrative Perspective - two compact cards */}
            {(report.aiDramaStyle || report.narrativePerspective) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* AI短剧类型适配度 */}
                {report.aiDramaStyle && (
                  <div className="bg-white rounded-[28px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-purple-400 to-pink-500" />
                    <h3 className="font-extrabold text-slate-800 text-sm mb-4 flex items-center gap-2 pl-2">
                      🎬 AI短剧类型适配度
                    </h3>
                    <div className="space-y-3 mb-4">
                      {([
                        { key: '2d_anime' as const, label: '2D动漫', emoji: '🎨', color: 'from-violet-500 to-purple-600' },
                        { key: '3d_anime' as const, label: '3D动漫', emoji: '🎮', color: 'from-cyan-500 to-blue-600' },
                        { key: 'ai_realistic' as const, label: 'AI仿真人', emoji: '🧑', color: 'from-amber-500 to-orange-600' },
                      ]).map(({ key, label, emoji, color }) => {
                        const score = report.aiDramaStyle!.scores[key];
                        const isRecommended = report.aiDramaStyle!.recommended === key;
                        return (
                          <div key={key} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${isRecommended ? 'bg-indigo-50/80 ring-2 ring-indigo-300/50' : 'bg-slate-50/50'}`}>
                            <span className="text-lg">{emoji}</span>
                            <span className={`text-sm font-bold w-20 flex-shrink-0 ${isRecommended ? 'text-indigo-700' : 'text-slate-600'}`}>
                              {label}
                              {isRecommended && <span className="ml-1 text-[10px] text-indigo-500">★推荐</span>}
                            </span>
                            <div className="flex-1 h-2.5 bg-slate-200/80 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-1000`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className={`text-sm font-black w-8 text-right ${isRecommended ? 'text-indigo-600' : 'text-slate-500'}`}>{score}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed bg-slate-50/80 rounded-lg px-3 py-2 border-l-2 border-purple-300/50 italic">
                      {report.aiDramaStyle.reasoning}
                    </p>
                  </div>
                )}

                {/* 叙事角度推荐 */}
                {report.narrativePerspective && (
                  <div className="bg-white rounded-[28px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-teal-400 to-emerald-500" />
                    <h3 className="font-extrabold text-slate-800 text-sm mb-4 flex items-center gap-2 pl-2">
                      🎭 叙事角度推荐
                    </h3>
                    <div className="flex gap-3 mb-4">
                      {([
                        { key: 'first-person' as const, label: '第一人称解说', desc: '以旁白/内心独白驱动叙事', emoji: '🗣️' },
                        { key: 'third-person' as const, label: '第三人称演绎', desc: '以角色对话和动作推进剧情', emoji: '🎬' },
                      ]).map(({ key, label, desc, emoji }) => {
                        const isSelected = report.narrativePerspective!.recommended === key;
                        return (
                          <div key={key} className={`flex-1 p-3 rounded-2xl border-2 transition-all ${isSelected ? 'border-teal-400 bg-teal-50/80 shadow-md' : 'border-slate-200 bg-slate-50/30'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{emoji}</span>
                              <span className={`text-sm font-bold ${isSelected ? 'text-teal-700' : 'text-slate-500'}`}>{label}</span>
                              {isSelected && <span className="text-[10px] bg-teal-500 text-white px-1.5 py-0.5 rounded-full font-bold">推荐</span>}
                            </div>
                            <p className={`text-[11px] ${isSelected ? 'text-teal-600' : 'text-slate-400'}`}>{desc}</p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed bg-slate-50/80 rounded-lg px-3 py-2 border-l-2 border-teal-300/50 italic">
                      {report.narrativePerspective.reasoning}
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* Dimension Scores - full width */}
            <div className="bg-white rounded-[28px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500" />
              <h3 className="font-extrabold text-slate-800 text-lg mb-5 flex items-center gap-2 pl-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" /> 维度详细评估
              </h3>
              <div className="bg-slate-50/50 p-4 rounded-[24px] border border-slate-100/50 grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1">
                {report.dimensionScores.map((ds) => (
                  <DimensionScoreBar
                    key={ds.dimension}
                    dimension={ds.dimension}
                    score={ds}
                  />
                ))}
              </div>
            </div>

            {/* Strengths & Weaknesses - full width */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-emerald-50/80 to-white rounded-[28px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-emerald-100/50 p-6">
                <h3 className="font-extrabold text-emerald-800 mb-4 flex items-center gap-2 text-lg">
                  <span>💪</span> 小说优势
                </h3>
                <ul className="space-y-3">
                  {report.strengths.slice(0, 5).map((s, i) => (
                    <li key={i} className="text-[15px] text-emerald-700 font-medium flex items-start gap-2.5">
                      <span className="text-emerald-400 mt-1 flex-shrink-0 text-xl leading-none">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gradient-to-br from-rose-50/80 to-white rounded-[28px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-rose-100/50 p-6">
                <h3 className="font-extrabold text-orange-800 mb-4 flex items-center gap-2 text-lg">
                  <span>⚠️</span> 改进空间
                </h3>
                <ul className="space-y-3">
                  {report.weaknesses.slice(0, 5).map((w, i) => (
                    <li key={i} className="text-[15px] text-orange-700 font-medium flex items-start gap-2.5">
                      <span className="text-orange-400 mt-1 flex-shrink-0 text-xl leading-none">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          /* Analysis in Progress */
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-[0_12px_48px_rgb(0,0,0,0.05)] p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-500 to-indigo-600" />
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2.5">
                <BookOpen className="w-5 h-5 text-indigo-500 animate-pulse" /> 正在深度分析中...
              </h3>
              <PhaseBadge phase={progress.phase} />
            </div>

            {/* Batch Progress (only for long texts) */}
            {isLongText && progress.total > 0 && (
              <div className="mb-6 bg-slate-50 rounded-2xl p-4 border border-slate-100 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-slate-600">分批解构进度</span>
                  <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-700 ease-out relative"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
                  </div>
                </div>
              </div>
            )}

            {/* Overall Progress */}
            <div className="mb-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-100/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">AI 认知深入度</span>
                <span className="text-[13px] font-black text-indigo-600">
                  {isLongText ? `${progressPercent}%` : (isAnalyzing ? '分析中...' : '准备就绪')}
                </span>
              </div>
              <div className="h-4 bg-slate-100 shadow-inner rounded-full overflow-hidden relative">
                <div
                  className={`h-full bg-gradient-to-r from-indigo-400 via-purple-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out relative ${isAnalyzing ? 'animate-pulse' : ''}`}
                  style={{ width: isLongText ? `${progressPercent}%` : (isAnalyzing ? '80%' : '0%'), backgroundSize: '200% 200%' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
                </div>
              </div>
              
              {/* Status Message */}
              <div className="text-center text-sm font-medium text-indigo-500/80 mt-4 animate-pulse">
                {progress.message}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center mt-6">
              <button
                onClick={onAbort}
                className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-[16px] bg-white border border-slate-200 text-slate-500 font-bold hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all text-sm shadow-sm"
              >
                取消分析
              </button>
            </div>
          </div>
        )}

        {/* Footer note */}
        <div className="text-center text-xs text-gray-400 mt-8 tracking-wider">
          Powered by AI · 评分仅供参考 · 改编策略需结合实际市场判断
        </div>

        {/* 评估标准弹窗 */}
        {showCriteriaModal && <CriteriaModal onClose={() => setShowCriteriaModal(false)} />}
      </div>
    </div>
  );
};

export default IpAnalyzer;
