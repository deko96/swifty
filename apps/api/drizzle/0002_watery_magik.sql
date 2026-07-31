ALTER TABLE "servers" ADD COLUMN "sftp_username" varchar(40) NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sftp_password_hash" text;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_sftp_username_unique" UNIQUE("sftp_username");