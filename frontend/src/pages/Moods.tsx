import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Row,
  Segmented,
  Slider,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listMoods, saveMood } from '../api/mood';
import { EmptyState } from '../components/common/EmptyState';
import { MoodCard } from '../components/common/MoodCard';
import { MoodSelector } from '../components/common/MoodSelector';
import {
  applyMoodFilter,
  buildMoodQuery,
  isDefaultFilter,
  parseMoodQuery,
  type MoodFilter,
  type MoodSortKey,
} from '../utils/moodQuery';
import type { Mood, MoodTag } from '../types';

export function Moods() {
  const [moods, setMoods] = useState<Mood[]>([]);
  const [tags, setTags] = useState<MoodTag[]>(['happy']);
  const [notices, setNotices] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { filter, reasons } = useMemo(() => parseMoodQuery(searchParams), [searchParams]);

  const load = () =>
    listMoods().then(setMoods).catch((e) => message.error((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  // 网址带了无效区间或未知标签时，回退到可用默认值并说明原因，避免整页空白
  useEffect(() => {
    if (reasons.length > 0) {
      setNotices(reasons);
      setSearchParams(buildMoodQuery(filter), { replace: true });
    }
  }, [reasons, filter, setSearchParams]);

  const update = (patch: Partial<MoodFilter>) => {
    setNotices([]);
    setSearchParams(buildMoodQuery({ ...filter, ...patch }), { replace: true });
  };
  const clearAll = () => {
    setNotices([]);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const filtered = useMemo(() => applyMoodFilter(moods, filter), [moods, filter]);
  const listTitle = `记录列表 (${filtered.length}${
    filtered.length !== moods.length ? ` / 共 ${moods.length} 条` : ''
  })`;

  return (
    <>
      <Typography.Title>情绪记录</Typography.Title>
      <Card className="filter-bar">
        {notices.length > 0 && (
          <Alert
            className="filter-bar__notice"
            type="warning"
            showIcon
            closable
            onClose={() => setNotices([])}
            message="网址中的筛选条件有误，已恢复为可用默认值"
            description={notices.map((reason) => <div key={reason}>{reason}</div>)}
          />
        )}
        <div className="filter-bar__controls">
          <Input.Search
            allowClear
            placeholder="搜索备注关键词"
            style={{ width: 220 }}
            value={filter.keyword}
            onChange={(e) => update({ keyword: e.target.value })}
          />
          <div className="filter-bar__field">
            <div className="filter-bar__label">情绪标签（全部命中）</div>
            <MoodSelector value={filter.tags} onChange={(v) => update({ tags: v })} />
          </div>
          <div className="filter-bar__field filter-bar__field--range">
            <div className="filter-bar__label">
              心情指数 {filter.levelMin} - {filter.levelMax}
            </div>
            <Slider
              range
              min={1}
              max={10}
              style={{ width: 160 }}
              value={[filter.levelMin, filter.levelMax]}
              onChange={(v) => {
                const [lo, hi] = v as number[];
                update({ levelMin: lo, levelMax: hi });
              }}
            />
          </div>
          <div className="filter-bar__field">
            <div className="filter-bar__label">记录日期</div>
            <DatePicker
              placeholder="按日期筛选"
              value={filter.date ? dayjs(filter.date) : null}
              onChange={(v) => update({ date: v?.format('YYYY-MM-DD') })}
            />
          </div>
          <div className="filter-bar__field">
            <div className="filter-bar__label">排序方式</div>
            <Segmented
              value={filter.sort}
              onChange={(v) => update({ sort: v as MoodSortKey })}
              options={[
                { label: '按记录日期', value: 'date' },
                { label: '按心情指数', value: 'level' },
              ]}
            />
          </div>
          <Button onClick={clearAll} disabled={isDefaultFilter(filter)}>
            清空筛选
          </Button>
        </div>
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
          <Card title={listTitle}>
            {filtered.length ? (
              <div className="card-list">
                {filtered.map((m) => (
                  <MoodCard key={m.id} mood={m} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={
                  moods.length
                    ? '没有符合筛选条件的记录，试试清空筛选'
                    : '还没有符合条件的情绪记录'
                }
              />
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
