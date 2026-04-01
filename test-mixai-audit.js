/**
 * 测试 MixAI 审稿功能
 */

import { callUniversalAPI, getAPIConfig } from './services/apiClient.ts';

const testMixAIAudit = async () => {
  console.log('测试 MixAI 模型审稿功能...\n');
  
  const modelId = 'claude-sonnet-4-5-20250929';
  const apiKey = 'sk-KW7XVLjLAHeiMGPhQAPypobB99AjT96FftTLCgujCwT0UYuA'; // 你的 API Key
  
  try {
    const config = getAPIConfig(apiKey, undefined, modelId);
    
    console.log('配置信息:');
    console.log('- Base URL:', config.baseUrl);
    console.log('- API Key:', config.apiKey.substring(0, 15) + '...');
    console.log('');
    
    const testScript = `
【第1集】
1-1 监狱门口 雨夜
⊿【画面：简初夏被推出监狱门】
简初夏（OS）：七年了，终于出来了。
    `;
    
    const prompt = `请对以下剧本进行简单审核，找出1-2个问题：\n${testScript}`;
    
    console.log('发送审稿请求...');
    const response = await callUniversalAPI(
      config,
      modelId,
      [{ role: 'user', content: prompt }],
      {
        temperature: 0.5,
        responseFormat: { type: 'json_object' },
        timeout: 60000
      }
    );
    
    console.log('\n✅ 审稿成功！');
    console.log('响应内容:', response.text.substring(0, 200) + '...');
    
  } catch (error) {
    console.log('\n❌ 审稿失败！');
    console.log('错误信息:', error.message);
    console.log('');
    console.log('可能的原因:');
    console.log('1. MixAI 的硬编码 API Key 已失效');
    console.log('2. MixAI 服务暂时不可用');
    console.log('3. 模型配额已用完');
    console.log('');
    console.log('解决方案:');
    console.log('- 使用其他模型（如 [次]Gemini 3 Pro）');
    console.log('- 或者在界面配置中输入你自己的 API Key');
  }
};

testMixAIAudit();
