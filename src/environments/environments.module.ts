import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { EvaluationModule } from '../evaluation/evaluation.module.js';
import { EnvironmentsController } from './environments.controller.js';
import { EnvironmentsService } from './environments.service.js';

@Module({
  imports: [AuditModule, EvaluationModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService],
})
export class EnvironmentsModule {}
