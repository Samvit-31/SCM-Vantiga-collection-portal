


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'pratinidhi',
    'treasurer',
    'auditor',
    'scm_office'
);


ALTER TYPE "public"."app_role" OWNER TO "supabase_admin";


CREATE TYPE "public"."entry_status" AS ENUM (
    'SUBMITTED',
    'ACKNOWLEDGED',
    'REJECTED'
);


ALTER TYPE "public"."entry_status" OWNER TO "supabase_admin";


CREATE TYPE "public"."gender" AS ENUM (
    'Male',
    'Female',
    'Others',
    'U'
);


ALTER TYPE "public"."gender" OWNER TO "supabase_admin";


CREATE TYPE "public"."paid_by" AS ENUM (
    'Cash',
    'Cheque',
    'NEFT/RTGS/IMPS',
    'Online',
    'UPI'
);


ALTER TYPE "public"."paid_by" OWNER TO "supabase_admin";


CREATE OR REPLACE FUNCTION "public"."block_entry_edits"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (tg_op = 'UPDATE') then
    if (
      new.sabha_id <> old.sabha_id or
      new.family_id <> old.family_id or
      new.fy <> old.fy or
      new.paid_by <> old.paid_by or
      coalesce(new.reference_no,'') <> coalesce(old.reference_no,'') or
      new.submitted_by <> old.submitted_by or
      new.submitted_at <> old.submitted_at
    ) then
      raise exception 'Edits to submitted entry data are not allowed.';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."block_entry_edits"() OWNER TO "supabase_admin";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."families" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sabha_id" "uuid" NOT NULL,
    "family_code" "text",
    "address_multiline" "text",
    "payer_mobile" "text",
    "payer_email" "text",
    "opt_show_amount_in_directory" boolean DEFAULT false NOT NULL,
    "opt_show_mobile_in_directory" boolean DEFAULT false NOT NULL,
    "opt_show_email_in_directory" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."families" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."family_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "age" integer,
    "gender" "public"."gender" DEFAULT 'U'::"public"."gender" NOT NULL,
    "gotra" "text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_primary_payer" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."family_members" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "is_scm_office" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."sabhas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sabhas" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."user_sabha_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sabha_id" "uuid",
    "role" "public"."app_role" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_sabha_roles" OWNER TO "supabase_admin";


CREATE TABLE IF NOT EXISTS "public"."vantiga_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sabha_id" "uuid" NOT NULL,
    "family_id" "uuid" NOT NULL,
    "fy" "text" NOT NULL,
    "paid_by" "public"."paid_by" NOT NULL,
    "reference_no" "text",
    "status" "public"."entry_status" DEFAULT 'SUBMITTED'::"public"."entry_status" NOT NULL,
    "rejection_reason" "text",
    "submitted_by" "uuid" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_by" "uuid",
    "acknowledged_at" timestamp with time zone,
    "receipt_no" "text",
    "receipt_generated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vantiga_entries" OWNER TO "supabase_admin";


ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_family_code_key" UNIQUE ("family_code");



ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."sabhas"
    ADD CONSTRAINT "sabhas_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."sabhas"
    ADD CONSTRAINT "sabhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_sabha_roles"
    ADD CONSTRAINT "user_sabha_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_sabha_roles"
    ADD CONSTRAINT "user_sabha_roles_user_id_sabha_id_role_key" UNIQUE ("user_id", "sabha_id", "role");



ALTER TABLE ONLY "public"."vantiga_entries"
    ADD CONSTRAINT "vantiga_entries_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "one_primary_payer_per_family" ON "public"."family_members" USING "btree" ("family_id") WHERE ("is_primary_payer" = true);



CREATE UNIQUE INDEX "unique_reference_per_sabha_fy" ON "public"."vantiga_entries" USING "btree" ("sabha_id", "fy", "paid_by", "reference_no") WHERE (("reference_no" IS NOT NULL) AND ("reference_no" <> ''::"text") AND ("paid_by" = ANY (ARRAY['Cheque'::"public"."paid_by", 'NEFT/RTGS/IMPS'::"public"."paid_by", 'Online'::"public"."paid_by", 'UPI'::"public"."paid_by"])));



CREATE OR REPLACE TRIGGER "trg_block_entry_edits" BEFORE UPDATE ON "public"."vantiga_entries" FOR EACH ROW EXECUTE FUNCTION "public"."block_entry_edits"();



ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_sabha_id_fkey" FOREIGN KEY ("sabha_id") REFERENCES "public"."sabhas"("id");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sabha_roles"
    ADD CONSTRAINT "user_sabha_roles_sabha_id_fkey" FOREIGN KEY ("sabha_id") REFERENCES "public"."sabhas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sabha_roles"
    ADD CONSTRAINT "user_sabha_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vantiga_entries"
    ADD CONSTRAINT "vantiga_entries_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."vantiga_entries"
    ADD CONSTRAINT "vantiga_entries_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id");



ALTER TABLE ONLY "public"."vantiga_entries"
    ADD CONSTRAINT "vantiga_entries_sabha_id_fkey" FOREIGN KEY ("sabha_id") REFERENCES "public"."sabhas"("id");



ALTER TABLE ONLY "public"."vantiga_entries"
    ADD CONSTRAINT "vantiga_entries_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id");





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."block_entry_edits"() TO "postgres";
GRANT ALL ON FUNCTION "public"."block_entry_edits"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_entry_edits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_entry_edits"() TO "service_role";


















GRANT ALL ON TABLE "public"."families" TO "postgres";
GRANT ALL ON TABLE "public"."families" TO "anon";
GRANT ALL ON TABLE "public"."families" TO "authenticated";
GRANT ALL ON TABLE "public"."families" TO "service_role";



GRANT ALL ON TABLE "public"."family_members" TO "postgres";
GRANT ALL ON TABLE "public"."family_members" TO "anon";
GRANT ALL ON TABLE "public"."family_members" TO "authenticated";
GRANT ALL ON TABLE "public"."family_members" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "postgres";
GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."sabhas" TO "postgres";
GRANT ALL ON TABLE "public"."sabhas" TO "anon";
GRANT ALL ON TABLE "public"."sabhas" TO "authenticated";
GRANT ALL ON TABLE "public"."sabhas" TO "service_role";



GRANT ALL ON TABLE "public"."user_sabha_roles" TO "postgres";
GRANT ALL ON TABLE "public"."user_sabha_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_sabha_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sabha_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vantiga_entries" TO "postgres";
GRANT ALL ON TABLE "public"."vantiga_entries" TO "anon";
GRANT ALL ON TABLE "public"."vantiga_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."vantiga_entries" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































