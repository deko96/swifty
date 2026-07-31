CREATE TYPE "public"."server_power_state" AS ENUM('offline', 'installing', 'starting', 'running', 'stopping', 'crashed');--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "power_state" "server_power_state" DEFAULT 'offline' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "power_state_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "last_exit_code" integer;