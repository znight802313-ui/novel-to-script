/**
 * 模型测试脚本
 * 测试所有5个模型的 API 调用是否正常
 */

import { callUniversalAPI, getAPIConfig } from './services/apiClient.ts';

// 从环境变量读取 API Key
const API_KEY = process.env.VITE_API_KEY || 'sk-KW7XVLjLAHeiMGPhQAPypobB99AjT96FftTLCgujCwT0UYuA';
const BASE_URL = 'https://once.novai.su/v1';

// 测试的模型列表
const MODELS_TO_TEST = [
  { id: '[次]claude-sonnet-4-5-thinking', name: 'Claude 4.5 Sonnet (次)' },
  { id: '[次]gemini-3-pro-preview-thinking', name: 'Gemini 3 Pro (次)' },
  { id: '[次]gemini-3-flash-preview', name: 'Gemini 3 Flash (次)' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (MixAI)' },
  { id: '[次]gpt-5.2', name: 'GPT-5.2 (次)' },
];

// 测试提示词
const TEST_PROMPT = '请用一句话介绍你自己。';

/**
 * 测试单个模型
 */
async function testModel(modelId, modelName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 测试模型: ${modelName}`);
  console.log(`   模型ID: ${modelId}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const startTime = Date.now();

    // 获取配置
    const config = getAPIConfig(API_KEY, BASE_URL, modelId);
    console.log(`✓ 配置获取成功`);
    console.log(`  - API Key: ${config.apiKey.substring(0, 10)}...`);
    console.log(`  - Base URL: ${config.baseUrl}`);

    // 调用 API
    console.log(`\n📡 发送请求...`);
    const response = await callUniversalAPI(
      config,
      modelId,
      [{ role: 'user', content: TEST_PROMPT }],
      {
        temperature: 0.7,
        maxTokens: 100,
        timeout: 30000, // 30秒超时
      }
    );

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 输出结果
    console.log(`\n✅ 调用成功！`);
    console.log(`⏱️  耗时: ${duration}秒`);
    console.log(`📝 响应内容:`);
    console.log(`   ${response.text.substring(0, 200)}${response.text.length > 200 ? '...' : ''}`);

    if (response.usage) {
      console.log(`\n📊 Token 使用:`);
      console.log(`   - Prompt: ${response.usage.prompt_tokens}`);
      console.log(`   - Completion: ${response.usage.completion_tokens}`);
      console.log(`   - Total: ${response.usage.total_tokens}`);
    }

    return { success: true, duration, response: response.text };

  } catch (error) {
    console.log(`\n❌ 调用失败！`);
    console.log(`🔴 错误信息: ${error.message}`);

    // 输出详细错误信息
    if (error.stack) {
      console.log(`\n📋 错误堆栈:`);
      console.log(error.stack.split('\n').slice(0, 3).join('\n'));
    }

    return { success: false, error: error.message };
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          剧本创作智能体 - 模型 API 测试工具              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\n📅 测试时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 15)}...`);
  console.log(`🌐 Base URL: ${BASE_URL}`);

  const results = [];

  // 逐个测试模型
  for (const model of MODELS_TO_TEST) {
    const result = await testModel(model.id, model.name);
    results.push({
      modelId: model.id,
      modelName: model.name,
      ...result,
    });

    // 等待1秒，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 输出汇总报告
  console.log('\n\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                      测试结果汇总                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  results.forEach((result, index) => {
    const status = result.success ? '✅ 成功' : '❌ 失败';
    const duration = result.duration ? `(${result.duration}s)` : '';
    console.log(`${index + 1}. ${status} ${result.modelName} ${duration}`);
    if (!result.success) {
      console.log(`   错误: ${result.error}`);
    }
  });

  console.log('');
  console.log(`📊 总计: ${results.length} 个模型`);
  console.log(`✅ 成功: ${successCount} 个`);
  console.log(`❌ 失败: ${failCount} 个`);
  console.log(`📈 成功率: ${((successCount / results.length) * 100).toFixed(1)}%`);

  // 如果有失败的模型，输出建议
  if (failCount > 0) {
    console.log('\n');
    console.log('💡 故障排查建议:');
    console.log('');

    const failedModels = results.filter(r => !r.success);
    failedModels.forEach(model => {
      console.log(`📌 ${model.modelName}:`);

      if (model.error.includes('404')) {
        console.log('   → 可能原因: 模型名称不正确或 API 不支持该模型');
        console.log('   → 建议: 检查 novai.su 的模型列表文档');
      } else if (model.error.includes('401') || model.error.includes('403')) {
        console.log('   → 可能原因: API Key 无效或没有权限');
        console.log('   → 建议: 检查 API Key 是否正确，是否有足够的配额');
      } else if (model.error.includes('超时')) {
        console.log('   → 可能原因: 网络连接问题或模型响应慢');
        console.log('   → 建议: 检查网络连接，或增加超时时间');
      } else if (model.error.includes('配额')) {
        console.log('   → 可能原因: API 配额已用完');
        console.log('   → 建议: 检查账户余额或等待配额重置');
      } else {
        console.log(`   → 错误信息: ${model.error}`);
      }
      console.log('');
    });
  }

  console.log('\n测试完成！\n');
}

// 运行测试
runTests().catch(error => {
  console.error('\n❌ 测试脚本执行失败:', error);
  process.exit(1);
});
