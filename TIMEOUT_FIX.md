# 超时问题修复说明

## 问题描述
深度审稿功能在处理 10 万字以上的剧本时，使用 Claude 模型会出现超时弹窗。

## 根本原因
原有的超时配置对于超长剧本（>10万字）不够充分：
- 原配置：10万字以上剧本，Claude 超时 10 分钟
- 实际情况：Claude 处理 10-15 万字的深度审稿可能需要 15-20 分钟

## 解决方案

### 修改的函数
在 `services/geminiService.ts` 中修改了 3 个函数的超时逻辑：

1. **`performDeepAudit()`** - 深度审稿（行 1085-1100）
2. **`auditScript()`** - 快速审核（行 962-976）
3. **`compareScripts()`** - 多版本对比（行 1266-1280）

### 新的超时配置

#### 分级超时策略

| 剧本长度 | Claude 模型超时 | 其他模型超时 |
|---------|----------------|-------------|
| < 5万字 | 5 分钟 (300s) | 3 分钟 (180s) |
| 5-10万字 | 10 分钟 (600s) | 8 分钟 (480s) |
| 10-15万字 | **15 分钟 (900s)** | **12 分钟 (720s)** |
| > 15万字 | **20 分钟 (1200s)** | **15 分钟 (900s)** |

#### 修改前后对比

**修改前：**
```typescript
if (scriptLength > 100000) {
  timeoutDuration = modelId.includes('claude') ? 600000 : 480000; // 10分钟/8分钟
} else if (scriptLength > 50000) {
  timeoutDuration = modelId.includes('claude') ? 480000 : 360000; // 8分钟/6分钟
}
```

**修改后：**
```typescript
if (scriptLength > 150000) {
  timeoutDuration = modelId.includes('claude') ? 1200000 : 900000; // 20分钟/15分钟
} else if (scriptLength > 100000) {
  timeoutDuration = modelId.includes('claude') ? 900000 : 720000; // 15分钟/12分钟
} else if (scriptLength > 50000) {
  timeoutDuration = modelId.includes('claude') ? 600000 : 480000; // 10分钟/8分钟
}
```

## 技术细节

### 超时机制工作原理
1. `geminiService.ts` 中的函数根据剧本长度计算 `timeoutDuration`
2. 将 `timeoutDuration` 传递给 `callUniversalAPI()` 的 `options.timeout` 参数
3. `apiClient.ts` 中的 `callUniversalAPI()` 使用 `AbortController` 实现超时控制
4. 如果超时，会抛出 "请求超时" 错误

### 为什么 Claude 需要更长时间？
- Claude 模型在深度分析时会进行更复杂的推理
- 特别是使用 `claude-sonnet-4-5-thinking` 等带思考链的模型
- 对于 10 万字以上的剧本，需要分析的上下文非常大

## 测试建议

### 测试场景
1. **5万字剧本** - 应在 5 分钟内完成
2. **10万字剧本** - 应在 15 分钟内完成
3. **15万字剧本** - 应在 20 分钟内完成

### 如果仍然超时
如果修改后仍然超时，可以考虑：

1. **进一步延长超时时间**
   - 将 20 分钟改为 30 分钟（1800000ms）

2. **优化 Prompt 长度**
   - 在 `performDeepAudit()` 中，`novelContext` 和 `outlineContext` 可以进一步压缩
   - 当前代码：`novelContext.substring(0, 5000)`
   - 可以改为：`novelContext.substring(0, 3000)`

3. **分批处理**
   - 将超长剧本拆分为多个部分
   - 分别审核后合并结果

## 用户体验优化建议

### 添加进度提示
在审稿过程中显示预估时间和进度条：

```typescript
// 在 ScriptAuditor.tsx 中添加
const estimatedTime = Math.ceil(script.length / 10000) * 1.5; // 每万字约1.5分钟
console.log(`预计需要 ${estimatedTime} 分钟，请耐心等待...`);
```

### 添加取消功能
允许用户在等待过程中取消审稿操作。

## 相关文件
- `services/geminiService.ts` - 主要修改文件
- `services/apiClient.ts` - 超时控制实现
- `components/ScriptAuditor.tsx` - 审稿界面（未修改）

## 修改日期
2026-02-05

## 修改人
Claude Code Assistant
