-- Zalo label IDs are scoped to a Zalo account, not globally unique. A
-- managed CrmTag belongs to that account through its CrmTagGroup, so both
-- label identity and display-name uniqueness must be scoped by group_id.
DROP INDEX "crm_tags_org_id_name_key";
DROP INDEX "crm_tags_source_zalo_label_id_key";

CREATE UNIQUE INDEX "crm_tags_group_id_name_key"
  ON "crm_tags"("group_id", "name");

CREATE UNIQUE INDEX "crm_tags_group_id_source_zalo_label_id_key"
  ON "crm_tags"("group_id", "source_zalo_label_id");

-- PostgreSQL treats NULL values as distinct in a normal composite unique
-- index. Keep the legacy invariant for manual/ungrouped CRM tags explicitly.
CREATE UNIQUE INDEX "crm_tags_org_name_ungrouped_key"
  ON "crm_tags"("org_id", "name")
  WHERE "group_id" IS NULL;
