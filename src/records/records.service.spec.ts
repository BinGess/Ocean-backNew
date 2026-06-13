import { RecordsService } from './records.service';

describe('RecordsService', () => {
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

  it('lists legacy records even when client dates are missing', async () => {
    const prisma = {
      record: {
        findMany: jest.fn().mockResolvedValue([
          {
            clientRecordId: 'legacy-record',
            type: 'quick_note',
            transcription: 'legacy',
            createdAtClient: null,
            clientUpdatedAt: null,
            createdAt: new Date('2026-05-09T08:00:00.000Z'),
            updatedAt: new Date('2026-05-09T08:01:00.000Z'),
            deletedAt: null,
          },
        ]),
      },
      syncChange: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
    const service = new RecordsService(prisma);

    const result = await service.list('user-1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'legacy-record',
      type: 'quick_note',
      transcription: 'legacy',
      createdAt: '2026-05-09T08:00:00.000Z',
      updatedAt: '2026-05-09T08:01:00.000Z',
    });
  });

  it('preserves existing deep analyses when an old client updates without the field', async () => {
    const stored = {
      id: 'db-record-1',
      clientRecordId: 'record-1',
      type: 'quick_note',
      transcription: 'before',
      createdAtClient: new Date('2026-06-07T08:00:00.000Z'),
      clientUpdatedAt: new Date('2026-06-07T08:01:00.000Z'),
      deepAnalyses,
      deletedAt: null,
    };
    const prisma = {
      record: {
        findFirst: jest.fn().mockResolvedValue(stored),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...stored, ...data })),
      },
      syncChange: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    } as any;
    const service = new RecordsService(prisma);

    const result = await service.update('user-1', 'record-1', {
      id: 'record-1',
      type: 'quick_note',
      transcription: 'after',
      createdAt: '2026-06-07T08:00:00.000Z',
      updatedAt: '2026-06-07T08:02:00.000Z',
    });

    expect(prisma.record.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deepAnalyses }),
      }),
    );
    expect((result.data as any).deepAnalyses).toEqual(deepAnalyses);
  });

  it('passes through nvc recommendedMethod and deep analyses without rewriting nested fields', async () => {
    const nvc = {
      observation: '今天和同事沟通时有点委屈',
      feelings: [],
      needs: [],
      request: '我想先把自己的感受说清楚',
      insight: '你很在意被理解',
      recommendedMethod: 'boundarySupport',
      analyzedAt: '2026-06-13T12:00:00.000+08:00',
    };
    const prisma = {
      record: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'db-record-1',
          ...data,
        })),
      },
      syncChange: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    } as any;
    const service = new RecordsService(prisma);

    const result = await service.create('user-1', {
      id: 'record-1',
      type: 'quick_note',
      transcription: 'text',
      createdAt: '2026-06-13T04:00:00.000Z',
      updatedAt: '2026-06-13T04:01:00.000Z',
      nvc,
      deepAnalyses,
    });

    expect(prisma.record.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nvc, deepAnalyses }),
      }),
    );
    expect((result.data as any).nvc).toEqual(nvc);
    expect((result.data as any).deepAnalyses).toEqual(deepAnalyses);
  });
});
