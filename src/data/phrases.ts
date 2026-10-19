import phrasesJson from '../../catalog/phrases.json';

/** 理由文案库（catalog/phrases.json 的运行时加载）。 */
export interface PhrasesData {
  note: string;
  /** 7 个因子各一句组头（SPEC：不随书增加） */
  factor_phrases: Record<string, string>;
  /** 按困境标签共享的判断句（S1 素材） */
  judgment: Record<string, string>;
}

export const PHRASES = phrasesJson as unknown as PhrasesData;
