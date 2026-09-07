-- CreateEnum
CREATE TYPE "ExecutionTrigger" AS ENUM ('manual', 'cron');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('success', 'partial', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "step_executions" (
    "id" UUID NOT NULL,
    "step_instance_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "trigger" "ExecutionTrigger" NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "details" JSONB,
    "triggered_by" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "step_executions_session_id_at_idx" ON "step_executions"("session_id", "at");

-- CreateIndex
CREATE INDEX "step_executions_step_instance_id_at_idx" ON "step_executions"("step_instance_id", "at");

-- CreateIndex
CREATE INDEX "step_executions_status_at_idx" ON "step_executions"("status", "at");

-- AddForeignKey
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_step_instance_id_fkey" FOREIGN KEY ("step_instance_id") REFERENCES "step_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
