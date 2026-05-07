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
});
