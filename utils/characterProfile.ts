import { AnalyzedCharacter, CharacterProfile, CharacterStage } from '../types';

export interface CharacterEpisodeRange {
  start: number;
  end: number;
}

const getMatchedStage = (
  character: AnalyzedCharacter,
  episodeRange: CharacterEpisodeRange | null,
): CharacterStage | null => {
  if (!character.timeline || character.timeline.length === 0) {
    return null;
  }

  const sortedStages = [...character.timeline].sort((a, b) => a.startChapter - b.startChapter);
  if (!episodeRange) {
    return sortedStages[0] || null;
  }

  const matchedStage = sortedStages.filter(stage => stage.startChapter <= episodeRange.start).pop();
  return matchedStage || sortedStages[0] || null;
};

const formatValue = (value?: string | null, fallback: string = '暂无'): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const formatList = (values?: string[] | null, fallback: string = '暂无'): string => {
  const normalized = (values || []).map(value => value.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.join('、') : fallback;
};

const formatRelations = (relations?: CharacterStage['relations']): string => {
  const normalized = (relations || []).filter(relation => relation.target || relation.attitude || relation.subtext);
  if (normalized.length === 0) {
    return '暂无';
  }

  return normalized
    .map(relation => {
      const attitude = formatValue(relation.attitude, '未说明');
      const subtext = formatValue(relation.subtext, '暂无');
      return `- ${formatValue(relation.target, '未知对象')}｜态度：${attitude}｜潜台词：${subtext}`;
    })
    .join('\n');
};

export const buildCharacterProfileDescription = (
  character: AnalyzedCharacter,
  episodeRange: CharacterEpisodeRange | null,
): string => {
  const stage = getMatchedStage(character, episodeRange);

  const staticSection = [
    '【静态底座档案】',
    `角色定位：${formatValue(character.role, '未标注')}`,
    `性别：${formatValue(character.gender, '未标注')}`,
    `出身/族属：${formatValue(character.origin, '未标注')}`,
    `人物底色：${formatValue(character.bio, '暂无')}`,
  ].join('\n');

  if (!stage) {
    return [
      staticSection,
      '',
      '【本章节匹配动态阶段】',
      '暂无匹配的动态阶段档案',
    ].join('\n');
  }

  const dynamicSection = [
    '【本章节匹配动态阶段】',
    `当前年龄：${formatValue(stage.currentAge, '未标注')}`,
    `视觉年龄：${formatValue(stage.visualAgeDesc, '未标注')}`,
    `外形/衣着：${formatValue(stage.appearance, '暂无')}`,
    `身体状态：${formatValue(stage.physicalState, '暂无')}`,
    `核心道具：${formatValue(stage.signatureProps, '暂无')}`,
    `已知信息：${formatList(stage.knownInfo, '暂无')}`,
    `核心目标：${formatValue(stage.coreGoal, '暂无')}`,
    `说话风格：${formatValue(stage.speakingStyle, '暂无')}`,
    `性格标签：${formatList(stage.personalityTags, '暂无')}`,
    `关系网络：\n${formatRelations(stage.relations)}`,
  ].join('\n');

  return [staticSection, '', dynamicSection].join('\n');
};

export const buildCharacterProfileForEpisode = (
  character: AnalyzedCharacter,
  episodeRange: CharacterEpisodeRange | null,
): CharacterProfile => ({
  id: character.id,
  name: character.name,
  desc: buildCharacterProfileDescription(character, episodeRange),
});


export const refreshCharacterProfileList = (
  profiles: CharacterProfile[] | undefined,
  characters: AnalyzedCharacter[],
  episodeRange: CharacterEpisodeRange | null,
): CharacterProfile[] => {
  return (profiles || []).map(profile => {
    if (profile.isCustomized) {
      return profile;
    }

    const matchedCharacter = characters.find(character => (
      character.id === profile.id ||
      character.name === profile.name ||
      character.name.includes(profile.name) ||
      profile.name.includes(character.name)
    ));

    if (!matchedCharacter) {
      return profile;
    }

    return buildCharacterProfileForEpisode(matchedCharacter, episodeRange);
  });
};
