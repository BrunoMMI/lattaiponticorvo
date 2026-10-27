ALTER TABLE "items" ADD COLUMN "weight_step_grams" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "stock_units" integer DEFAULT 0 NOT NULL;