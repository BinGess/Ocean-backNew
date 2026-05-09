import { RecordsService } from './records.service';

describe('RecordsService', () => {
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
});
