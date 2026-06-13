import { InMemoryPrismaService } from '../testing/in-memory-prisma.service';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  const deepAnalyses = [
    {
      type: 'selfCompassion',
      title: '自我关怀与滋养',
      methodLabel: 'Self-Compassion & Savoring',
      theorySource: '源自自我关怀与正向心理学',
      overview: '方法概述',
      stuckPoint: '卡住的地方',
      groundedUnderstanding: '更贴近的理解',
      oneSmallStep: '一件小事',
      steadySentence: '一句话',
      analyzedAt: '2026-06-07T10:00:00.000Z',
      face: 'low',
      enoughSignal: true,
      resonance: '这件事让你一下子把责任都揽到自己身上了。',
      emotions: [
        { name: '委屈', intensity: 80 },
        { name: '自责', intensity: 65 },
      ],
      observedLabel: '你对自己说的话',
      observedValue: '是不是我不够好',
      truthLabel: '但其实',
      truthValue: '关系里的反应不等于你这个人的价值。',
      microActionKind: 'self_kindness',
    },
    {
      type: 'selfCompassion',
      title: '客户端保留的第二条同类型结果',
      methodLabel: 'Self-Compassion & Savoring',
      theorySource: '源自自我关怀与正向心理学',
      overview: '另一条结果',
      stuckPoint: '另一种卡点',
      groundedUnderstanding: '另一句理解',
      oneSmallStep: '另一个小行动',
      steadySentence: '另一句支持',
      analyzedAt: '2026-06-07T10:05:00.000Z',
    },
  ];

  let prisma: InMemoryPrismaService;
  let service: SyncService;
  let userId: string;

  beforeEach(async () => {
    prisma = new InMemoryPrismaService();
    const user = await prisma.user.create({
      data: {
        email: 'user@example.com',
        passwordHash: 'hash',
        profile: { create: { nickname: null, avatar: null, signature: null } },
      },
    });
    userId = user.id;
    service = new SyncService(prisma as any);
  });

  it('returns an empty snapshot with cursor zero for a new user', async () => {
    const snapshot = await service.snapshot(userId);

    expect(snapshot.cursor).toBe('0');
    expect(snapshot.records).toEqual([]);
    expect(snapshot.dailySummaries).toEqual([]);
    expect(snapshot.insightReports).toEqual([]);
  });

  it('pushes text data, strips local audio paths, and emits pullable changes', async () => {
    const pushed = await service.push(userId, {
      profile: {
        nickname: 'Ocean',
        avatar: '🌊',
        signature: 'flow',
        clientUpdatedAt: '2026-05-07T08:00:00.000Z',
      },
      records: [
        {
          id: 'client-record-1',
          type: 'quick_note',
          transcription: '今天很平静',
          createdAt: '2026-05-07T08:00:00.000Z',
          updatedAt: '2026-05-07T08:01:00.000Z',
          audioUrl: '/var/mobile/local.wav',
          moods: ['平静'],
        },
      ],
      dailySummaries: [
        {
          date: '2026-05-07',
          moodWord: '平静',
          oneSentence: '一天比较安稳',
          score: 6,
          recordCount: 1,
          generatedAt: '2026-05-07T08:02:00.000Z',
          userOverridden: false,
          clientUpdatedAt: '2026-05-07T08:02:00.000Z',
        },
      ],
      dailyMoods: [
        {
          date: '2026-05-07',
          imagePath: 'assets/images/moods/calm.png',
          clientUpdatedAt: '2026-05-07T08:03:00.000Z',
        },
      ],
      insightReports: [
        {
          periodType: 'weekly',
          periodKey: '2026-05-04_2026-05-10',
          weekRange: '2026-05-04 ~ 2026-05-10',
          cachedAt: '2026-05-07T08:04:00.000Z',
          recordCount: 1,
          report: { report_type: '每周洞察报告' },
          clientUpdatedAt: '2026-05-07T08:04:00.000Z',
        },
      ],
    });

    expect(Number(pushed.cursor)).toBeGreaterThan(0);
    const snapshot = await service.snapshot(userId);
    expect(snapshot.profile.nickname).toBe('Ocean');
    expect(snapshot.records[0].audioUrl).toBeNull();
    expect(snapshot.records[0].transcription).toBe('今天很平静');

    const pulled = await service.pull(userId, '0');
    expect(pulled.changes).toHaveLength(5);
    expect(pulled.cursor).toBe(pushed.cursor);
  });

  it('ignores older client updates and records no new revision', async () => {
    const first = await service.push(userId, {
      records: [
        {
          id: 'client-record-1',
          type: 'quick_note',
          transcription: 'new',
          createdAt: '2026-05-07T08:00:00.000Z',
          updatedAt: '2026-05-07T08:10:00.000Z',
        },
      ],
    });

    const second = await service.push(userId, {
      records: [
        {
          id: 'client-record-1',
          type: 'quick_note',
          transcription: 'old',
          createdAt: '2026-05-07T08:00:00.000Z',
          updatedAt: '2026-05-07T08:09:00.000Z',
        },
      ],
    });

    expect(second.accepted).toBe(0);
    expect(second.cursor).toBe(first.cursor);
    const snapshot = await service.snapshot(userId);
    expect(snapshot.records[0].transcription).toBe('new');
  });

  it('keeps delete tombstones visible through pull but omits them from snapshot', async () => {
    await service.push(userId, {
      records: [
        {
          id: 'client-record-1',
          type: 'quick_note',
          transcription: 'text',
          createdAt: '2026-05-07T08:00:00.000Z',
          updatedAt: '2026-05-07T08:01:00.000Z',
        },
      ],
    });

    const deletion = await service.push(userId, {
      records: [
        {
          id: 'client-record-1',
          type: 'quick_note',
          transcription: 'text',
          createdAt: '2026-05-07T08:00:00.000Z',
          updatedAt: '2026-05-07T08:02:00.000Z',
          deletedAt: '2026-05-07T08:02:00.000Z',
        },
      ],
    });

    const snapshot = await service.snapshot(userId);
    expect(snapshot.records).toEqual([]);
    const pulled = await service.pull(userId, '1');
    expect(pulled.cursor).toBe(deletion.cursor);
    const lastPayload = pulled.changes.at(-1)?.payload as { deletedAt?: string };
    expect(lastPayload.deletedAt).toBe('2026-05-07T08:02:00.000Z');
  });

  it('syncs deep analyses and preserves them when an old client omits the field', async () => {
    const nvc = {
      observation: '今天和同事沟通时有点委屈',
      feelings: [],
      needs: [],
      request: '我想先把自己的感受说清楚',
      insight: '你很在意被理解',
      recommendedMethod: 'boundarySupport',
      analyzedAt: '2026-06-13T12:00:00.000+08:00',
    };

    await service.push(userId, {
      records: [
        {
          id: 'client-record-1',
          type: 'quick_note',
          transcription: 'text',
          createdAt: '2026-06-07T08:00:00.000Z',
          updatedAt: '2026-06-07T08:01:00.000Z',
          nvc,
          deepAnalyses,
        },
      ],
    } as any);

    let snapshot = await service.snapshot(userId);
    expect(snapshot.records[0].nvc).toEqual(nvc);
    expect((snapshot.records[0] as any).deepAnalyses).toEqual(deepAnalyses);

    await service.push(userId, {
      records: [
        {
          id: 'client-record-1',
          type: 'quick_note',
          transcription: 'updated by old client',
          createdAt: '2026-06-07T08:00:00.000Z',
          updatedAt: '2026-06-07T08:02:00.000Z',
        },
      ],
    });

    snapshot = await service.snapshot(userId);
    expect(snapshot.records[0].transcription).toBe('updated by old client');
    expect((snapshot.records[0] as any).deepAnalyses).toEqual(deepAnalyses);

    const pulled = await service.pull(userId, '0');
    expect((pulled.changes[0]?.payload as any).nvc).toEqual(nvc);
    expect((pulled.changes.at(-1)?.payload as any).deepAnalyses).toEqual(deepAnalyses);
  });

  it('accepts an explicit empty deep analyses array', async () => {
    await service.push(userId, {
      records: [
        {
          id: 'client-record-1',
          type: 'quick_note',
          transcription: 'text',
          createdAt: '2026-06-07T08:00:00.000Z',
          updatedAt: '2026-06-07T08:01:00.000Z',
          deepAnalyses: [],
        },
      ],
    });

    const snapshot = await service.snapshot(userId);
    expect((snapshot.records[0] as any).deepAnalyses).toEqual([]);
  });
});
