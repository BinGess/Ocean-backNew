import { InMemoryPrismaService } from '../testing/in-memory-prisma.service';
import { SyncService } from './sync.service';

describe('SyncService', () => {
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
});
