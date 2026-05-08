import { Global, Module } from '@nestjs/common';
import { SyncRevisionService } from '../common/services/sync-revision.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, SyncRevisionService],
  exports: [PrismaService, SyncRevisionService],
})
export class PrismaModule {}
