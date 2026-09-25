import { Alert, Button, Card, Col, DatePicker, Form, Input, Row, Segmented, Slider, Space, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listMoods, saveMood } from '../api/mood';
import { MoodCard } from '../components/common/MoodCard';
import { MoodSelector } from '../components/common/MoodSelector';
import { EmptyState } from '../components/common/EmptyState';
import { MOOD_LABELS } from '../constants/mood';
import type { Mood, MoodTag } from '../types';
import {
  hasActiveFilter,
  parseMoodFilter,
  parseMoodTags,
  serializeMoodFilter,
  type MoodFilter,
  type MoodSort,
} from '../utils/moodFilter';

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 8, color: 'rgba(0,0,0,0.65)' };

export function Moods() {
  const [moods, setMoods] = useState<Mood[]>([]);
  const [tags, setTags] = useState<MoodTag[]>(['happy']);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = () => listMoods().then(setMoods).catch((e) => message.error(e.message));
  useEffect(() => {
    load();
  }, []);

  const { filter, warnings } = useMemo(() => parseMoodFilter(searchParams), [searchParams]);
  const filtered = useMemo(() => {
    const keyword = filter.keyword.trim().toLowerCase();
    const list = moods.filter((m) => {
      if (keyword && !(m.note || '').toLowerCase().includes(keyword)) return false;
      if (filter.tags.length) {
        const recordTags = parseMoodTags(m.mood_tags);
        if (!filter.tags.every((t) => recordTags.includes(t))) return false;
      }
      if (filter.levelMin !== undefined && m.mood_level < filter.levelMin) return false;
      if (filter.levelMax !== undefined && m.mood_level > filter.levelMax) return false;
      if (filter.date && (m.record_date || '').slice(0, 10) !== filter.date) return false;
      return true;
    });
    list.sort((a, b) =>
      filter.sort === 'level'
        ? b.mood_level - a.mood_level || (a.record_date < b.record_date ? 1 : -1)
        : (a.record_date < b.record_date ? 1 : a.record_date > b.record_date ? -1 : b.id - a.id),
    );
    return list;
  }, [moods, filter]);

  // 网址里出现无效条件后，把解析出的可用条件规范化写回网址（替换历史，避免污染后退栈）
  useEffect(() => {
    const canonical = serializeMoodFilter(filter);
    if (canonical !== searchParams.toString()) {
      setSearchParams(canonical ? `?${canonical}` : '', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // push 一条历史，便于后退；连续输入类操作（关键词、滑块）替换当前历史
  const updateFilter = (patch: Partial<MoodFilter>, replace = false) => {
    const next = { ...filter, ...patch };
    const qs = serializeMoodFilter(next);
    setSearchParams(qs ? `?${qs}` : '', { replace });
  };

  return (
    <>
      <Typography.Title>情绪记录</Typography.Title>

      {warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="网址中部分筛选条件无法使用，已恢复为默认值"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[20, 16]}>
          <Col xs={24} md={8}>
            <label style={labelStyle}>备注关键词</label>
            <Input.Search
              allowClear
              placeholder="搜索备注，例如：工作压力"
              value={filter.keyword}
              onChange={(e) => updateFilter({ keyword: e.target.value }, true)}
            />
          </Col>
          <Col xs={24} md={16}>
            <label style={labelStyle}>情绪标签（多选，需全部命中）</label>
            <MoodSelector value={filter.tags} onChange={(v) => updateFilter({ tags: v })} />
          </Col>
          <Col xs={24} md={8}>
            <label style={labelStyle}>
              心情指数区间
              {(filter.levelMin !== undefined || filter.levelMax !== undefined) &&
                `：${filter.levelMin ?? 1}–${filter.levelMax ?? 10}`}
            </label>
            <Slider
              range
              min={1}
              max={10}
              marks={{ 1: '1', 10: '10' }}
              value={[filter.levelMin ?? 1, filter.levelMax ?? 10]}
              onChange={(v) =>
                updateFilter(
                  {
                    levelMin: v[0] === 1 ? undefined : v[0],
                    levelMax: v[1] === 10 ? undefined : v[1],
                  },
                  true,
                )
              }
            />
          </Col>
          <Col xs={24} md={6}>
            <label style={labelStyle}>记录日期</label>
            <DatePicker
              style={{ width: '100%' }}
              value={filter.date ? dayjs(filter.date) : null}
              onChange={(v) => updateFilter({ date: v?.format('YYYY-MM-DD') })}
              placeholder="按日期筛选"
            />
          </Col>
          <Col xs={24} md={6}>
            <label style={labelStyle}>排序方式</label>
            <Segmented
              value={filter.sort}
              onChange={(v) => updateFilter({ sort: v as MoodSort })}
              options={[
                { label: '记录日期', value: 'date' },
                { label: '心情指数', value: 'level' },
              ]}
            />
          </Col>
          <Col xs={24} md={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button block disabled={!hasActiveFilter(filter)} onClick={() => setSearchParams('')}>
              清空筛选
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={9}>
          <Card title="新增一条记录">
            <Form
              layout="vertical"
              initialValues={{ level: 6, date: dayjs() }}
              onFinish={async (v) => {
                try {
                  await saveMood({
                    mood_level: v.level,
                    mood_tags: tags,
                    note: v.note || '',
                    record_date: v.date.format('YYYY-MM-DD'),
                  });
                  message.success('已保存');
                  load();
                } catch (e) {
                  message.error((e as Error).message);
                }
              }}
            >
              <Form.Item name="date" label="日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="level" label="心情指数">
                <Slider min={1} max={10} />
              </Form.Item>
              <Form.Item label="情绪标签">
                <MoodSelector value={tags} onChange={setTags} />
              </Form.Item>
              <Form.Item name="note" label="备注">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button type="primary" htmlType="submit">
                保存记录
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card
            title={
              <Space>
                <span>记录列表 ({filtered.length})</span>
                {hasActiveFilter(filter) && (
                  <Typography.Text type="secondary" style={{ fontWeight: 'normal' }}>
                    共 {moods.length} 条，已按条件筛选
                  </Typography.Text>
                )}
              </Space>
            }
          >
            {filtered.length ? (
              <div className="card-list">
                {filtered.map((m) => (
                  <MoodCard key={m.id} mood={m} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={hasActiveFilter(filter) ? '没有符合筛选条件的情绪记录' : '还没有符合条件的情绪记录'}
              />
            )}
            {filter.tags.length > 0 && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                标签筛选为“全部命中”：{filter.tags.map((t) => MOOD_LABELS[t]).join('、')}
              </Typography.Paragraph>
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
