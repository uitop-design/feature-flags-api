import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller.js';
import { EvaluationService } from './evaluation.service.js';
import { SdkKeyGuard } from './sdk-key.guard.js';
import { SdkKeyService } from './sdk-key.service.js';
import { SnapshotCacheService } from './snapshot-cache.service.js';

@Module({
  controllers: [EvaluationController],
  providers: [EvaluationService, SdkKeyService, SdkKeyGuard, SnapshotCacheService],
  exports: [SnapshotCacheService],
})
export class EvaluationModule {}
