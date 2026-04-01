import React, { useState } from 'react';
import { isCapacityError } from '../services/apiClient';
import { AVAILABLE_MODELS } from '../services/geminiService';
import { Zap } from 'lucide-react';

interface CapacityErrorHandlerResult {
  showCapacityModal: boolean;
  CapacityErrorModal: React.FC;
  handleError: (error: any, currentModel: string, onSwitchModel: (newModel: string) => void, onRetry?: () => void) => boolean;
  closeModal: () => void;
}

/**
 * 通用的流量过载错误处理 Hook
 * 用于在所有组件中统一处理 MixAI 流量过载错误
 */
export const useCapacityErrorHandler = (): CapacityErrorHandlerResult => {
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [currentModelName, setCurrentModelName] = useState('');
  const [onSwitchCallback, setOnSwitchCallback] = useState<((newModel: string) => void) | null>(null);
  const [onRetryCallback, setOnRetryCallback] = useState<(() => void) | null>(null);

  /**
   * 处理错误，如果是流量过载错误则显示弹窗
   * @returns true 表示已处理（显示了弹窗），false 表示未处理（需要调用方自行处理）
   */
  const handleError = (
    error: any,
    currentModel: string,
    onSwitchModel: (newModel: string) => void,
    onRetry?: () => void
  ): boolean => {
    if (isCapacityError(error)) {
      const modelInfo = AVAILABLE_MODELS.find(m => m.id === currentModel);
      setCurrentModelName(modelInfo?.name || currentModel);
      setOnSwitchCallback(() => onSwitchModel);
      setOnRetryCallback(() => onRetry || null);
      setShowCapacityModal(true);
      return true;
    }
    return false;
  };

  const closeModal = () => {
    setShowCapacityModal(false);
  };

  const handleSwitchModel = () => {
    if (onSwitchCallback) {
      onSwitchCallback('[次]gemini-3-pro-preview-thinking');
    }
    setShowCapacityModal(false);

    // 自动重试（如果提供了回调）
    if (onRetryCallback) {
      setTimeout(() => {
        if (onRetryCallback) onRetryCallback();
      }, 500);
    }
  };

  const CapacityErrorModal: React.FC = () => {
    if (!showCapacityModal) return null;

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4 text-3xl">
              ⚠️
            </div>
            <h3 className="text-xl font-extrabold text-gray-800 mb-3">模型流量过载</h3>
            <p className="text-gray-600 text-sm mb-2">
              当前模型 <span className="font-bold text-primary">{currentModelName}</span> 正在经历高流量，请稍后重试。
            </p>
            <p className="text-gray-500 text-xs mb-6">
              或者切换到更稳定的模型继续操作
            </p>

            <div className="w-full space-y-3">
              <button
                onClick={handleSwitchModel}
                className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 shadow-lg flex items-center justify-center gap-2 transition-all"
              >
                <Zap className="w-5 h-5"/>
                切换到 Gemini 3.0 Pro（推荐）
              </button>

              <button
                onClick={closeModal}
                className="w-full py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                稍后重试
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return {
    showCapacityModal,
    CapacityErrorModal,
    handleError,
    closeModal,
  };
};
