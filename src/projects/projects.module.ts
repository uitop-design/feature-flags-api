import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { EvaluationModule } from '../evaluation/evaluation.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [AuditModule, EvaluationModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
