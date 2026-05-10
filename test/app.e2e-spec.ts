import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InMemoryPrismaService } from '../src/testing/in-memory-prisma.service';

describe('Ocean API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new InMemoryPrismaService())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('serves a lightweight health endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      service: 'ocean-back-new',
    });
  });

  it('registers, snapshots, pushes, and pulls text sync data', async () => {
    const auth = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'user@example.com',
        password: 'StrongerPass123',
        nickname: 'Ocean',
      })
      .expect(201);

    const accessToken = auth.body.accessToken as string;

    const emptySnapshot = await request(app.getHttpServer())
      .get('/sync/snapshot')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(emptySnapshot.body.cursor).toBe('0');
    expect(emptySnapshot.body.records).toEqual([]);

    const pushed = await request(app.getHttpServer())
      .post('/sync/push')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        records: [
          {
            id: 'record-1',
            type: 'quick_note',
            transcription: '今天很平静',
            createdAt: '2026-05-07T08:00:00.000Z',
            updatedAt: '2026-05-07T08:01:00.000Z',
            audioUrl: '/private/local/audio.wav',
          },
        ],
      })
      .expect(201);

    expect(pushed.body.accepted).toBe(1);

    const snapshot = await request(app.getHttpServer())
      .get('/sync/snapshot')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(snapshot.body.records).toHaveLength(1);
    expect(snapshot.body.records[0].audioUrl).toBeNull();
    expect(snapshot.body.records[0].transcription).toBe('今天很平静');

    const pulled = await request(app.getHttpServer())
      .get('/sync/pull?cursor=0')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(pulled.body.cursor).toBe(pushed.body.cursor);
    expect(pulled.body.changes).toHaveLength(1);
    expect(pulled.body.changes[0].payload.audioUrl).toBeNull();
  });

  it('creates, lists, and deletes records through server-first record APIs', async () => {
    const auth = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'records@example.com',
        password: 'StrongerPass123',
        nickname: 'Ocean',
      })
      .expect(201);

    const accessToken = auth.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post('/records')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        id: 'server-first-record',
        type: 'journal',
        transcription: '服务端是主数据源',
        createdAt: '2026-05-08T08:00:00.000Z',
        updatedAt: '2026-05-08T08:01:00.000Z',
        audioUrl: '/private/local/audio.wav',
        title: '新的架构',
        summary: '记录写入服务端后再缓存到本地',
      })
      .expect(201);

    expect(created.body.revision).toBe('1');
    expect(created.body.data.id).toBe('server-first-record');
    expect(created.body.data.audioUrl).toBeNull();

    const listed = await request(app.getHttpServer())
      .get('/records')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].transcription).toBe('服务端是主数据源');

    const deleted = await request(app.getHttpServer())
      .delete('/records/server-first-record')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(deleted.body.revision).toBe('2');
    expect(deleted.body.data.deletedAt).toEqual(expect.any(String));

    const empty = await request(app.getHttpServer())
      .get('/records')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(empty.body.data).toEqual([]);

    const pulled = await request(app.getHttpServer())
      .get('/sync/pull?cursor=1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(pulled.body.cursor).toBe('2');
    expect(pulled.body.changes).toHaveLength(1);
    expect(pulled.body.changes[0].entityType).toBe('record');
    expect(pulled.body.changes[0].payload.deletedAt).toEqual(expect.any(String));
  });

  it('logs in with SMS verification and restores an Ocean session', async () => {
    await request(app.getHttpServer())
      .post('/auth/sms/send-code')
      .send({ phone: '13800138000' })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.cooldownSeconds).toEqual(expect.any(Number));
      });

    const auth = await request(app.getHttpServer())
      .post('/auth/sms/login')
      .send({ phone: '+8613800138000', code: '123456' })
      .expect(201);

    expect(auth.body.accessToken).toEqual(expect.any(String));
    expect(auth.body.refreshToken).toEqual(expect.any(String));
    expect(auth.body.user.phone).toBe('138****8000');

    await request(app.getHttpServer())
      .get('/sync/snapshot')
      .set('Authorization', `Bearer ${auth.body.accessToken}`)
      .expect(200);
  });

  it('updates profile, daily data, and reports through server-first APIs', async () => {
    const auth = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'daily@example.com',
        password: 'StrongerPass123',
        nickname: 'Ocean',
      })
      .expect(201);

    const accessToken = auth.body.accessToken as string;

    await request(app.getHttpServer())
      .put('/me/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        avatar: '🌊',
        nickname: '大黄鱼',
        signature: '保持流动',
        clientUpdatedAt: '2026-05-08T08:00:00.000Z',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/daily/2026-05-08/mood')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        imagePath: 'assets/images/moods/calm.png',
        clientUpdatedAt: '2026-05-08T08:01:00.000Z',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/daily/2026-05-08/summary')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        moodWord: '平静',
        oneSentence: '今天比较稳定',
        score: 6,
        recordCount: 2,
        generatedAt: '2026-05-08T08:02:00.000Z',
        userOverridden: true,
        clientUpdatedAt: '2026-05-08T08:02:00.000Z',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/reports/weekly/2026-05-04%20~%202026-05-10')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        weekRange: '2026-05-04 ~ 2026-05-10',
        cachedAt: '2026-05-08T08:03:00.000Z',
        recordCount: 2,
        report: {
          id: 'report-1',
          report_type: '每周洞察报告',
        },
        clientUpdatedAt: '2026-05-08T08:03:00.000Z',
      })
      .expect(200);

    const snapshot = await request(app.getHttpServer())
      .get('/sync/snapshot')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(snapshot.body.profile.nickname).toBe('大黄鱼');
    expect(snapshot.body.dailyMoods[0].imagePath).toBe('assets/images/moods/calm.png');
    expect(snapshot.body.dailySummaries[0].moodWord).toBe('平静');
    expect(snapshot.body.insightReports[0].periodType).toBe('weekly');

    const pulled = await request(app.getHttpServer())
      .get('/sync/pull?cursor=0')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(pulled.body.cursor).toBe('4');
    expect(pulled.body.changes.map((item: any) => item.entityType)).toEqual([
      'profile',
      'daily_mood',
      'daily_summary',
      'insight_report',
    ]);
  });
});
