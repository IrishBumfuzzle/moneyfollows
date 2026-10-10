CREATE TABLE "centres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"name" text NOT NULL,
	"class_code" text NOT NULL,
	"default_language" text NOT NULL,
	"facilitator_id" uuid NOT NULL,
	"programme_ends_at" timestamp with time zone,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_class_code_unique" UNIQUE("class_code")
);
--> statement-breakpoint
CREATE TABLE "decision_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"class_id" uuid,
	"scenario_id" text NOT NULL,
	"choice_id" text NOT NULL,
	"pillar" text,
	"rewound" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"class_id" uuid,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"seq" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"persona_id" text NOT NULL,
	"pack_version" text NOT NULL,
	"state" jsonb NOT NULL,
	"month" smallint NOT NULL,
	"week" smallint NOT NULL,
	"score" smallint,
	"seed" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"class_id" uuid,
	"kind" text NOT NULL,
	"pillar" text,
	"question_ids" jsonb NOT NULL,
	"answers" jsonb,
	"score" smallint,
	"by_pillar" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"profile_id" uuid NOT NULL,
	"badge_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rewards_profile_id_badge_id_pk" PRIMARY KEY("profile_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"anon_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid,
	"nickname" text NOT NULL,
	"avatar" text,
	"grade_band" text,
	"language" text NOT NULL,
	"maturity_level" smallint DEFAULT 1 NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "centres" ADD CONSTRAINT "centres_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_facilitator_id_staff_users_id_fk" FOREIGN KEY ("facilitator_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_events" ADD CONSTRAINT "decision_events_event_id_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_profile_id_student_profiles_anon_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."student_profiles"("anon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_saves" ADD CONSTRAINT "game_saves_profile_id_student_profiles_anon_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."student_profiles"("anon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_profile_id_student_profiles_anon_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."student_profiles"("anon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_profile_id_student_profiles_anon_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."student_profiles"("anon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "centres_org_idx" ON "centres" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "classes_facilitator_idx" ON "classes" USING btree ("facilitator_id");--> statement-breakpoint
CREATE INDEX "classes_centre_idx" ON "classes" USING btree ("centre_id");--> statement-breakpoint
CREATE INDEX "decision_events_class_idx" ON "decision_events" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "decision_events_profile_idx" ON "decision_events" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "events_profile_seq_idx" ON "events" USING btree ("profile_id","seq");--> statement-breakpoint
CREATE INDEX "events_class_type_idx" ON "events" USING btree ("class_id","type");--> statement-breakpoint
CREATE INDEX "game_saves_profile_idx" ON "game_saves" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_class_kind_idx" ON "quiz_attempts" USING btree ("class_id","kind");--> statement-breakpoint
CREATE INDEX "quiz_attempts_profile_idx" ON "quiz_attempts" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_class_nickname_uq" ON "student_profiles" USING btree ("class_id",lower("nickname"));