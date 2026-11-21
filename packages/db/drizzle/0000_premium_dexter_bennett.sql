CREATE TABLE "repositories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"root_path" text NOT NULL,
	"remote_url" text,
	"default_branch" varchar(100) DEFAULT 'main',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"commit_sha" varchar(64),
	"branch" varchar(100),
	"status" varchar(50) DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"relative_path" text NOT NULL,
	"language" varchar(50) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"size_bytes" integer NOT NULL,
	"parse_status" varchar(50) DEFAULT 'parsed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_symbols" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"file_id" text NOT NULL,
	"file_path" text NOT NULL,
	"name" text NOT NULL,
	"qualified_name" text NOT NULL,
	"kind" varchar(50) NOT NULL,
	"exported" boolean DEFAULT false NOT NULL,
	"signature_fingerprint" text,
	"parent_symbol_id" text,
	"start_line" integer NOT NULL,
	"start_column" integer NOT NULL,
	"end_line" integer NOT NULL,
	"end_column" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dependency_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"source_symbol_id" text NOT NULL,
	"target_symbol_id" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"resolution_status" varchar(50) NOT NULL,
	"confidence" varchar(50) NOT NULL,
	"evidence_file" text NOT NULL,
	"evidence_line" integer NOT NULL,
	"evidence_column" integer,
	"evidence_snippet" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "impact_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"impact_run_id" text NOT NULL,
	"symbol_id" text,
	"file_path" text NOT NULL,
	"kind" varchar(50) NOT NULL,
	"distance" integer NOT NULL,
	"confidence" varchar(50) NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"base_ref" varchar(100),
	"target_ref" varchar(100),
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_affected_files" integer DEFAULT 0 NOT NULL,
	"total_affected_symbols" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostics" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"code" varchar(50) NOT NULL,
	"message" text NOT NULL,
	"severity" varchar(20) NOT NULL,
	"file_path" text,
	"line" integer,
	"column" integer
);
--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edges" ADD CONSTRAINT "dependency_edges_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_findings" ADD CONSTRAINT "impact_findings_impact_run_id_impact_runs_id_fk" FOREIGN KEY ("impact_run_id") REFERENCES "public"."impact_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_runs" ADD CONSTRAINT "impact_runs_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostics" ADD CONSTRAINT "diagnostics_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE cascade ON UPDATE no action;