import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { EvaluationModule } from '../evaluation/evaluation.module.js';
import { FlagsController } from './flags.controller.js';
import { FlagsService } from './flags.service.js';

@Module({
  imports: [AuditModule, EvaluationModule],
  controllers: [FlagsController],
  providers: [FlagsService],
})
export class FlagsModule {}
