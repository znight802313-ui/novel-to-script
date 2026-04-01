import{g as E,c as _,d as O,e as I,s as b}from"./jsonUtils-BOgOPRl5.js";import{b as R}from"./resultParser-BdPDeH8Q.js";import{_ as M}from"./index-vqdVbmhQ.js";import{r as C,j as N}from"./react-vendor-Dnchy7Po.js";const P=`
你现在是一位拥有丰富经验的专业短剧剧本写手。你的核心任务是将提供的【小说原文】结合【分集大纲】，改编为节奏紧凑、冲突强烈、极具画面感的短剧剧本。

请严格遵循以下创作原则：

1.  **标准化格式与视觉化呈现**：
    -   **场景标题**：【第X集】X-X 场景名 时间 光线/氛围
    -   **镜头语言**：必须大量使用”⊿”符号提示每一个画面或镜头切换点，强调视觉驱动。
    -   **视觉/音效**：格式为 ⊿【画面：...】 或 ⊿【音效：...】。注明镜头（特写、闪回、慢动作）。
    -   **内心独白**：善用 **角色名（OS）** 传达心理活动、背景信息和情绪转变，弥补对话不足。
    -   **对白格式**：角色名（情绪/动作）：台词。

2.  **核心节奏与情绪曲线**：
    -   **开场抓人**：每集开头应选择本集中自然存在的冲突点或情绪点作为开场，不要为了”暴击”而强行编造原文中不存在的剧情。
    -   **结尾自然收尾**：结尾应基于原文剧情的自然发展，用角色的动作、表情或一句台词收尾。**严禁**用”⊿【音效：...预示着危险逼近】”、”⊿【画面：黑屏】”、”⊿【音效：不祥的...】”等刻意渲染悬念的套路结尾，这类描述显得生硬且AI腔。
    -   **快节奏**：一集内部不要包含过多拖沓情节，多用特写镜头强调重点，时长控制在 1.5-2分钟演绎长度。

3.  **短剧特征与改编技巧**：
    -   **极致精简台词**（关键）：**严禁出现长篇大论**！单句台词尽量控制在 15 字以内。如果原著台词过长，必须拆分为多句互动，或用”⊿”动作/镜头打断。
    -   **忠实原文优先**（最高优先级）：剧情走向、人物行为、事件逻辑必须严格遵循【小说原文】。禁止为了制造悬念而擅自增删关键情节。
    -   **强冲突与反转**：抓住本集最核心的冲突点，围绕其展开，并尽可能在场景内部制造一层小反转。
    -   **视觉化改编**：把小说里的叙述性文字，转化为可拍的画面、动作、表情、道具和音效，不要停留在抽象叙述。
    -   **善用停顿与镜头切换**：关键情绪和反转点前后，要用”⊿”切镜制造节奏。

4.  **多集衔接**：
    -   如果提供了【上一集剧本】，本集必须从上一集结尾自然衔接，不要重复上一集已经演绎过的内容。
    -   如有【上一集原文结尾】，请特别注意承接这一段尚未被上集剧本覆盖的剧情。
    -   保持角色状态、关系、目标与上一集一致。

5.  **输出要求**：
    -   直接输出完整剧本正文，不要解释，不要加 markdown。
    -   必须具有短剧的镜头感、冲突感和情绪密度。

**【优质案例片段】**
【第1集】1-1 监狱门口 夜 暴雨
⊿【画面：监狱门口，雨夜。简初夏穿着破烂囚服，被狱警粗暴地推搡出来。】
狱警 (不耐烦，一脸厌恶): 滚！刑满释放了！
⊿【画面：黑屏转特写】
简初夏 (OS，声音疲惫): 七年婚姻，换来老公和绿茶把我送进监狱。
⊿【画面：特写。一只沾满泥污的脚，艰难踏出铁门。】
⊿【音效：沉重的铁门关闭声，雨声呼啸】
...（后续剧情）
`,k=`
你现在是一位顶级的”小说推文”供稿人，深谙短视频平台的用户心理。你的任务是将提供的【小说原文】和【分集大纲】，改编成一段极具吸引力和传播力的第一人称口播解说文案。这份文案将作为画外音，搭配游戏或解压视频，核心目标是让观众在1-2分钟内迅速上头，并产生强烈的追更欲望。

请严格遵循以下原则进行创作：

1. **叙事视角与风格**：
   * **固定主角视角**：【重要】整个系列必须始终以同一个主角的第一人称”我”来叙述。请根据【本集出场人物】中标注为”主角”或排在第一位的角色作为固定叙述者。全系列所有集数都必须保持这个视角，绝不能在不同集中切换叙述者。
   * **第一人称沉浸式叙事**：必须将原文的第三人称（他/她）改为主角的第一人称（我）。所有事件、对话和心理活动都通过”我”的口吻讲述出来，营造强烈的代入感。
   * **口语化与快节奏**：使用大量短句、口语化表达，仿佛在给朋友讲一个跌宕起伏的故事。节奏要快，信息密度高，避免使用书面语和复杂的长难句。
   * **情绪化表达**：在叙述中注入强烈的情感色彩，用”可笑的是”、”让我没想到的是”、”就在这时”等强转折词语来引导观众情绪。

2. **结构与节奏**：
   * **开篇抓人（黄金3秒法则）**：开篇应选择原文中自然存在的冲突点或情绪点，可以调整叙事顺序，但不要编造原文中不存在的情节。
   * **聚焦”虐爽”核心**：你的核心任务是提炼原文的”虐点”（主角受到的委屈、背叛、羞辱）和”爽点”（主角的反击、逆袭、打脸）。快速铺垫”虐点”积累观众的愤懑情绪，然后在关键时刻引爆”爽点”，带来极致的情绪释放。
   * **情节的高度浓缩**：删减原文中的次要人物、背景铺垫、环境描写和内心挣扎的细节。只保留推动主线冲突发展的核心事件和对话。但不能改变核心剧情逻辑。

3. **多集衔接规则**：
   * **避免重复内容**：如果提供了【上一集解说结尾参考】，请仔细阅读，确保本集开头不要重复上一集已经讲过的情节。本集应该从上一集结束的地方自然延续。
   * **自然过渡**：如果不是第一集，开头可以用简短的一句话（10-20字）快速回顾上集关键转折，然后立即进入本集新内容。例如：”就在我以为一切都结束的时候，更大的危机来了...”
   * **保持连贯性**：确保人物关系、情节发展、情绪基调与上一集保持一致，不要出现突兀的跳跃或矛盾。

4. **改编技巧**：
   * **忠实原文优先**：剧情发展、人物行为、事件逻辑必须严格遵循【小说原文】，不得为了追求”爽感”而擅自改编核心剧情。
   * **对话的转述**：将原文中的直接对话，改为”我”的转述。
   * **心理活动外化**：将原文中复杂的心理描写，直接用”我心底冷笑”、”我如坠冰窟”、”我简直不敢相信自己的耳朵”这样直白的第一人称OS（内心独白）来表达。
   * **系统/数据可视化（重点）**：如果原文包含系统、面板、数据流，必须将其具象化，不要一笔带过。使用加粗和特殊符号（如【...】）突显系统提示音、属性面板、技能介绍。让观众在听觉/视觉上能明显感觉到”金手指”的强大。
   * **逻辑自洽**：改编后的剧情必须保证前后逻辑一致，不能因为追求单集效果而埋下后续剧情的逻辑bug。

5. **输出格式**：
   * 最终输出一个连续的文本段落，即完整的口播稿。
   * 不需要分场景、不需要角色名、不需要任何剧本格式，就是一个纯粹的、一气呵成的故事文案。
   * 按照一章一集的方式生成，每集剧本500～1000字左右。

**【优质案例片段】**
我辛苦侍奉婆母一年，可我那凯旋归来的夫君，第一件事竟是在殿前跪了三天三夜，用赫赫军功为另一个女人求来了平妻之位。这也就算了，可让我没想到的是，他竟然无耻到要用我的嫁妆，去给她下聘礼！皇帝都看不下去了，召我入宫询问我的意见。我强忍着泪水，对着九五之尊说：”陛下，既然将军能用军功求娶，那臣女也想用我父兄的战功，求一道和离的旨意！”皇帝大惊，问我可想好了，和离之后，一个孤女该如何自处。我笑了，笑得比哭还难看：”他舍得我，我便舍得了他！”
`,L=$=>{switch($){case"visualize_actions":return"将文中所有含糊的心理/状态描写（如'愤怒地'、'悲伤地'）转换为具体的、可视化的肢体动作或微表情描写。";case"remove_os":return"删除文中过多的内心独白（OS）和旁白，尽量用视听语言（画面/音效/动作）来表达信息。保留最关键的OS即可。";case"fix_format":return"统一修正剧本格式。确保场景号规范，视觉符号（⊿）使用正确，标点符号规范。";case"enhance_hooks":return"强化每一场戏的结尾钩子。如果结尾平淡，增加一句悬念台词或一个意味深长的动作。";default:return $}},G=async($,e,s="[次]gemini-3-flash-preview",c,m)=>{const p=E($,c,s),u=e.narrativeType==="first-person"?k:P;console.log("🎬 生成剧本配置:",{episodeId:e.episodeId,episodeTitle:e.episodeTitle,narrativeType:e.narrativeType,usingInstruction:e.narrativeType==="first-person"?"第一人称解说":"第三人称演绎"});const o=e.useNovelReference!==!1,a=o?e.novelContent.substring(0,1e4):"";let i="";e.characterList&&e.characterList.length>0?i=e.characterList.map(r=>`- ${r.name}：${r.desc}`).join(`
`):e.characters&&(i=e.characters);let t="";e.targetChapter&&(t+=`
【对应原著章节】：${e.targetChapter}
`),i&&(t+=`
【本集出场人物及人设】：
${i}
`),e.openingHook&&(t+=o?`
【开篇钩子/看点】：${e.openingHook}
⚠️ 注意：开篇钩子必须基于原文剧情，不要为了"抓眼球"而编造原文中不存在的情节。
`:`
【开篇钩子/看点】：${e.openingHook}
⚠️ 注意：开篇钩子必须服务于本集既定剧情，不要脱离集纲主线额外发散。
`),e.endingHook&&(t+=o?`
【结尾钩子/悬念】：${e.endingHook}
⚠️ 注意：结尾钩子必须是原文剧情的自然延伸，不要为了"悬念"而过度改编或添加原文中没有的反转。
`:`
【结尾钩子/悬念】：${e.endingHook}
⚠️ 注意：结尾钩子必须承接本集既有剧情，不要额外扩写脱离主线的新支线。
`),e.endingClosure&&(t+=`
【结尾收尾/终局落点】：${e.endingClosure}
⚠️ 注意：如果这是结尾集，请优先完成主线落地、人物命运安放和情绪收束，不要为了强留悬念而破坏结局兑现。
`),e.foreshadowing&&(t+=`
【伏笔/铺垫】：${e.foreshadowing}
`),e.keyQuotes&&(t+=`
【必须包含的金句/关键台词】：
${e.keyQuotes}
`),e.worldSetting&&(t+=`
【世界观/背景/核心设定】：
${e.worldSetting}
`),e.viralTips&&(t+=`
【爆款创作技巧（重要）】：
${e.viralTips}
⚠️ 注意：请在剧本创作中严格遵循上述技巧要求，将这些元素融入到情节设计、冲突设置、悬念铺垫中，提升观众的观看体验。
`),e.conflictArcFiltered&&(t+=`
【核心冲突博弈提示】：
${e.conflictArcFiltered}
`),e.relationshipArcFiltered&&(t+=`
【本集核心羁绊关系提示】：
${e.relationshipArcFiltered}
`);const l=e.targetWordCount||800;let d="";if(e.narrativeType==="first-person"){let r="";e.narratorInfo?r=`
【固定叙述者】：${e.narratorInfo.name}（${e.narratorInfo.identity}）
⚠️ **重要**：本系列所有集数都必须以"${e.narratorInfo.name}"的第一人称"我"来叙述，不得更换视角！
`:r=`
【叙述者提取】：这是第一集，请从【本集出场人物】中选择主角作为固定叙述者，并在生成剧本后明确告知叙述者是谁。
`,d=`
请创作第一人称解说文案：**${e.episodeTitle}** （这是全剧的第 ${e.episodeId} 集）。
${r}
${e.previousScriptContext?`【上一集完整解说（用于故事连贯性）】：
${e.previousScriptContext}

⚠️ **衔接要求**：
- 本集必须从上一集结束的地方自然延续，不要重复上一集已讲过的情节
- 如果上一集结尾有悬念或转折，本集开头要简短回应（10-20字），然后立即进入新内容
- 保持人物关系、情绪基调与上一集一致，确保故事连贯流畅`:"【上一集解说参考】：无（这是第一集，请直接开始）"}
${o&&e.previousNovelTail?`
【上一集原文结尾（衔接参考）】：
以下是上一集对应原著章节的结尾片段，本集开头的故事应自然衔接此处，不要遗漏其中未被上一集解说覆盖的情节：
${e.previousNovelTail}
`:""}
【本集创作参数】：
${t}

【本集剧情梗概（核心剧情）】：
${e.outlineContent}

${a?`【参考小说原文（用于提炼情节和细节）】：
${a}`:"【参考小说原文】：无（请完全基于分集大纲进行创作）"}

请开始生成本集的第一人称解说文案。
**重要提示**：
1. 【固定视角】${e.narratorInfo?`必须以"${e.narratorInfo.name}"的第一人称"我"来讲述`:'必须用第一人称"我"的视角讲述，且"我"必须是【本集出场人物】中的主角（通常是第一位角色）'}
2. ${o?'【忠实原文】剧情发展、人物行为、事件逻辑必须严格遵循【小说原文】，不得为了追求"钩子"或"爽感"而擅自改编核心剧情':"【遵循集纲】剧情发展、人物行为、事件逻辑必须严格遵循【本集剧情梗概】与【本集创作参数】，不要偏离既定主线"}
3. ${o?"【开篇抓人】开篇应选择原文中自然存在的冲突点，可以调整叙事顺序，但不要编造原文中不存在的情节。如果不是第一集，要先用10-20字自然衔接上一集":"【开篇抓人】开篇应从当前集纲中自然存在的冲突点切入，可以调整叙事顺序，但不要额外编造与设定冲突的新情节。如果不是第一集，要先用10-20字自然衔接上一集"}
4. 【快节奏】快节奏、高信息密度、口语化表达
5. 【系统提示】系统提示用【...】格式突出显示
6. 【输出格式】输出为连续的文本段落，不需要场景号、角色名等剧本格式
7. 【避免重复】仔细检查上一集内容，本集不要重复已讲过的情节，要推进新的故事发展
8. 【逻辑自洽】确保改编后的剧情前后逻辑一致，不能因为追求单集效果而埋下后续剧情的逻辑bug
9. **目标字数：约 ${l} 字**（请控制在 ${Math.floor(l*.8)} - ${Math.floor(l*1.2)} 字之间）
`}else d=`
请创作剧本：**${e.episodeTitle}** （这是全剧的第 ${e.episodeId} 集）。

【上一集完整剧本（用于连贯性）】：
${e.previousScriptContext||"无（这是第一集，请直接开始）"}
${o&&e.previousNovelTail?`
【上一集原文结尾（衔接参考）】：
以下是上一集对应原著章节的结尾片段，本集开头的剧情应自然衔接此处，不要遗漏其中未被上一集剧本覆盖的情节：
${e.previousNovelTail}
`:""}
【本集创作参数】：
${t}

【本集剧情梗概（核心剧情）】：
${e.outlineContent}

${a?`【参考小说原文（用于提炼台词和细节）】：
${a}`:"【参考小说原文】：无（请完全基于分集大纲进行创作，自行补充合理的细节和对话）"}

请开始生成本集剧本。
**强制格式要求**：
1. 首行标题必须是：【第${e.episodeId}集】
2. 场景编号格式：${e.episodeId}-1, ${e.episodeId}-2 ...
3. 包含开场抓人点、视觉镜头⊿、内心OS。
4. **目标字数：约 ${l} 字**（请控制在 ${Math.floor(l*.8)} - ${Math.floor(l*1.2)} 字之间）

**⚠️ 核心原则（最高优先级）**：
1. ${o?'**忠实原文**：剧情发展、人物行为、事件逻辑必须严格遵循【小说原文】，不得为了追求"钩子"或"爽感"而擅自改编核心剧情。':"**遵循集纲**：剧情发展、人物行为、事件逻辑必须严格遵循【本集剧情梗概】与【本集创作参数】，不要偏离既定主线。"}
2. ${o?"**提炼而非创造**：可以调整表达方式、节奏和镜头语言，但不能改变事件本质或添加原文中不存在的情节。":"**补足而不跑偏**：可以补充合理的场面细节、台词和镜头语言，但不能改动既定事件走向，也不要新增与设定冲突的重要情节。"}
3. **逻辑自洽**：确保改编后的剧情前后逻辑一致，不能因为追求单集效果而埋下后续剧情的逻辑bug。
4. ${o?"**钩子基于原文**：开场和结尾的钩子必须是原文剧情中自然存在的冲突点，不要凭空编造。":"**钩子基于既有剧情**：开场和结尾的钩子必须来自本集既定剧情冲突，不要额外扩写无关支线。"}
`;try{return console.log("📤 发送 API 请求，使用系统指令:",u.substring(0,100)+"..."),(await _(p,s,[{role:"system",content:u},{role:"user",content:d}],{temperature:.75,signal:m==null?void 0:m.signal})).text||"生成内容为空"}catch(r){throw console.error("Script Generation Error:",r),r}},J=async($,e,s,c,m="[次]gemini-3-flash-preview",p,u,o)=>{const a=E($,p,m),i=c.slice(-5).map(r=>`${r.role==="user"?"用户":"模型"}: ${r.text} ${r.quotedText?`(引用: "${r.quotedText.substring(0,30)}...")`:""}`).join(`
`),t=u?`
【用户特意选中的待修改片段】：
"${u}"

请重点针对上述选中的片段，根据用户的指令进行修改。`:"",d=`
你是一个专业的剧本修改助手 (Script Doctor)。你的任务是根据用户的指令修改当前的剧本。
${o==="first-person"?`
**重要提示**：这是一份第一人称解说文案（口播稿），请保持：
1. 第一人称"我"的视角，不要改成第三人称
2. 口语化、情绪化的表达风格
3. 快节奏、高信息密度的叙事
4. 强转折词（"可笑的是"、"让我没想到的是"、"就在这时"）
5. 系统提示用【...】格式突出显示
6. 输出格式为连续文本段落，不需要场景号、角色名等剧本格式`:`
**重要提示**：这是一份第三人称演绎剧本，请保持：
1. 标准剧本格式（场景号、⊿视觉符号、角色名等）
2. 视觉化的镜头语言和画面描写
3. 精简的对话（单句15字以内）
4. 内心独白用"角色名（OS）"格式`}

【当前剧本内容】：
${e}

${t}

【历史对话】：
${i}

【用户最新指令】：
${s}

# Writing Techniques to Apply (Script Doctor Toolkit)
在执行修改时，请务必运用以下专业编剧技巧（除非用户只是让你改错别字）：
1. **Show, Don't Tell (视觉化)**: 不要让角色说出感受，要通过动作（Beat）表现出来。
   - *Bad*: "他很生气。" -> *Good*: "他猛地摔碎了杯子，玻璃渣溅了一地。"
2. **Subtext (潜台词)**: 台词表面意思和真实意图要有反差。让对话更耐人寻味。
3. **Action Lines (动作流)**: 动作描写要具体、有力，避免使用模糊的形容词。
4. **Pacing (节奏控制)**: 如果这段是冲突戏，请缩短句子，加快节奏；如果是情感戏，适当留白。

**回复要求**：
1. 首先，用自然的语言回复用户的请求（例如解释你做了什么修改）。
2. 然后，必须输出**完整的、修改后的剧本**。
3. **重要**：修改后的剧本必须包裹在 <SCRIPT_START> 和 <SCRIPT_END> 标签之间，以便我提取。例如：
<SCRIPT_START>
【第1集】
...（修改后的完整剧本内容）
<SCRIPT_END>

请保持剧本格式的专业性（场景号、⊿视觉符号等）。
`;try{const h=(await _(a,m,[{role:"user",content:d}],{temperature:.7})).text||"",n=h.match(/<SCRIPT_START>([\s\S]*?)<SCRIPT_END>/);let S=null,y=h;return n&&(S=n[1].trim(),y=h.replace(/<SCRIPT_START>[\s\S]*?<SCRIPT_END>/,"").trim(),y||(y="已根据您的要求修改了剧本。")),{textResponse:y,newScript:S}}catch(r){throw console.error("Refine Script Error:",r),r}},Z=async($,e,s,c="[次]gemini-3-flash-preview",m)=>{const p=E($,m,c),u=s.novelContent.substring(0,5e3);let o="";s.episodeId>1&&s.previousScriptContext&&(o=`4. **上一集结尾**（用于检查衔接）：
${s.previousScriptContext.slice(-800)}
`);let a="";s.characterList&&s.characterList.length>0?a=s.characterList.map(t=>`- ${t.name}：${t.desc}`).join(`
`):s.characters&&(a=s.characters);const i=`
你现在是短剧制作公司的【金牌主编】。请对以下【刚生成的剧本】进行严格的质量审核。

**审核核心原则**：
1. **剧情主线优先**：所有修改建议必须严格服务于【剧情大纲】的主线剧情。**严禁**为了追求所谓的“爽感”或“冲突”而偏离原大纲设定的剧情走向。
2. **连贯性检查**：如果是第2集及以后，必须检查与上一集的剧情和情绪衔接是否自然。
3. **原著还原度**：参考小说原文和世界观设定，确保人物不OOC（角色性格崩坏），核心设定不丢失。

**审核依据**：
1. **剧情大纲**（必须严格遵守）：${s.outlineContent}
2. **世界观/背景**：${s.worldSetting||"无"}
3. **小说原文参考**：${u}
${o}
5. **人物设定**：
${a||"无"}

**审核维度**（请毒舌一点，不要客气，直接指出问题）：
1. **主线偏移 (Plot Deviation)**：剧本是否偏离了大纲的核心剧情？是否加了多余的戏份？
2. **剧情衔接 (Continuity)**：(仅针对第2集+) 开场是否能接得住上一集的情绪？转场是否生硬？
3. **节奏 (Pacing)**：开篇前3秒是否够炸？结尾是否有钩子？中间是否拖沓？
4. **冲突 (Conflict)**：矛盾是否够尖锐？
5. **人设 (Character)**：人物行为是否符合提供的【人物设定】？是否OOC？
6. **视觉 (Visuals)**：是否缺乏画面感？
7. **台词 (Dialogue)**：**是否单句过长（短剧忌讳长篇大论）？** 是否太书面化？

**输出要求**：
请找出 3-6 个最关键、最需要修改的具体问题。
每个问题必须包含：
- **category**: 问题类别 (主线/衔接/节奏/冲突/人设/视觉/台词)
- **severity**: 严重程度 (high/medium/low)
- **issue**: 简短的问题描述 (例如：开场太平淡，缺乏视觉冲击)
- **targetQuote**: 剧本中具体存在问题的这一段原文 (用于定位)
- **suggestion**: 给编剧助理的具体修改指令 (Instruction)，要求必须是可以直接执行的动作 (例如："删除前三句闲聊，直接从巴掌声开始写起，增加XXX的心理描写")。

【待审核剧本】：
${e}

请输出 JSON 数组格式：
[
  {
    "category": "问题类别",
    "severity": "high/medium/low",
    "issue": "问题描述",
    "targetQuote": "剧本中具体存在问题的原文",
    "suggestion": "具体修改指令"
  }
]
`;try{const t=e.length;let l=O(t,c);t>15e4?l=c.includes("claude")?12e5:9e5:t>1e5?l=c.includes("claude")?9e5:72e4:t>5e4?l=c.includes("claude")?6e5:48e4:l=c.includes("claude")?3e5:18e4;const d=await _(p,c,[{role:"user",content:i}],{temperature:.5,responseFormat:{type:"json_object"},timeout:l});let r=I(d.text,"AuditScript");return r&&!Array.isArray(r)&&r.items&&(r=r.items),Array.isArray(r)||(r=[]),r.map((h,n)=>({...h,id:Date.now().toString()+n,status:"pending"}))}catch(t){return console.error("Audit Script Error:",t),[]}},v=async($,e,s,c,m,p="[次]gemini-3-pro-preview-thinking")=>{const u=E($,m,p);console.log(`[Deep Audit] 开始审稿 - 模型: ${p}, 剧本长度: ${e.length}字`),console.log(`[Deep Audit] 小说上下文长度: ${s.length}字, 大纲上下文长度: ${c.length}字`);const o=e.length+s.length+c.length;console.log(`[Deep Audit] 总输入长度: ${o}字`);const a=p.includes("opus");p.includes("claude");let i=s,t=c;if(a)console.log("[Deep Audit] ✅ 使用 Claude Opus 模型，支持超长上下文，无需压缩");else{if(s.length>5e3){console.log(`[Deep Audit] ⚠️ 小说上下文过长 (${s.length}字)，当前模型不支持超长上下文`),console.log("[Deep Audit] 建议：切换到 Claude Opus 4.6 (MixAI) ⭐ 模型以获得完整评估"),console.log("[Deep Audit] 当前将压缩到 5000 字（仅供参考，可能影响评估准确性）");const h=Math.floor(5e3/2);i=s.substring(0,h)+`

...(中间部分已省略，建议使用 Claude Opus 模型查看完整评估)...

`+s.substring(s.length-h)}c.length>3e3&&(console.log(`[Deep Audit] 大纲上下文过长 (${c.length}字)，压缩到 3000 字`),t=c.substring(0,3e3)+`

...(后续内容已省略)...`)}const l=`
# Role
你是一名**资深短剧改编顾问**，专注于**小说IP改编短剧**赛道。
请对以下【剧本正文】进行深度体检，核心任务是评估**小说到短剧的改编质量**，包括剧情压缩、节奏把控、情绪放大等改编技巧。

# Priority Rules (改编评估优先)
1. **改编视角优先**：始终以"小说原文"为参照基准，评估剧本的改编取舍是否合理。
2. **短剧特性优先**：短剧需要快节奏、强情绪、高密度，评估时需考虑短剧的特殊要求。
3. **宏观优先 (Macro First)**：优先指出**剧情压缩**、**情节取舍**、**节奏把控**的大问题，忽略台词语病等琐碎问题。

# Inputs
1. 【分集大纲 (Blueprint/Outline)】：
${t}

2. 【小说原文 (Novel Reference) - 改编参照基准】：
${i}

3. 【待审核剧本 (Target)】：
${e}

# Audit Dimension Checklist
请从以下 7 个核心维度进行审查。**重要原则：改编不是照搬原著，合理的改动应该加分而非扣分。**

**评估核心原则：**
- **剧本自洽优先**：逻辑在剧本内部能自圆其说即可，不必与原著完全一致
- **正向改动加分**：如果改编比原著更精彩、更适合短剧，应该给高分
- **服务剧情优先**：人设改动只要能推动剧情、不违和，就是合理的

**⚠️ 短剧改编的核心要求：节奏压缩**
短剧的本质是"快节奏、高密度、强情绪"。小说改编短剧必须大幅压缩节奏：
- **合格的压缩**：5000字小说 → 1集短剧（约800字剧本）
- **优秀的压缩**：在压缩的同时保留甚至放大情绪爆点
- **失败的改编**：节奏和小说类似甚至更慢，这是致命伤！

1. **逻辑闭环 (Logic)** - 评估剧本内部逻辑，而非与原著对比：
   - 剧本内部的行为动机是否合理？因果链是否自洽？
   - 即使与原著不同，只要剧本内逻辑能自圆其说，就应给高分
   - 只有剧本内部出现逻辑漏洞、前后矛盾时才扣分

2. **情节推动 (Plot Efficiency)**:
   - 每场戏是否有效推动剧情？信息密度是否足够？
   - 关键转折点是否清晰有力？是否存在水时长？
   - 原创情节如果能增强戏剧张力，应该加分
   - **严重扣分项**：大段心理描写、冗长对话、无效场景

3. **钩子与节奏 (Hooks & Pacing)** - ⚠️ 这是短剧改编的核心维度：
   - 开场前3秒是否抓人？结尾是否有悬念？
   - **节奏压缩是否到位？** 这是最重要的评判标准！
   - **致命问题（直接扣30分以上）**：
     * 节奏和小说原文类似或更慢
     * 大段照搬小说对话，没有精简
     * 铺垫过长，迟迟不进入冲突
     * 一集内容可以压缩到半集
   - **优秀表现（可加分）**：
     * 原著3章内容精炼成1集，且保留核心冲突
     * 删除冗余铺垫，直接进入高潮
     * 用视觉动作替代大段心理描写

4. **人设一致性 (Character Consistency)** - 评估剧本内部人设，而非与原著对比：
   - 人物在剧本内是否前后一致？是否有突然的性格跳跃？
   - 人设改动只要服务于剧情推动、不违和，就是合理的
   - 即使与原著人设不同，只要剧本内人物立体、有魅力，就应给高分

5. **改编质量 (Adaptation Quality)**:
   - 是否保留并放大了故事的核心魅力（爽点、虐点、金手指）？
   - 正向改动（比原著更精彩）应该加分
   - 视听化改编是否到位？文字转画面是否有创意？
   - **严重扣分项**：照搬原著文字，没有视听化处理

6. **情绪带动 (Emotional Impact)**:
   - 情绪点是否充分释放？爽感、虐感、甜感是否拉满？
   - 情绪节奏是否有起伏？高潮点是否足够强烈？
   - 如果情绪表达比原著更强烈，应该加分
   - **严重扣分项**：情绪平淡、缺乏爆点、高潮被稀释

7. **画面表现 (Visual Presentation)**:
   - 场景描写是否具有画面感？是否便于拍摄？
   - 动作指示（⊿）是否清晰、具体、可执行？
   - 镜头语言是否丰富？视觉手法是否有效强化情绪？

# 评分标准（极度严格，必须拉开巨大差距）
**⚠️ 警告：你必须非常严格地打分！节奏拖沓是短剧改编的致命伤！**

**节奏问题的严重性（必须严格执行）：**
- 如果剧本节奏和小说类似或更慢 → 总分不得超过55分
- 如果存在大段照搬小说对话 → "钩子与节奏"维度不得超过45分
- 如果一集内容明显可以压缩 → 至少扣20分

**总分标准（严格执行）：**
- **90-100分（现象级爆款）**：完美无缺，可遇不可求，一年难见一部
- **85-89分（顶级商业水准）**：几乎无可挑剔，可直接投拍的精品
- **80-84分（优秀水准）**：质量上乘，仅有极少量瑕疵
- **70-79分（良好水准）**：整体不错，但有明显可优化空间
- **60-69分（合格水准）**：基本可用，但问题较多需要修改
- **50-59分（勉强及格）**：问题明显，需要较大幅度修改
- **40-49分（不合格）**：问题严重，需要大幅重写
- **30-39分（严重不合格）**：基本失败，建议推翻重来
- **30分以下（完全失败）**：不具备改编价值

**维度评分要求：**
- **实事求是**：根据剧本实际质量打分，好剧本各维度都可以高，差剧本各维度都可以低
- **敢于给极端分数**：做得极好的给90+，做得极差的给40以下，不要都挤在60-75区间
- **每个维度独立评判**：不要因为某个维度高就拉高其他维度，也不要强行制造差异
- **严格标准**：大多数普通剧本应该在50-70分区间，80分以上需要真正优秀
- **节奏是核心**：如果"钩子与节奏"维度低于50分，总分不应超过60分

**评分示例（注意分数分布）：**
- 节奏拖沓的剧本（总分48）：钩子与节奏35分，其他维度45-65之间
- 节奏尚可但有问题的剧本（总分62）：钩子与节奏58分，其他维度55-72之间
- 节奏紧凑的优秀剧本（总分82）：钩子与节奏88分，其他维度75-90之间

# Output Schema
请输出 JSON 格式。
对于每条批注 (annotation)：
- **score**: 0 (致命伤/Fatal) or 1 (建议优化/Warning)。
- **dimension**: e.g. "逻辑.动机", "节奏.拖沓", "改编.偏离原著".
- **location.lineContent**: 剧本中**最能体现该问题**的一句原文（用于高亮）。
- **issue**: 用专业的导演视角指出问题本质。
- **suggestion**: 给出**具体的修改策略**。

Example JSON Structure:
{
  "totalScore": 48,
  "summary": "本剧本存在严重的节奏问题：1）大量照搬小说对话，没有进行短剧化压缩，节奏和原著几乎一样慢；2）第3-5集铺垫过长，迟迟不进入核心冲突；3）方岩黑化动机铺垫不足，转折突兀；4）部分内心戏缺乏视觉化处理。唯一亮点是开场动作戏设计。",
  "dimensionScores": [
    { "dimension": "逻辑闭环", "score": 52, "comment": "主线逻辑基本自洽，但方岩黑化动机铺垫缺失，第7集转折略显突兀" },
    { "dimension": "情节推动", "score": 45, "comment": "大量场景信息密度过低，存在明显水时长，杨盈盈支线喧宾夺主" },
    { "dimension": "钩子与节奏", "score": 38, "comment": "【致命问题】节奏和小说原文几乎一样慢，大段对话照搬原著，完全没有短剧化压缩，一集内容可以压缩到半集" },
    { "dimension": "人设一致性", "score": 55, "comment": "主要人物基本一致，但秦红裳的复杂性被削弱，部分配角扁平" },
    { "dimension": "改编质量", "score": 42, "comment": "视听化处理严重不足，大量文字直接照搬，没有转化为画面语言" },
    { "dimension": "情绪带动", "score": 58, "comment": "爽点有所释放，但因节奏拖沓导致情绪被稀释，高潮缺乏蓄力" },
    { "dimension": "画面表现", "score": 48, "comment": "动作指示过于笼统，大量内心戏缺乏视觉化处理" }
  ],
  "annotations": [
    {
       "dimension": "节奏.拖沓",
       "location": { "lineContent": "（大段对话照搬原著）", "scene": "第3集 3-2场" },
       "score": 0,
       "issue": "【致命伤】这段对话完全照搬小说原文，长达500字，严重拖慢节奏。短剧一集只有1.5分钟，这段对话就占了30秒以上。",
       "suggestion": "必须大幅压缩：1）删除所有铺垫性对话；2）只保留核心冲突台词；3）用动作和表情替代解释性对话；4）目标压缩到100字以内。",
       "canBatchFix": true
    },
    {
       "dimension": "改编.视听化不足",
       "location": { "lineContent": "他心里很后悔", "scene": "第5集 5-3场" },
       "score": 1,
       "issue": "内心描写没有视觉化处理，无法拍摄。",
       "suggestion": "改为具体动作：'他颤抖着手捡起地上的照片，指节发白'。",
       "canBatchFix": false
    }
  ]
}
`;try{const d=e.length;let r=O(d,p);const h=p.includes("opus"),n=p.includes("claude");d>15e4?h?r=18e5:n?r=12e5:r=9e5:d>1e5?h?r=12e5:n?r=9e5:r=72e4:d>5e4?r=n?6e5:48e4:r=n?3e5:18e4,console.log(`[Deep Audit] 超时设置: ${r/1e3}秒 (${Math.round(r/6e4)}分钟)`);const S=await _(u,p,[{role:"user",content:l}],{temperature:.4,responseFormat:{type:"json_object"},timeout:r});console.log("[Deep Audit] API 调用成功，开始解析结果"),console.log(`[Deep Audit] 响应长度: ${S.text.length} 字符`);const y=p.toLowerCase().includes("claude"),f=await b(S.text,"Deep Audit",$,m,y),T=(f.annotations||[]).map((g,A)=>({...g,id:`anno_${Date.now()}_${A}`,status:"pending"}));return console.log(`[Deep Audit] 审稿完成 - 总分: ${f.totalScore}, 批注数: ${T.length}`),{scriptId:Date.now().toString(),totalScore:f.totalScore||0,dimensionScores:f.dimensionScores||[],annotations:T,summary:f.summary||"",timestamp:Date.now()}}catch(d){throw console.error("[Deep Audit] 审稿失败:",d),console.error("[Deep Audit] 错误详情:",{message:d.message,status:d.status,name:d.name}),d}},V=async($,e,s,c,m,p="claude-opus-4-6-a",u)=>{const a=e.length;if(console.log(`[Batched Deep Audit] 开始分批审稿 - 总长度: ${a}字, 模型: ${p}`),a<=2e5)return console.log("[Batched Deep Audit] 剧本长度未超过20万字，使用普通审稿"),v($,e,s,c,m,p);const i=[];for(let n=0;n<a;n+=8e4)i.push(e.substring(n,Math.min(n+8e4,a)));console.log(`[Batched Deep Audit] 分为 ${i.length} 批次处理`);const t=[],l=new Map;let d=0;for(let n=0;n<i.length;n++){const S=i[n],y=n*8e4,f=Math.min(y+8e4,a);u&&u(n+1,i.length,`正在审稿第 ${n+1}/${i.length} 批次 (${y}-${f}字)`),console.log(`[Batched Deep Audit] 处理第 ${n+1}/${i.length} 批次`);try{const T=await v($,S,s,c,m,p);T.annotations.forEach(g=>{t.push({...g,id:`batch${n}_${g.id}`,location:{...g.location,lineContent:`[第${n+1}批] ${g.location.lineContent}`}})}),T.dimensionScores.forEach(g=>{const A=l.get(g.dimension);A?(A.total+=g.score,A.count+=1):l.set(g.dimension,{total:g.score,count:1})}),d+=T.totalScore}catch(T){console.error(`[Batched Deep Audit] 第 ${n+1} 批次失败:`,T)}}const r=Math.round(d/i.length),h=Array.from(l.entries()).map(([n,S])=>({dimension:n,score:Math.round(S.total/S.count),comment:`基于 ${S.count} 个批次的平均分数`}));return console.log(`[Batched Deep Audit] 分批审稿完成 - 总批注数: ${t.length}, 平均分: ${r}`),{scriptId:Date.now().toString(),totalScore:r,dimensionScores:h,annotations:t,summary:`【分批审稿报告】本剧本共 ${a} 字，分 ${i.length} 批次审核完成。共发现 ${t.length} 处问题。`,timestamp:Date.now()}},K=async($,e,s,c,m,p="claude-opus-4-6-a",u)=>{var r,h;const a=e.length;console.log(`[Incremental Audit] 开始增量式审稿 - 总长度: ${a}字, 模型: ${p}`);const i=[];for(let n=0;n<a;n+=5e4)i.push(e.substring(n,Math.min(n+5e4,a)));console.log(`[Incremental Audit] 分为 ${i.length} 批次处理`);let t={totalScore:0,dimensionScores:[],summary:"",keyIssues:[],overallTrend:""};const l=[],d=E($,m,p);for(let n=0;n<i.length;n++){const S=i[n],y=n*5e4,f=Math.min(y+5e4,a);u&&u(n+1,i.length,`正在审稿第 ${n+1}/${i.length} 段 (${y}-${f}字)`),console.log(`[Incremental Audit] 处理第 ${n+1}/${i.length} 段`);const T=`
# Role
你是一名**资深短剧改编顾问**，正在对一部**小说改编短剧**进行**分段增量式审稿**。
核心任务是评估**小说到短剧的改编质量**，包括剧情压缩、节奏把控、情绪放大等改编技巧。

# 当前任务
这是第 ${n+1}/${i.length} 段的审稿。你需要：
1. 以小说原文为参照基准，分析本段剧本的改编问题
2. **参考之前的全局结论**，保持评价标准的一致性
3. **更新全局结论**，整合本段的新发现

# 之前的全局结论（供参考）
${n===0?"这是第一段，暂无之前的结论。":`
- 当前总分: ${t.totalScore}
- 维度评分: ${JSON.stringify(t.dimensionScores)}
- 总体趋势: ${t.overallTrend}
- 关键问题: ${t.keyIssues.join("; ")}
`}

# 参考上下文
【小说原文 - 改编参照基准】：${s.substring(0,3e3)}...
【大纲】：${c.substring(0,2e3)}...

# 本段剧本（第 ${n+1}/${i.length} 段）
${S}

# 审核维度（重要：剧本自洽优先，正向改动应加分）
**核心原则：改编不是照搬原著，合理改动应加分。逻辑和人设只要在剧本内自洽即可。**

**⚠️ 短剧改编的核心要求：节奏压缩**
- 如果节奏和小说类似或更慢 → 这是致命伤，总分不得超过55分
- 如果大段照搬小说对话 → "钩子与节奏"维度不得超过45分

1. 逻辑闭环：剧本内部逻辑是否自洽？（不必与原著一致，自圆其说即可）
2. 情节推动：每场戏是否有效推动剧情？信息密度是否足够？
3. 钩子与节奏：**最重要的维度！** 节奏是否大幅压缩？是否符合短剧特点？
4. 人设一致性：人物在剧本内是否前后一致？（改动只要服务剧情就OK）
5. 改编质量：核心魅力是否保留放大？正向改动应加分
6. 情绪带动：情绪点是否充分释放？爽感是否拉满？
7. 画面表现：场景是否有画面感？动作指示是否清晰可执行？

# 评分标准（极度严格，必须拉开巨大差距）
**⚠️ 警告：大多数剧本应该在50-70分区间，80分以上极为罕见。节奏拖沓是致命伤！**
- 90-100分（现象级）：完美无缺，一年难见一部
- 85-89分（顶级商业）：几乎无可挑剔
- 80-84分（优秀）：质量上乘，极少瑕疵
- 70-79分（良好）：整体不错，有明显优化空间
- 60-69分（合格）：基本可用，问题较多
- 50-59分（勉强及格）：问题明显，需较大修改
- 40-49分（不合格）：问题严重，需大幅重写
- 40分以下（失败）：建议推翻重来

**节奏问题的严重性：**
- 节奏和小说类似或更慢 → 总分不得超过55分
- 大段照搬小说对话 → "钩子与节奏"不得超过45分

**维度评分要求：实事求是打分，好剧本各维度都可以高，差剧本各维度都可以低。敢于给极端分数，不要都挤在60-75区间。**

# 输出要求
请输出 JSON 格式，包含两部分：

1. **本段分析 (currentSegment)**：
   - annotations: 本段发现的具体问题（需结合小说原文对比）
   - segmentScore: 本段的评分 (0-100)
   - segmentSummary: 本段的简要总结（需体现改编评估视角）

2. **更新后的全局结论 (updatedGlobal)**：
   - totalScore: 综合所有已审稿段的总分 (0-100)
   - dimensionScores: 各维度评分（逻辑闭环、情节推动、钩子与节奏、人设还原、改编质量、情绪带动、画面表现）
   - summary: 整体评价（整合所有段的发现，体现改编质量评估）
   - keyIssues: 关键问题列表（最多5个，聚焦改编问题）
   - overallTrend: 总体趋势描述（如"前半部分改编紧凑，后半部分节奏拖沓"）

Example JSON:
{
  "currentSegment": {
    "annotations": [
      {
        "dimension": "逻辑.因果断裂",
        "location": { "lineContent": "..." },
        "score": 0,
        "issue": "角色行为动机完全缺失，前后矛盾严重",
        "suggestion": "需要补充至少2-3场戏铺垫动机转变",
        "canBatchFix": false
      }
    ],
    "segmentScore": 52,
    "segmentSummary": "本段逻辑漏洞严重，但节奏把控是亮点"
  },
  "updatedGlobal": {
    "totalScore": 48,
    "dimensionScores": [
      { "dimension": "逻辑闭环", "score": 35, "comment": "因果链严重断裂，多处行为动机缺失" },
      { "dimension": "情节推动", "score": 58, "comment": "关键情节基本保留，但信息密度不足" },
      { "dimension": "钩子与节奏", "score": 72, "comment": "节奏把控是本剧最大亮点，钩子设置到位" },
      { "dimension": "人设一致性", "score": 32, "comment": "人物前后矛盾严重，多处性格跳跃" },
      { "dimension": "改编质量", "score": 48, "comment": "核心魅力被大幅削弱，正向改动几乎没有" },
      { "dimension": "情绪带动", "score": 55, "comment": "爽点有所释放，但情绪起伏平淡" },
      { "dimension": "画面表现", "score": 38, "comment": "动作指示模糊，大量场景无法执行拍摄" }
    ],
    "summary": "前${n+1}段整体改编质量良好，保留了原著核心框架...",
    "keyIssues": ["部分情感铺垫被过度压缩", "XXX伏笔缺失"],
    "overallTrend": "改编质量稳定，局部需补充情感铺垫"
  }
}
`;try{const g=await _(d,p,[{role:"user",content:T}],{temperature:.4,responseFormat:{type:"json_object"},timeout:6e5}),A=p.toLowerCase().includes("claude"),w=await b(g.text,`Incremental Audit 第${n+1}段`,$,m,A);(r=w.currentSegment)!=null&&r.annotations&&w.currentSegment.annotations.forEach((D,x)=>{l.push({...D,id:`seg${n}_${Date.now()}_${x}`,location:{...D.location,lineContent:`[第${n+1}段] ${D.location.lineContent}`},status:"pending"})}),w.updatedGlobal&&(t={totalScore:w.updatedGlobal.totalScore||t.totalScore,dimensionScores:w.updatedGlobal.dimensionScores||t.dimensionScores,summary:w.updatedGlobal.summary||t.summary,keyIssues:w.updatedGlobal.keyIssues||t.keyIssues,overallTrend:w.updatedGlobal.overallTrend||t.overallTrend}),console.log(`[Incremental Audit] 第 ${n+1} 段完成 - 本段评分: ${(h=w.currentSegment)==null?void 0:h.segmentScore}, 全局总分: ${t.totalScore}`)}catch(g){console.error(`[Incremental Audit] 第 ${n+1} 段失败:`,g)}}return console.log(`[Incremental Audit] 增量式审稿完成 - 总批注数: ${l.length}, 最终总分: ${t.totalScore}`),{scriptId:Date.now().toString(),totalScore:t.totalScore,dimensionScores:t.dimensionScores,annotations:l,summary:`【增量式审稿报告】${t.summary}

总体趋势: ${t.overallTrend}

关键问题: ${t.keyIssues.join("; ")}`,timestamp:Date.now()}},z=async($,e,s,c,m)=>{const u=E($,m,"[次]gemini-3-flash-preview"),o=`
# Task
你是一名专业的短剧编剧。针对剧本中被标记为有问题的一段文字，请提供 3 个**截然不同**的修改方案。
请注意：这不仅是修改台词，更是**优化剧情处理方式**。

【问题描述】：${s}
【原句】："${e}"
【上下文参考】：
${c.substring(0,500)} ...

# Requirement
请输出 3 个具体的、可直接替换原句的文本段落。
1. **方案一（极致冲突版）**：最大化情绪张力，动作幅度大，直接引爆矛盾。
2. **方案二（悬疑/内敛版）**：通过潜台词或微表情传达信息，增加高级感和悬念。
3. **方案三（快节奏/效率版）**：删繁就简，用最少的动作/台词完成剧情推动，适合短剧节奏。

# Output Format (JSON Array of Strings)
["方案一内容...", "方案二内容...", "方案三内容..."]
`,a=await _(u,"[次]gemini-3-flash-preview",[{role:"user",content:o}],{responseFormat:{type:"json_object"}});return R(a.text)},W=async($,e,s,c)=>{const p=E($,c,"[次]gemini-3-pro-preview-thinking"),o=`
# Task
请对以下剧本进行**全篇批量优化**。
【优化指令】：${L(s)}

【原始剧本】：
${e}

# Output
请直接输出优化后的完整剧本，不要包含任何解释性文字。保持剧本格式。
`;return(await _(p,"[次]gemini-3-pro-preview-thinking",[{role:"user",content:o}])).text||e},Q=async($,e,s,c="[次]gemini-3-pro-preview-thinking")=>{const m=E($,s,c),u=`
# Role
你是一名**资深短剧制片人**，现在需要对同一集的**不同版本剧本**进行横向测评（A/B Test）。
请从**商业价值、节奏感、冲突张力**等维度进行评分，并选出“最佳版本”。

# Input Scripts
${e.map((o,a)=>`
    === SCRIPT ${a+1}: ${o.name} ===
    ${o.content.substring(0,3e4)} ... (truncated if too long)
    `).join(`

`)}

# Evaluation Criteria (评分维度)
1. **冲突前置 (Hook Strength)**: 开篇3秒是否能抓住观众？
2. **情绪价值 (Emotional Impact)**: 爽点/虐点是否到位？
3. **视觉化程度 (Visuals)**: 是否适合拍摄？动作指令是否清晰？
4. **台词效率 (Dialogue Efficiency)**: 是否废话少、信息密度高？

# Task
请输出一份 JSON 格式的对比报告。
1. **winner**: 获胜的剧本文件名。
2. **reasoning**: 200字左右的深度解析，说明为什么它获胜（对比其他版本的优势）。
3. **items**: 每个剧本的详细分析，包含 score (0-100), rank (排名), pros (优点列表), cons (缺点列表), summary (一句话短评)。

# Output Format (JSON)
{
  "winner": "Script Name",
  "reasoning": "...",
  "items": [
    { 
      "fileName": "Script Name", 
      "score": 85, 
      "rank": 1, 
      "pros": ["..."], 
      "cons": ["..."],
      "summary": "..."
    }
  ]
}
`;try{const o=e.reduce((l,d)=>l+d.content.length,0);let a=O(o,c);o>15e4?a=c.includes("claude")?12e5:9e5:o>1e5?a=c.includes("claude")?9e5:72e4:o>5e4?a=c.includes("claude")?6e5:48e4:a=c.includes("claude")?3e5:18e4;const i=await _(m,c,[{role:"user",content:u}],{temperature:.4,responseFormat:{type:"json_object"},timeout:a});return{...I(i.text,"AuditSingleEpisode"),timestamp:Date.now()}}catch(o){throw console.error("Script Comparison Failed",o),o}},q=({oldText:$,newText:e,containerClassName:s,loadingText:c="正在计算差异..."})=>{const[m,p]=C.useState(null);return C.useEffect(()=>{let u=!1;return p(null),M(()=>import("./diff-vendor-BTAiA4S9.js"),[]).then(o=>{u||p(o.diffWordsWithSpace($,e))}),()=>{u=!0}},[$,e]),N.jsx("div",{className:s,children:m?m.map((u,o)=>u.added?N.jsx("span",{className:"bg-green-100 text-green-800 border-b-2 border-green-300 rounded px-0.5",children:u.value},o):u.removed?N.jsx("span",{className:"bg-red-100 text-red-800 line-through decoration-red-400 opacity-60 select-none px-0.5",children:u.value},o):N.jsx("span",{className:"text-gray-800",children:u.value},o)):N.jsx("div",{className:"text-gray-400",children:c})})},X=$=>new Promise(e=>setTimeout(e,$)),j=async($,e,s,c)=>{var i,t;const m=(l,d="info")=>{var r;(r=s.onLog)==null||r.call(s,{level:d,message:l,timestamp:Date.now()})},p={signal:c.signal,log:m,setProgress:l=>{var d;return(d=s.onProgress)==null?void 0:d.call(s,l)}},u=e.retries??0,o=e.retryDelayMs??600;let a=0;for(;a<=u;)try{a+=1,a>1&&m(`第 ${a} 次执行任务`,"warn");const l=await $(p);return(i=s.onProgress)==null||i.call(s,null),l}catch(l){if(c.signal.aborted)throw m("任务已取消","warn"),l;if(a<=u){m(`任务失败，准备重试（${a}/${u}）`,"warn"),await X(o);continue}if(e.fallbackTask){m("主任务失败，执行降级任务","warn");const d=await e.fallbackTask(l,p);return(t=s.onProgress)==null||t.call(s,null),d}throw m(l instanceof Error?l.message:"任务执行失败","error"),l}throw new Error("任务执行失败")},Y=$=>{const[e,s]=C.useState(!1),[c,m]=C.useState(null),[p,u]=C.useState(null),[o,a]=C.useState([]),i=C.useRef(null),t=C.useRef(null),l=C.useCallback(n=>{a(S=>[...S.slice(-39),n])},[]),d=C.useCallback(()=>{var n;(n=i.current)==null||n.abort()},[]),r=C.useCallback(async(n,S={})=>{var T;(T=i.current)==null||T.abort();const y=new AbortController;i.current=y,s(!0),m(null),u(null),l({level:"info",message:`开始任务：${$}`,timestamp:Date.now()});const f=async()=>j(n,S,{onLog:l,onProgress:u},y);t.current=f;try{const g=await f();return l({level:"info",message:`完成任务：${$}`,timestamp:Date.now()}),g}catch(g){const A=g instanceof Error?g:new Error(String(g));throw m(A),A}finally{i.current===y&&(i.current=null),s(!1),u(null)}},[l,$]),h=C.useCallback(async()=>t.current?t.current():null,[]);return{cancel:d,error:c,isRunning:e,logs:o,progress:p,retryLastTask:h,runTask:r}};export{q as D,Z as a,V as b,v as c,Q as d,W as e,z as f,G as g,K as p,J as r,Y as u};
