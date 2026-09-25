import type { MoodTag } from '../types';
import { MoodTagValues } from '../constants/mood';

export type MoodSort = 'date' | 'level';

export interface MoodFilter {
  keyword: string;
  tags: MoodTag[];
  levelMin?: number;
  levelMax?: number;
  date?: string;
  sort: MoodSort;
}

export const DEFAULT_MOOD_FILTER: MoodFilter = { keyword: '', tags: [], sort: 'date' };

const MOOD_TAG_SET = new Set<string>(Object.values(MoodTagValues));

// 与后端保持一致的日期格式（YYYY-MM-DD），dayjs 对 2024-02-30 之类的日期会“宽容进位”，
// 因此再比对一次格式化结果，确保它是真实存在的日期。
export function isValidDateString(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * 从网址查询串解析筛选条件。无效区间、未知标签等不会让页面抛错，
 * 而是回落到可用的默认值，并在 warnings 中说明原因。
 */
export function parseMoodFilter(params: URLSearchParams): { filter: MoodFilter; warnings: string[] } {
  const warnings: string[] = [];
  const filter: MoodFilter = {
    keyword: params.get('q') ?? '',
    tags: [],
    sort: 'date',
  };

  const tagRaw = params.get('tags');
  if (tagRaw) {
    const seen = new Set<string>();
    for (const raw of tagRaw.split(',')) {
      const t = raw.trim();
      if (!t) continue;
      if (!MOOD_TAG_SET.has(t)) {
        warnings.push(`网址中的标签“${t}”不是已知情绪标签，已忽略`);
      } else if (!seen.has(t)) {
        seen.add(t);
        filter.tags.push(t as MoodTag);
      }
    }
  }

  const parseLevel = (key: string, label: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null || raw === '') return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      warnings.push(`网址中的心情指数${label}“${raw}”无效（需为 1–10 的整数），已忽略该条件`);
      return undefined;
    }
    return n;
  };
  const levelMin = parseLevel('min_level', '下限');
  const levelMax = parseLevel('max_level', '上限');
  if (levelMin !== undefined && levelMax !== undefined && levelMin > levelMax) {
    warnings.push(`网址中的心情指数区间无效：下限 ${levelMin} 大于上限 ${levelMax}，已清除区间条件`);
  } else {
    filter.levelMin = levelMin;
    filter.levelMax = levelMax;
  }

  const date = params.get('date');
  if (date) {
    if (isValidDateString(date)) {
      filter.date = date;
    } else {
      warnings.push(`网址中的日期“${date}”格式无效（需为 YYYY-MM-DD），已忽略该条件`);
    }
  }

  const sort = params.get('sort');
  if (sort) {
    if (sort === 'date' || sort === 'level') {
      filter.sort = sort;
    } else {
      warnings.push(`网址中的排序方式“${sort}”无法识别，已恢复为按记录日期排序`);
    }
  }

  return { filter, warnings };
}

export function serializeMoodFilter(filter: MoodFilter): string {
  const p = new URLSearchParams();
  if (filter.keyword) p.set('q', filter.keyword);
  if (filter.tags.length) p.set('tags', filter.tags.join(','));
  if (filter.levelMin !== undefined) p.set('min_level', String(filter.levelMin));
  if (filter.levelMax !== undefined) p.set('max_level', String(filter.levelMax));
  if (filter.date) p.set('date', filter.date);
  if (filter.sort === 'level') p.set('sort', 'level');
  return p.toString();
}

export function hasActiveFilter(filter: MoodFilter): boolean {
  return Boolean(
    filter.keyword ||
      filter.tags.length ||
      filter.date ||
      filter.levelMin !== undefined ||
      filter.levelMax !== undefined ||
      filter.sort !== 'date',
  );
}

export function parseMoodTags(raw: string): MoodTag[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is MoodTag => MOOD_TAG_SET.has(t)) : [];
  } catch {
    return [];
  }
}
