-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('FLAG_CREATED', 'FLAG_UPDATED', 'FLAG_DELETED', 'STATE_UPDATED', 'ENVIRONMENT_CREATED', 'SDK_KEY_ROTATED');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "key" VARCHAR(48) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" VARCHAR(48) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "sdk_key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flags" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" VARCHAR(48) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag_states" (
    "flag_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 100,
    "include_users" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "exclude_users" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flag_states_pkey" PRIMARY KEY ("flag_id","environment_id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "action" "audit_action" NOT NULL,
    "flag_key" VARCHAR(48),
    "environment_key" VARCHAR(48),
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_key_key" ON "projects"("key");

-- CreateIndex
CREATE UNIQUE INDEX "environments_sdk_key_key" ON "environments"("sdk_key");

-- CreateIndex
CREATE UNIQUE INDEX "environments_project_id_key_key" ON "environments"("project_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "flags_project_id_key_key" ON "flags"("project_id", "key");

-- CreateIndex
CREATE INDEX "flag_states_environment_id_idx" ON "flag_states"("environment_id");

-- CreateIndex
CREATE INDEX "audit_entries_project_id_created_at_idx" ON "audit_entries"("project_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flags" ADD CONSTRAINT "flags_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag_states" ADD CONSTRAINT "flag_states_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag_states" ADD CONSTRAINT "flag_states_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddCheckConstraint
ALTER TABLE "flag_states" ADD CONSTRAINT "flag_states_rollout_percentage_check" CHECK ("rollout_percentage" BETWEEN 0 AND 100);
