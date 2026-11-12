import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { SDK_KEY_PATTERN } from '../src/environments/sdk-key.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ quiet: true });

interface SeedState {
  enabled: boolean;
  rolloutPercentage: number;
  includeUsers: string[];
  excludeUsers: string[];
}

interface SeedFlag {
  key: string;
  name: string;
  description: string | null;
  states: Record<string, SeedState>;
}

interface SeedProject {
  key: string;
  name: string;
  environments: { key: string; name: string; sdkKey: string }[];
  flags: SeedFlag[];
}

const disabled: SeedState = {
  enabled: false,
  rolloutPercentage: 100,
  includeUsers: [],
  excludeUsers: [],
};

function rollout(rolloutPercentage: number, targeting: Partial<SeedState> = {}): SeedState {
  return { ...disabled, enabled: true, rolloutPercentage, ...targeting };
}

const projects: SeedProject[] = [
  {
    key: 'storefront',
    name: 'Storefront',
    environments: [
      {
        key: 'development',
        name: 'Development',
        sdkKey: 'sdk_storefrontDevelopmentSeedKey0001',
      },
      { key: 'staging', name: 'Staging', sdkKey: 'sdk_storefrontStagingSeedKey00000001' },
      { key: 'production', name: 'Production', sdkKey: 'sdk_storefrontProductionSeedKey00001' },
    ],
    flags: [
      {
        key: 'new-checkout',
        name: 'New checkout',
        description: 'Single-page checkout with saved payment methods',
        states: { development: rollout(100), staging: rollout(100), production: rollout(25) },
      },
      {
        key: 'dark-mode',
        name: 'Dark mode',
        description: null,
        states: {},
      },
      {
        key: 'search.v2',
        name: 'Search v2',
        description: 'Semantic search backend',
        states: {
          development: rollout(100),
          staging: rollout(50),
          production: rollout(10, {
            includeUsers: ['qa-alice', 'qa-bob'],
            excludeUsers: ['user-1042'],
          }),
        },
      },
      {
        key: 'promo_banner',
        name: 'Promo banner',
        description: 'Seasonal banner, shown to beta testers only',
        states: {
          production: { ...disabled, includeUsers: ['beta-tester-1', 'beta-tester-2'] },
        },
      },
    ],
  },
  {
    key: 'mobile-app',
    name: 'Mobile app',
    environments: [
      {
        key: 'development',
        name: 'Development',
        sdkKey: 'sdk_mobileAppDevelopmentSeedKey00001',
      },
      { key: 'production', name: 'Production', sdkKey: 'sdk_mobileAppProductionSeedKey000001' },
    ],
    flags: [
      {
        key: 'onboarding-v2',
        name: 'Onboarding v2',
        description: 'Shorter onboarding with social sign-in',
        states: { development: rollout(100), production: rollout(25) },
      },
      {
        key: 'offline-mode',
        name: 'Offline mode',
        description: null,
        states: {
          development: rollout(100),
          production: rollout(100, { excludeUsers: ['device-legacy-1', 'device-legacy-2'] }),
        },
      },
      {
        key: 'push-reminders',
        name: 'Push reminders',
        description: 'Daily reminder notifications',
        states: {},
      },
    ],
  },
];

async function seedProject(prisma: PrismaClient, seed: SeedProject): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const project = await tx.project.upsert({
      where: { key: seed.key },
      create: { key: seed.key, name: seed.name },
      update: { name: seed.name },
      select: { id: true },
    });
    const environments = new Map<string, string>();
    for (const environment of seed.environments) {
      const { id } = await tx.environment.upsert({
        where: { projectId_key: { projectId: project.id, key: environment.key } },
        create: { projectId: project.id, ...environment },
        update: { name: environment.name, sdkKey: environment.sdkKey },
        select: { id: true },
      });
      environments.set(environment.key, id);
    }
    for (const flag of seed.flags) {
      const { id: flagId } = await tx.flag.upsert({
        where: { projectId_key: { projectId: project.id, key: flag.key } },
        create: {
          projectId: project.id,
          key: flag.key,
          name: flag.name,
          description: flag.description,
        },
        update: { name: flag.name, description: flag.description },
        select: { id: true },
      });
      for (const [environmentKey, environmentId] of environments) {
        const state = flag.states[environmentKey] ?? disabled;
        await tx.flagState.upsert({
          where: { flagId_environmentId: { flagId, environmentId } },
          create: { flagId, environmentId, ...state },
          update: state,
        });
      }
    }
  });
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const invalidKey = projects
    .flatMap((project) => project.environments)
    .find(({ sdkKey }) => !SDK_KEY_PATTERN.test(sdkKey));
  if (invalidKey) {
    throw new Error(`Seed SDK key ${invalidKey.sdkKey} has an invalid format`);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    for (const project of projects) {
      await seedProject(prisma, project);
    }
    process.stdout.write(`Seeded ${projects.length} projects\n`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
