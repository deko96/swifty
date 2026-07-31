ALTER TABLE "nodes" ADD COLUMN "token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "daemon_version" varchar(32);--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "inventory" jsonb;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_token_hash_unique" UNIQUE("token_hash");