/**
 * 完整的模型测试脚本 - 包含所有6个模型
 */

import { callUniversalAPI, getAPIConfig } from './services/apiClient.ts';

const API_KEY = 'sk-KW7XVLjLAHeiMGPhQAPypobB99AjT96FftTLCgujCwT0UYuA';
const BASE_URL = 'https://once.novai.su/v1';

const MODELS_TO_TEST = [
  { id: '[限时]claude-4.5-sonnet-thinking', name: 'Claude 4.5 Sonnet (限时)' },
  { id: '[次]claude-sonnet-4-5-thinking', name: 'Claude 4.5 Sonnet (次)' },
  { id: '[次]gemini-3-pro-preview-thinking', name: 'Gemini 3 Pro (次)' },
  { id: '[次]gemini-3-flash-preview', name: 'Gemini 3 Flash (次)' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (MixAI)' },
  { id: '[次]gpt-5.2', name: 'GPT-5.2 (次)' },
];

async function testModel(modelId, modelName) {
  const separator = '='.repeat(60);
  console.log(`\n${separator}`);
  console.log(`🧪 测试: ${modelName}`);
  console.log(`   ID: ${modelId}`);
  console.log(separator);

  try {
    const startTime = Date.now();
    const config = getAPIConfig(API_KEY, BASE_URL, modelId);

    console.log(`✓ 配置: ${config.baseUrl}`);

    const response = await callUniversalAPI(
      config,
      modelId,
      [{ role: 'user', content: '请用一句话介绍你自己。' }],
      { temperature: 0.7, maxTokens: 100, timeout: 30000 }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ 成功！耗时: ${duration}秒`);
    console.log(`📝 响应: ${response.text.substring(0, 150)}...`);

    return { success: true, duration };
  } catch (error) {
    console.log(`\n❌ 失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          完整模型测试 (6个模型)                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const results = [];

  for (const model of MODELS_TO_TEST) {
    const result = await testModel(model.id, model.name);
    results.push({ ...model, ...result });
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                      测试结果汇总                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  results.forEach((r, i) => {
    const status = r.success ? '✅' : '❌';
    const time = r.duration ? `(${r.duration}s)` : '';
    console.log(`${i + 1}. ${status} ${r.name} ${time}`);
    if (!r.success) console.log(`   错误: ${r.error}`);
  });

  const successCount = results.filter(r => r.success).length;
  console.log(`\n📊 成功: ${successCount}/${results.length} (${((successCount/results.length)*100).toFixed(1)}%)\n`);
}

main().catch(console.error);
