import{g as k,c as O}from"./jsonUtils-ChUweEZt.js";import{p as L,a as H}from"./resultParser-BR-KXFNI.js";import{i as p,j as x,c as z}from"./index-BTLkYrd8.js";const y=(e,l,o="未设置")=>{const a=e??null,t=l??null;return a!==null&&t!==null?a===t?`${a}集`:`${a}-${t}集`:a!==null?`至少${a}集`:t!==null?`至多${t}集`:o},J=e=>{if(!e)return"";const l=e.progressPercent??0,o=y(e.remainingEpisodeRangeMin,e.remainingEpisodeRangeMax,"未设置"),a=y(e.expectedTotalEpisodesMin,e.expectedTotalEpisodesMax,"未设置");let t="前期铺垫阶段",g="当前仍处在前期，可以正常铺垫人物、关系和悬念，但不要让支线戏份压过主线。";l>=80?(t="接近尾声阶段",g="当前已经接近全文尾声，必须优先主线回收、冲突升级和结局兑现，禁止再无谓扩写新支线。"):l>=50&&(t="中后期推进阶段",g="当前处在中后期，应减少枝节、提高压缩率，把更多篇幅留给核心冲突推进与关键情绪高潮。");const $=e.remainingEpisodeRangeMax!==null&&e.remainingChapters>0?`- 如果剩余可用集数上限仅剩 ${e.remainingEpisodeRangeMax} 集，请主动收敛拆分密度，避免后半程集数失控。`:"";return`
【全局创作进度与预算】
- 总章节数：${e.totalChapters}
- 当前已处理章节数：${e.processedChapters}
- 当前进度百分比：${l}%
- 已生成集数：${e.generatedEpisodeCount}集
- 剩余章节数：${e.remainingChapters}章
- 期望整体剧集区间：${a}
- 剩余可用集数区间：${o}
${e.estimatedTotalEpisodes?`- 按当前节奏预估总集数：约 ${e.estimatedTotalEpisodes} 集`:"- 按当前节奏预估总集数：暂无（生成若干集后再评估）"}
- 当前阶段判断：${t}

【全局收敛规则（必须遵守）】
- 前期允许正常铺垫，但仍要保证每集都有清晰冲突、钩子或情绪推进。
- 中后期必须减少枝节、提高压缩率，合并重复信息与弱支线，集中火力推进主线。
- 接近尾声时，优先主线回收、冲突升级、结局兑现，禁止再无谓扩写支线或新增大支线。
- ${g}
${$}
`},Y=async(e,l,o,a,t,g="[次]gemini-3-pro-preview-thinking",$=null,f="",r=1,s=1,w="",d)=>{var R,S,T,I;const F=k(e,t,g),E=o.mainPlotArc.phases.map(n=>{const c=n.events.filter(i=>{if(!i.range)return!0;const u=p(i.range);if(u.length===0)return!0;const m=Math.min(...u),j=Math.max(...u);return m<=s&&j>=r});return c.length===0?null:`阶段：${n.phaseName}
事件：${c.map(i=>`${i.title} (重要度:${i.importance}星) - ${i.summary}`).join("; ")}`}).filter(Boolean).join(`

`),M=((S=(R=o.mysteryArc)==null?void 0:R.nodes)==null?void 0:S.filter(n=>{const c=p(n.foreshadowingChapter||""),i=p(n.payoffChapter||""),u=c.length>0&&Math.min(...c)<=s&&Math.max(...c)>=r,m=i.length>0&&Math.min(...i)<=s&&Math.max(...i)>=r;return u||m}).map(n=>{const c=p(n.foreshadowingChapter||"").some(m=>m>=r&&m<=s),i=p(n.payoffChapter||"").some(m=>m>=r&&m<=s);let u="";return c&&i?u="【🎯 本批次需铺设且回收该伏笔】":c?u="【🎯 本批次为伏笔铺垫首发节点】":i&&(u="【🎯 本批次为该暗线悬念回收节点】"),`${u}
起源/现状：${n.origin}
剧情牵引：${n.progress}
终极悬念：${n.suspense}`}).join(`

`))||"";let h=`
    **集数估算与拆分策略（短剧节奏）**：
    1. **评估信息密度**：请先仔细阅读本批次小说内容（第 ${r} 章到 ${s} 章）。
    2. **时长与压缩比**：
       - **单集时长**：每集短剧对应 **1分半到2分半** 的视频时长（约600-900字剧本）。
       - **压缩比例**：小说原文到剧本的压缩比应控制在 **40%-70%** 之间。
    3. **确定集数（重要）**：
       - **标准节奏**：通常 **1到3章的原文内容** 改编为 **1 集** 短剧是合理的节奏。
       - **高潮段落**：如果这部分内容高潮迭起（例如激烈对峙、重要反转），可以 **1章** 对应 **1集**。
       - **平淡段落**：如果这部分是日常过渡、环境描写，可以 **2-3章** 对应 **1集**。
       - **⚠️ 严禁过度压缩**：单集对应的章节数**不得超过3章**。即使内容平淡，也不要把4章或更多章节压缩成1集，这会导致剧情支离破碎、观众困惑。
    `;$?h+=`
    **强制要求**：请将本批次小说内容严格切分为 **${$} 集**。请注意分配均匀，不要前紧后松。`:h+=`
    4. **自主规划**：请基于上述原则，**自主规划**将这段内容拆分为几集最为合理。
       - **参考公式**：
       - 例如：10章内容应拆分为5-7 集。
       - 并在输出 JSON 的 \`pacing_strategy\` 字段中简要说明你的拆分逻辑。`,d&&(d.expectedTotalEpisodesMin!==null||d.expectedTotalEpisodesMax!==null)&&(h+=`
    **全局预算优先**：你必须结合整部作品的总集数目标来拆分本批次，当前剩余可用集数区间约为 **${y(d.remainingEpisodeRangeMin,d.remainingEpisodeRangeMax,"未设置")}**。如果预算偏紧，请主动提高压缩率，避免把有限集数浪费在弱支线和重复信息上。`);let P="";f&&(P=`
### 剧情连贯性要求 (最高优先级)
这是该剧的中间部分。
**上一集结尾/上下文**：${f.slice(-500)}
**要求**：本批次的第一集必须**自然流畅**地接上文。
1. 如果上集结尾是悬念，这集开头必须承接（解开或推进）。
2. **严禁断层**：不要突然跳跃时间线或场景，除非原著就是这么写的。
`);const v=J(d),A=(d?s>=d.totalChapters:!1)?`
【结尾集收尾要求】
- 本批次已经覆盖到整部作品的最终章节，最后一集必须承担全剧结尾功能。
- 最后一集除了可以保留必要的结尾情绪张力外，更重要的是给出明确的“结尾收尾”信息，用于说明主线如何落地、人物命运如何安放、情绪余韵如何收束。
- 终局集禁止为了强行续看而硬留悬念，优先保证结局兑现、关系落点和主题闭环。`:"",N=`
# Role
你是一名追求**逻辑严密**和**原著还原度**的精品短剧编剧。
你反感市面上那种为了“爽”而逻辑崩坏、强行降智的“无脑短剧”。你擅长在保留原著韵味的基础上，通过视听语言提升节奏感，而不是通过魔改剧情。

# Task
请阅读提供的【小说正文片段】，并结合【剧情主线架构】，将其改编为一份**分集大纲**。
起始集数编号为：${a}

### ⚠️ 章节覆盖与衔接要求 (关键)
本批次小说内容涵盖：**第 ${r} 章 至 第 ${s} 章**。
1. **全量覆盖**：你生成的这些集数**必须**完整覆盖从第 ${r} 章到第 ${s} 章的所有核心剧情，严禁漏掉中间的章节。
2. **严禁重叠**：每一集对应的章节范围**不得**与前后集重复。例如，如果第一集是“第1-2章”，第二集必须从“第3章”开始，不能也包含“第2章”。
3. **首尾衔接**：
   - 本批次第一集对应的起始章节必须是：**第 ${r} 章**。
   - 本批次最后一集对应的截止章节必须是：**第 ${s} 章**。

【宏观基调与上帝视角】（仅供了解全局逻辑和埋伏笔，切勿将未来剧情写进本批次）
- 故事精神内核（成长主轴）：${((T=o.growthArc)==null?void 0:T.summary)||"无"}
- 全局剧情轮廓（累计剧情摘要）：${o.summarySoFar||"暂无全局摘要"}
${(I=o.mysteryArc)!=null&&I.summary?`- 宿命与暗线全局提示：${o.mysteryArc.summary}`:""}
${M?`
【当前批次精准触发的暗线任务】：
${M}`:""}

【本集核心任务】（你当前必须严格执行的戏份）
本批次核心事件流：
${E?E.substring(0,3e3):"未匹配到本章核心主线事件，请完全依据小说原文进行过渡安排"} ...

${P}
${v}
${A}

【小说正文片段（第${r}-${s}章）】：
${l.substring(0,4e4)} ...

# Core Philosophy (短剧改编核心原则)
1.  **节奏先行 (Pacing First)**：
    -   **拒绝注水**：去掉原著中冗长的心理描写和环境铺垫。
    -   **快节奏切分**：确保每集都有明确的冲突、悬念或情绪高潮。
2.  **视觉化改编 (Visual Tension)**：
    -   将原著的心理描写转化为具象的动作、表情或视觉冲突。
    -   **适度压缩 (Smart Compression)**：将次要情节进行适度合并或略写，聚焦核心主线。
3.  **情节连贯与伏笔 (Logical Flow & Foreshadowing)**：
    -   在快节奏的同时保证基本的行为逻辑。
    -   **【暗线强制要求】**：如果本批次情节与上述的【宿命与暗线】有任何微小的关联，请务必在生成大纲时，利用 "foreshadowing" (伏笔) 或开篇/结尾钩子字段埋下悬念线索，切忌平铺直叙。
4.  **画面先行**：
    -   分集大纲的描述请尽量**画面化**。

${h}

${w?`
# 爆款创作技巧（重要）
用户提供了以下创作技巧要求，请在生成分集大纲时**严格遵循**这些指导原则：

${w}

**应用要求**：
- 在规划每一集的剧情时，将上述技巧融入到情节设计、冲突设置、悬念铺垫中
- 确保每集都能体现这些爆款元素，提升观众的观看体验
- 在 mainPlot 描述中体现这些技巧的应用
`:""}

# Output Requirements
**Metadata Extraction**:
- **targetChapter**: 【重要】必须标注**完整且连续**的章节，格式如”第5章”、”第5-6章”。
- **严禁**：章节重叠、章节跳跃、或使用模糊描述。
- **严禁半章**：不要写“第8章前半”“第8章后半”“第8章上半”“第8章下半”等部分章节定义。
- **严禁跨集重复章号**：同一章节号只能归属于一个剧集梗概。

# Output JSON Requirements
**CRITICAL**: You must output ONLY valid JSON. **DO NOT** include any conversational text.

{
  "pacing_strategy": "（请先分析本批次内容的信息密度，结合短剧快节奏要求，简述你的压缩和拆分策略，明确你要拆分成几集，以及每集对应哪几章。这有助于你进行精确的逻辑推演。）",
  "episodes": [
    {
      "title": "第X集：标题",
      "mainPlot": "剧情描述（300字左右）",${a===1?`
      "openingHook": "开篇情境",`:""}
      "endingHook": "结尾钩子或悬念（如果不是终局集，优先填写）",
      "endingClosure": "仅当本集是全剧结尾集时填写：这一集如何完成最终收尾、人物落点与情绪余韵",
      "keyQuotes": "本集原著金句",
      "foreshadowing": "本集伏笔",
      "worldSetting": "关键道具/规则",
      "targetChapter": "第X-Y章",
      "appearingCharacterNames": ["主角名", "配角名"]
    }
  ]
}
`;try{const n=await O(F,g,[{role:"user",content:N}],{responseFormat:{type:"json_object"},timeout:12e4,maxRetries:1}),c=await L(n.text,e,t);return x(c,r,s)}catch(n){throw console.error("Reconstruction Failed",n),n}},b=async(e,l,o)=>{const t=k(e,o,"[次]gemini-3-flash-preview"),g=`
你是一个专业的剧本大纲分析助手。
请分析以下【原始分集大纲】，并将其拆解分类为结构化数据。
**原则**：
1. **不改变原意**：尽量保留原始信息，只是做分类搬运。
2. **提取与归纳**：
   - **出场人物 (characterList)**：请提取所有人物，并尝试简要概括该人物在本集中的**人设状态/心理/目的**（例如："简初夏：刚出狱，满怀仇恨"）。
   - 将"开篇/开头/钩子"提取到 openingHook（如果没有就不提取，保留空）。
   - 将"伏笔/铺垫"提取到 foreshadowing。
   - 将"金句/台词"提取到 keyQuotes。
   - 将"背景/世界观/核心设定"提取到 worldSetting。
   - 将"对应章节"提取到 targetChapter。
   - **targetChapter 只能保留完整章节**：只允许“第8章”或“第8-9章”，禁止“第8章前半/后半”等半章写法。
   - **剧情梗概 (mainPlot)**：对应原大纲中的"剧情描述"内容，保持信息一致，不要随意删减。
3. 如果某项信息原文中没有，则留空。

【原始分集大纲】：
${l}

请输出 JSON 格式：
{
  "characterList": [{ "name": "人物姓名", "desc": "该人物本集的人设、状态或目的" }],
  "openingHook": "开篇钩子或看点(如果没有则留空)",
  "foreshadowing": "伏笔或铺垫(如果没有则留空)",
  "keyQuotes": "金句或关键台词",
  "worldSetting": "世界观、背景或核心设定",
  "mainPlot": "原剧集大纲信息中的剧情描述",
  "targetChapter": "对应的原著章节号"
}
`;try{const $=await O(t,"[次]gemini-3-flash-preview",[{role:"user",content:g}],{responseFormat:{type:"json_object"},timeout:6e4}),f=await H($.text,e,o);return{...f,targetChapter:z(f.targetChapter||"")}}catch($){return console.error("Outline Parsing Error:",$),{characterList:[],openingHook:"",foreshadowing:"",keyQuotes:"",worldSetting:"",mainPlot:l,targetChapter:""}}};export{Y as g,b as p};
