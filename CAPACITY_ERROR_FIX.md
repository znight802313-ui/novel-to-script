# MixAI 流量过载错误修复说明

## 问题描述
在使用 MixAI 的 Claude 模型进行 AI 操作时，偶尔会遇到 500 错误：
```
CodeWhisperer Error: {"message":"I am experiencing high traffic, please try again","errorCode":"CAPACITY"}
```

## 修复方案

### 1. 自动重试机制
- 在 `apiClient.ts` 中添加了智能重试逻辑
- 默认重试 2 次，使用指数退避策略（1s, 2s, 最多5s）
- 自动识别可重试错误：500 系列错误、流量过载、429 限流、网络超时

### 2. 通用错误处理 Hook
- 创建了 `useCapacityErrorHandler` Hook，可在所有组件中复用
- 统一的流量过载错误检测和处理逻辑
- 友好的弹窗提示，推荐切换到更稳定的模型

### 3. 已集成的组件
以下组件已完全集成流量过载错误处理：

#### ✅ ScriptAuditor（主编审稿）
- 全本审稿、单集审稿、剧本对比
- 自动检测流量过载并显示弹窗
- 一键切换到 Gemini 3.0 Pro 并重新审稿

#### ✅ BlueprintEditor（故事蓝图解构）
- 小说分析、架构重跑、大纲重跑、人物档案重跑
- 所有 AI 调用都有流量过载保护
- 自动切换模型并重试

#### ✅ OutlineBuilder（分集大纲重构）
- 大纲生成
- 流量过载时提示切换模型

#### ✅ ScriptGenerator（剧本生成）
- 已添加弹窗组件
- 可在需要的地方手动调用错误处理

### 4. 修改的文件
- `services/apiClient.ts`: 添加重试机制和错误检测函数
- `utils/useCapacityErrorHandler.tsx`: 通用错误处理 Hook（新增）
- `components/ScriptAuditor.tsx`: 集成错误处理
- `components/BlueprintEditor.tsx`: 集成错误处理
- `components/OutlineBuilder.tsx`: 集成错误处理
- `components/ScriptGenerator.tsx`: 添加弹窗组件

## 使用方法

### 在新组件中使用

```typescript
import { useCapacityErrorHandler } from '../utils/useCapacityErrorHandler';

const MyComponent = () => {
  // 1. 使用 Hook
  const { CapacityErrorModal, handleError: handleCapacityError } = useCapacityErrorHandler();

  const [selectedModel, setSelectedModel] = useState('[次]gemini-3-pro-preview-thinking');

  // 2. 在 catch 块中处理错误
  const handleSomeAIOperation = async () => {
    try {
      // AI 操作...
    } catch (error: any) {
      // 检测流量过载错误
      const handled = handleCapacityError(
        error,
        selectedModel,
        (newModel) => setSelectedModel(newModel),
        handleSomeAIOperation // 可选：切换模型后自动重试
      );

      // 如果不是流量过载错误，显示其他错误提示
      if (!handled) {
        alert(`操作失败: ${error.message}`);
      }
    }
  };

  // 3. 在 return 中添加弹窗
  return (
    <div>
      <CapacityErrorModal />
      {/* 其他组件... */}
    </div>
  );
};
```

## 使用效果

### 重试日志示例
```
⚠️ 可重试错误 (尝试 1/3): I am experiencing high traffic
⏳ 第 1 次重试，等待 1000ms...
⚠️ 可重试错误 (尝试 2/3): I am experiencing high traffic
⏳ 第 2 次重试，等待 2000ms...
```

### 弹窗提示
如果重试 2 次后仍然失败，会弹出友好的提示窗口：
- 显示当前使用的模型名称
- 提供一键切换到 Gemini 3.0 Pro 的按钮
- 切换后自动重新执行操作（如果提供了重试回调）

## 技术细节

### 可重试错误判断
```typescript
const isRetryableError = (error: any, status?: number): boolean => {
  // 500 系列服务器错误
  if (status && status >= 500) return true;

  // 流量过载错误
  if (error.message?.includes('CAPACITY') ||
      error.message?.includes('high traffic') ||
      error.message?.includes('overloaded')) {
    return true;
  }

  // 429 限流错误
  if (status === 429 || error.message?.includes('rate limit')) return true;

  // 网络超时
  if (error.name === 'AbortError') return true;

  return false;
};
```

### 流量过载检测
```typescript
export const isCapacityError = (error: any): boolean => {
  return error.message?.includes('CAPACITY') ||
         error.message?.includes('high traffic') ||
         error.message?.includes('experiencing high traffic') ||
         error.message?.includes('overloaded');
};
```

## 推荐模型
- **Gemini 3.0 Pro** (`[次]gemini-3-pro-preview-thinking`): 稳定性高，适合各类任务
- **Claude Sonnet 4.6** (`claude-sonnet-4-6`): 性能强但流量大时可能过载

## 测试建议
1. 在各个功能中故意选择流量较大的 MixAI 模型
2. 观察控制台是否出现重试日志
3. 如果重试失败，检查是否弹出切换模型的提示窗口
4. 点击"切换到 Gemini 3.0 Pro"按钮，验证是否自动重新执行操作

---

**修复日期**: 2026-03-12
**修复人**: Claude Opus 4.5
