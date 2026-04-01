/**
 * 测试 MixAI API 调用
 * 对比两种调用方式的差异
 */

// 方式1: 当前项目的调用方式（失败）
async function testCurrentMethod() {
  console.log('\n=== 方式1: 当前项目的调用方式 ===\n');
  
  const url = 'https://mixai.cc/chat/completions';
  const apiKey = 'sk-a7YqF4A9MnkAWjxq';
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.7,
        max_tokens: 10,
      }),
    });

    console.log('状态码:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    const text = await response.text();
    console.log('响应内容 (前200字符):', text.substring(0, 200));
    
    if (response.ok) {
      const data = JSON.parse(text);
      console.log('✅ 成功:', data.choices?.[0]?.message?.content);
    } else {
      console.log('❌ 失败');
    }
  } catch (error) {
    console.log('❌ 错误:', error.message);
  }
}

// 方式2: 尝试不同的 URL 格式
async function testAlternativeUrls() {
  console.log('\n=== 方式2: 测试不同的 URL 格式 ===\n');
  
  const apiKey = 'sk-a7YqF4A9MnkAWjxq';
  const urls = [
    'https://mixai.cc/v1/chat/completions',
    'https://mixai.cc/api/chat/completions',
    'https://mixai.cc/openai/v1/chat/completions',
  ];
  
  for (const url of urls) {
    console.log(`\n测试 URL: ${url}`);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      });

      console.log('  状态码:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('  ✅ 成功!');
        return;
      } else {
        const text = await response.text();
        console.log('  ❌ 失败:', text.substring(0, 100));
      }
    } catch (error) {
      console.log('  ❌ 错误:', error.message);
    }
  }
}

// 方式3: 检查 API Key 是否有效
async function testApiKeyValidity() {
  console.log('\n=== 方式3: 检查 API Key 有效性 ===\n');
  
  const apiKey = 'sk-a7YqF4A9MnkAWjxq';
  
  // 尝试访问根路径
  try {
    const response = await fetch('https://mixai.cc/', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    console.log('根路径状态码:', response.status);
    const text = await response.text();
    console.log('响应内容 (前200字符):', text.substring(0, 200));
  } catch (error) {
    console.log('错误:', error.message);
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              MixAI API 调用诊断工具                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  await testCurrentMethod();
  await testAlternativeUrls();
  await testApiKeyValidity();
  
  console.log('\n\n💡 诊断建议:');
  console.log('1. 如果所有 URL 都返回 HTML，说明 API Key 可能已失效');
  console.log('2. 如果某个 URL 返回 JSON，说明 URL 格式不正确');
  console.log('3. 如果返回 401/403，说明认证方式可能不对');
  console.log('\n');
}

runAllTests().catch(console.error);
