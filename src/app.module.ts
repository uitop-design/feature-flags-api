import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE, RouterModule } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { AppValidationPipe } from './common/validation/zod-validation.pipe.js';
import { ConfigModule } from './config/config.module.js';
import { EnvironmentsModule } from './environments/environments.module.js';
import { EvaluationModule } from './evaluation/evaluation.module.js';
import { FlagsModule } from './flags/flags.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { RedisModule } from './redis/redis.module.js';

const apiModules = [
  ProjectsModule,
  EnvironmentsModule,
  FlagsModule,
  AuditModule,
  EvaluationModule,
  HealthModule,
];

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    ...apiModules,
    RouterModule.register([{ path: 'api', children: apiModules }]),
  ],
  providers: [
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
