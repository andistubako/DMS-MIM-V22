CREATE TABLE "areas" (
	"id" text PRIMARY KEY NOT NULL,
	"area_name" text NOT NULL,
	"area_code" text,
	"office_id" text,
	"regency_id" text,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"check_in_time" timestamp,
	"check_in_lat" double precision,
	"check_in_lng" double precision,
	"check_in_photo" text,
	"check_in_distance" double precision,
	"check_out_time" timestamp,
	"check_out_lat" double precision,
	"check_out_lng" double precision,
	"check_out_photo" text,
	"status" text DEFAULT 'PRESENT',
	"notes" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"target_id" text,
	"details" jsonb,
	"ip_address" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "call_plan_items" (
	"id" text PRIMARY KEY NOT NULL,
	"call_plan_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"sequence" integer DEFAULT 1,
	"status" text DEFAULT 'PLANNED',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "call_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"plan_date" text NOT NULL,
	"status" text DEFAULT 'ACTIVE',
	"total_outlets" integer DEFAULT 0,
	"visited_outlets" integer DEFAULT 0,
	"effective_calls" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_name" text NOT NULL,
	"channel_code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "company_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"company_legal_name" text,
	"company_code" text,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"description" text,
	"logo_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" text PRIMARY KEY NOT NULL,
	"regency_id" text,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dms_document_store" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gps_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" double precision,
	"battery_level" integer,
	"event_type" text DEFAULT 'HEARTBEAT',
	"timestamp" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"location_type" text NOT NULL,
	"location_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"stock_on_hand" integer DEFAULT 0,
	"allocated_stock" integer DEFAULT 0,
	"available_stock" integer DEFAULT 0,
	"reorder_level" integer DEFAULT 10,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" text PRIMARY KEY NOT NULL,
	"office_name" text NOT NULL,
	"office_code" text,
	"address" text,
	"phone" text,
	"latitude" double precision,
	"longitude" double precision,
	"radius_meters" integer DEFAULT 100,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "open_call_reasons" (
	"id" text PRIMARY KEY NOT NULL,
	"reason_code" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'GENERAL',
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_name" text NOT NULL,
	"outlet_code" text NOT NULL,
	"channel_id" text,
	"area_id" text,
	"route_id" text,
	"address" text,
	"phone" text,
	"owner_name" text,
	"latitude" double precision,
	"longitude" double precision,
	"status" text DEFAULT 'ACTIVE',
	"image_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "outlets_outlet_code_unique" UNIQUE("outlet_code")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" text PRIMARY KEY NOT NULL,
	"sku_id" text NOT NULL,
	"price_type" text DEFAULT 'DEFAULT',
	"price_value" double precision NOT NULL,
	"min_qty" integer DEFAULT 1,
	"channel_id" text,
	"area_id" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"product_name" text NOT NULL,
	"product_code" text,
	"category" text,
	"brand" text,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "promos" (
	"id" text PRIMARY KEY NOT NULL,
	"promo_name" text NOT NULL,
	"promo_code" text,
	"promo_type" text,
	"discount_percent" double precision,
	"discount_amount" double precision,
	"start_date" timestamp,
	"end_date" timestamp,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "regencies" (
	"id" text PRIMARY KEY NOT NULL,
	"province_id" text,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"route_name" text NOT NULL,
	"route_code" text,
	"area_id" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "sales_outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"visit_day" text,
	"visit_frequency" text DEFAULT 'WEEKLY',
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "sales_stock_ledgers" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"date" text NOT NULL,
	"sku_id" text NOT NULL,
	"initial_stock" integer DEFAULT 0,
	"loaded_stock" integer DEFAULT 0,
	"sold_stock" integer DEFAULT 0,
	"returned_stock" integer DEFAULT 0,
	"final_stock" integer DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "salesmen" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"office_id" text,
	"area_id" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"sku_code" text NOT NULL,
	"sku_name" text NOT NULL,
	"barcode" text,
	"uom" text DEFAULT 'PCS',
	"pack_size" integer DEFAULT 1,
	"base_price" double precision DEFAULT 0,
	"status" text DEFAULT 'ACTIVE',
	"image_url" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "skus_sku_code_unique" UNIQUE("sku_code")
);
--> statement-breakpoint
CREATE TABLE "stock_handovers" (
	"id" text PRIMARY KEY NOT NULL,
	"handover_number" text NOT NULL,
	"salesman_id" text NOT NULL,
	"office_id" text,
	"handover_date" text NOT NULL,
	"status" text DEFAULT 'PENDING',
	"items" jsonb NOT NULL,
	"notes" text,
	"approved_by" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "stock_handovers_handover_number_unique" UNIQUE("handover_number")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_type" text NOT NULL,
	"source_location_type" text,
	"source_location_id" text,
	"dest_location_type" text,
	"dest_location_id" text,
	"sku_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"reference_id" text,
	"performed_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"notes" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "stock_receivings" (
	"id" text PRIMARY KEY NOT NULL,
	"receiving_number" text NOT NULL,
	"po_number" text,
	"office_id" text NOT NULL,
	"supplier_name" text,
	"received_date" text NOT NULL,
	"status" text DEFAULT 'DRAFT',
	"total_quantity" integer DEFAULT 0,
	"total_value" double precision DEFAULT 0,
	"items" jsonb NOT NULL,
	"notes" text,
	"received_by" text NOT NULL,
	"posted_by" text,
	"posted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "stock_receivings_receiving_number_unique" UNIQUE("receiving_number")
);
--> statement-breakpoint
CREATE TABLE "stock_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"return_number" text NOT NULL,
	"salesman_id" text NOT NULL,
	"office_id" text,
	"return_date" text NOT NULL,
	"status" text DEFAULT 'PENDING',
	"items" jsonb NOT NULL,
	"notes" text,
	"approved_by" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "stock_returns_return_number_unique" UNIQUE("return_number")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"settings_data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"period_month" text NOT NULL,
	"target_revenue" double precision DEFAULT 0,
	"target_volume" integer DEFAULT 0,
	"target_calls" integer DEFAULT 0,
	"target_effective_calls" integer DEFAULT 0,
	"target_new_outlets" integer DEFAULT 0,
	"achieved_revenue" double precision DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"salesman_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"visit_id" text,
	"office_id" text,
	"transaction_type" text DEFAULT 'CASH',
	"subtotal" double precision DEFAULT 0,
	"discount_amount" double precision DEFAULT 0,
	"tax_amount" double precision DEFAULT 0,
	"total_amount" double precision DEFAULT 0,
	"paid_amount" double precision DEFAULT 0,
	"payment_status" text DEFAULT 'UNPAID',
	"delivery_status" text DEFAULT 'DELIVERED',
	"items" jsonb NOT NULL,
	"invoice_pdf_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "transactions_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'ACTIVE',
	"phone" text,
	"password_hash" text,
	"avatar_url" text,
	"office_id" text,
	"area_id" text,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "villages" (
	"id" text PRIMARY KEY NOT NULL,
	"district_id" text,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"call_plan_id" text,
	"check_in_time" timestamp DEFAULT now(),
	"check_in_lat" double precision,
	"check_in_lng" double precision,
	"check_in_distance" double precision,
	"check_in_photo" text,
	"check_out_time" timestamp,
	"visit_duration_seconds" integer,
	"is_effective_call" boolean DEFAULT false,
	"non_productive_reason_id" text,
	"notes" text,
	"status" text DEFAULT 'COMPLETED',
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_regency_id_regencies_id_fk" FOREIGN KEY ("regency_id") REFERENCES "public"."regencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_plan_items" ADD CONSTRAINT "call_plan_items_call_plan_id_call_plans_id_fk" FOREIGN KEY ("call_plan_id") REFERENCES "public"."call_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_plan_items" ADD CONSTRAINT "call_plan_items_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_plans" ADD CONSTRAINT "call_plans_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_regency_id_regencies_id_fk" FOREIGN KEY ("regency_id") REFERENCES "public"."regencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_events" ADD CONSTRAINT "gps_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regencies" ADD CONSTRAINT "regencies_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_outlets" ADD CONSTRAINT "sales_outlets_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_outlets" ADD CONSTRAINT "sales_outlets_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stock_ledgers" ADD CONSTRAINT "sales_stock_ledgers_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stock_ledgers" ADD CONSTRAINT "sales_stock_ledgers_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesmen" ADD CONSTRAINT "salesmen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesmen" ADD CONSTRAINT "salesmen_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesmen" ADD CONSTRAINT "salesmen_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_handovers" ADD CONSTRAINT "stock_handovers_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_handovers" ADD CONSTRAINT "stock_handovers_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_handovers" ADD CONSTRAINT "stock_handovers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receivings" ADD CONSTRAINT "stock_receivings_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receivings" ADD CONSTRAINT "stock_receivings_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_receivings" ADD CONSTRAINT "stock_receivings_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villages" ADD CONSTRAINT "villages_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_call_plan_id_call_plans_id_fk" FOREIGN KEY ("call_plan_id") REFERENCES "public"."call_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_non_productive_reason_id_open_call_reasons_id_fk" FOREIGN KEY ("non_productive_reason_id") REFERENCES "public"."open_call_reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_user_idx" ON "attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "call_plan_items_plan_idx" ON "call_plan_items" USING btree ("call_plan_id");--> statement-breakpoint
CREATE INDEX "call_plan_items_outlet_idx" ON "call_plan_items" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "call_plans_salesman_idx" ON "call_plans" USING btree ("salesman_id");--> statement-breakpoint
CREATE INDEX "call_plans_date_idx" ON "call_plans" USING btree ("plan_date");--> statement-breakpoint
CREATE INDEX "gps_user_idx" ON "gps_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gps_time_idx" ON "gps_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "inventory_loc_idx" ON "inventory" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "inventory_sku_idx" ON "inventory" USING btree ("sku_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_loc_sku_uniq" ON "inventory" USING btree ("location_id","sku_id");--> statement-breakpoint
CREATE INDEX "outlets_area_idx" ON "outlets" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "outlets_channel_idx" ON "outlets" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "sales_outlets_salesman_idx" ON "sales_outlets" USING btree ("salesman_id");--> statement-breakpoint
CREATE INDEX "sales_outlets_outlet_idx" ON "sales_outlets" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "ssl_salesman_idx" ON "sales_stock_ledgers" USING btree ("salesman_id");--> statement-breakpoint
CREATE INDEX "ssl_date_idx" ON "sales_stock_ledgers" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "ssl_salesman_date_sku_uniq" ON "sales_stock_ledgers" USING btree ("salesman_id","date","sku_id");--> statement-breakpoint
CREATE INDEX "salesmen_user_idx" ON "salesmen" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skus_product_idx" ON "skus" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "handover_salesman_idx" ON "stock_handovers" USING btree ("salesman_id");--> statement-breakpoint
CREATE INDEX "handover_date_idx" ON "stock_handovers" USING btree ("handover_date");--> statement-breakpoint
CREATE INDEX "stock_mov_sku_idx" ON "stock_movements" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "stock_mov_time_idx" ON "stock_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "receiving_office_idx" ON "stock_receivings" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "receiving_date_idx" ON "stock_receivings" USING btree ("received_date");--> statement-breakpoint
CREATE INDEX "return_salesman_idx" ON "stock_returns" USING btree ("salesman_id");--> statement-breakpoint
CREATE INDEX "return_date_idx" ON "stock_returns" USING btree ("return_date");--> statement-breakpoint
CREATE UNIQUE INDEX "target_salesman_period_uniq" ON "targets" USING btree ("salesman_id","period_month");--> statement-breakpoint
CREATE INDEX "txn_salesman_idx" ON "transactions" USING btree ("salesman_id");--> statement-breakpoint
CREATE INDEX "txn_outlet_idx" ON "transactions" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "txn_created_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_office_idx" ON "users" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "visits_salesman_idx" ON "visits" USING btree ("salesman_id");--> statement-breakpoint
CREATE INDEX "visits_outlet_idx" ON "visits" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "visits_time_idx" ON "visits" USING btree ("check_in_time");