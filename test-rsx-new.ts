/**
 * RSX 模型测试脚本
 * 测试 claude-sonnet-4-6 和 claude-opus-4-6
 */
const RSX_KEY = 'sk-Dst53szvSd3nnKF1zu7hh5KADMaNRVSFAobY1WM4yxiOLU8k';
const BASE_URL = 'https://rsxermu666.cn/v1/chat/completions';

const testModel = async (modelId: string) => {
  console.log(`\n🧪 测试模型: ${modelId}`);
  console.log('='.repeat(50));

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RSX_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: '飞机是谁发明的' }],
        max_tokens: 1024,
        stream: false,
      }),
    });

    const data = await response.json();

    console.log(`HTTP Status: ${response.status}`);

    if (!response.ok) {
      console.log('❌ 错误响应:');
      console.log(JSON.stringify(data, null, 2));
      return { modelId, success: false, error: data.error?.message || JSON.stringify(data) };
    }

    console.log('✅ 成功响应:');
    console.log('内容:', data.choices?.[0]?.message?.content?.substring(0, 500) || '(空)');
    console.log('使用量:', data.usage);
    console.log('实际模型:', data.model);

    return { modelId, success: true, data };
  } catch (error: any) {
    console.log('❌ 请求失败:', error.message);
    return { modelId, success: false, error: error.message };
  }
};

const main = async () => {
  console.log('🚀 RSX 模型测试');
  console.log('='.repeat(50));

  const results = [];
  results.push(await testModel('claude-sonnet-4-6'));
  results.push(await testModel('claude-opus-4-6'));

  console.log('\n📊 测试结果汇总:');
  console.log('='.repeat(50));
  results.forEach(r => {
    console.log(`${r.success ? '✅' : '❌'} ${r.modelId}: ${r.success ? '成功' : '失败'}`);
    if (!r.success) {
      console.log(`   错误: ${r.error}`);
    }
  });
};

main();
