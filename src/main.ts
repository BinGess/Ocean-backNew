import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SafeLoggingInterceptor } from './common/interceptors/safe-logging.interceptor';
import { sarahDebugLog } from './common/utils/sarah-debug-log';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.use(helmet());
  app.enableCors();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split('?')[0];
    if (!path.startsWith('/sarah/letters') && path !== '/sync/snapshot') {
      next();
      return;
    }

    const startedAt = Date.now();
    sarahDebugLog('HTTP request received', {
      method: req.method,
      path,
      hasAuthorization: Boolean(req.headers.authorization),
      contentLength: req.headers['content-length'] ?? null,
    });

    res.on('finish', () => {
      sarahDebugLog('HTTP response sent', {
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new SafeLoggingInterceptor());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Ocean Backend')
    .setDescription('Account and text-data sync API for Ocean Flutter client')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
