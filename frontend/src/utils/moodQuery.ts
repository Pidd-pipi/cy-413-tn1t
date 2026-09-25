import { MoodTagValues } from '../constants/mood';
import type { Mood, MoodTag } from '../types';

export type MoodSortKey = 'date' | 'level';

export interface MoodFilter {
  /** 备注关键词（子串匹配，忽略大小写） */
  keyword: string;
  /** 情绪标签，记录需全部命中 */
  tags: MoodTag[];
  /** 心情指数区间下限（含），1-10 */
  levelMin: number;
  /** 心情指数区间上限（含），1-10 */
  levelMax: number;
  /** 限定的记录日期 YYYY-MM-DD */
  date?: string;
  /** 排序字段：记录日期 / 心情指数 */
  sort: MoodSortKey;
}

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 10;

export const DEFAULT_MOOD_FILTER: MoodFilter = {
  keyword: '',
  tags: [],
  levelMin: LEVEL_MIN,
  levelMax: LEVEL_MAX,
  sort: 'date',
};

const KNOWN_TAGS = new Set<string>(Object.values(MoodTagValues));
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedMoodQuery {
  filter: MoodFilter;
  /** 命中的无效条件及回退原因 */
  reasons: string[];
}

function parseLevel(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < LEVEL_MIN || value > LEVEL_MAX) return null;
  return value;
}

function isValidDate(raw: string): boolean {
  if (!DATE_PATTERN.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * 解析网址中的组合检索条件。
 * 无效区间、未知标签等会回退到可用默认值，并在 reasons 中说明原因，
 * 保证页面不会因为网址异常而整页空白。
 */
export function parseMoodQuery(params: URLSearchParams): ParsedMoodQuery {
  const reasons: string[] = [];
  const filter: MoodFilter = { ...DEFAULT_MOOD_FILTER, tags: [] };

  filter.keyword = (params.get('keyword') ?? '').trim();

  const known: MoodTag[] = [];
  const unknown: string[] = [];
  for (const raw of (params.get('tags') ?? '').split(',')) {
    const tag = raw.trim();
    if (!tag) continue;
    if (KNOWN_TAGS.has(tag)) {
      if (!known.includes(tag as MoodTag)) known.push(tag as MoodTag);
    } else {
      unknown.push(tag);
    }
  }
  filter.tags = known;
  if (unknown.length > 0) {
    reasons.push(`已忽略未知情绪标签：${unknown.join('、')}`);
  }

  let levelMin = parseLevel(params.get('min'));
  let levelMax = parseLevel(params.get('max'));
  if (params.get('min') !== null && levelMin === null) {
    reasons.push(`心情指数下限「${params.get('min')}」无效，已恢复为 ${LEVEL_MIN}`);
  }
  if (params.get('max') !== null && levelMax === null) {
    reasons.push(`心情指数上限「${params.get('max')}」无效，已恢复为 ${LEVEL_MAX}`);
  }
  levelMin = levelMin ?? LEVEL_MIN;
  levelMax = levelMax ?? LEVEL_MAX;
  if (levelMin > levelMax) {
    reasons.push(`心情指数区间 ${levelMin}-${levelMax} 无效，已恢复为 ${LEVEL_MIN}-${LEVEL_MAX}`);
    levelMin = LEVEL_MIN;
    levelMax = LEVEL_MAX;
  }
  filter.levelMin = levelMin;
  filter.levelMax = levelMax;

  const date = params.get('date');
  if (date) {
    if (isValidDate(date)) {
      filter.date = date;
    } else {
      reasons.push(`日期「${date}」无效，已忽略该条件`);
    }
  }

  const sort = params.get('sort');
  if (sort === 'date' || sort === 'level') {
    filter.sort = sort;
  } else if (sort) {
    reasons.push(`排序方式「${sort}」无效，已按记录日期排序`);
  }

  return { filter, reasons };
}

/** 把筛选条件序列化到网址；默认值不写入，保持网址干净。 */
export function buildMoodQuery(filter: MoodFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.keyword) params.set('keyword', filter.keyword);
  if (filter.tags.length > 0) params.set('tags', filter.tags.join(','));
  if (filter.levelMin !== LEVEL_MIN) params.set('min', String(filter.levelMin));
  if (filter.levelMax !== LEVEL_MAX) params.set('max', String(filter.levelMax));
  if (filter.date) params.set('date', filter.date);
  if (filter.sort !== DEFAULT_MOOD_FILTER.sort) params.set('sort', filter.sort);
  return params;
}

export function isDefaultFilter(filter: MoodFilter): boolean {
  return (
    !filter.keyword &&
    filter.tags.length === 0 &&
    filter.levelMin === LEVEL_MIN &&
    filter.levelMax === LEVEL_MAX &&
    !filter.date &&
    filter.sort === DEFAULT_MOOD_FILTER.sort
  );
}

function ownedTags(mood: Mood): string[] {
  try {
    const parsed: unknown = JSON.parse(mood.mood_tags);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * 组合检索并排序：
 * 关键词匹配备注、标签全部命中、心情指数闭区间、日期可单独限定；
 * 排序在记录日期与心情指数之间切换（同分时按记录日期、id 兜底）。
 */
export function applyMoodFilter(moods: Mood[], filter: MoodFilter): Mood[] {
  const keyword = filter.keyword.toLowerCase();
  const matched = moods.filter((mood) => {
    if (filter.date && mood.record_date.slice(0, 10) !== filter.date) return false;
    if (keyword && !(mood.note ?? '').toLowerCase().includes(keyword)) return false;
    if (mood.mood_level < filter.levelMin || mood.mood_level > filter.levelMax) return false;
    if (filter.tags.length > 0) {
      const owned = ownedTags(mood);
      if (!filter.tags.every((tag) => owned.includes(tag))) return false;
    }
    return true;
  });
  return matched.sort((a, b) => {
    if (filter.sort === 'level' && b.mood_level !== a.mood_level) {
      return b.mood_level - a.mood_level;
    }
    const byDate = b.record_date.localeCompare(a.record_date);
    return byDate !== 0 ? byDate : b.id - a.id;
  });
}
