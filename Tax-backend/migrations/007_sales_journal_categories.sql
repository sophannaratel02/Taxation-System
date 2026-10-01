UPDATE sale_records
SET
  non_taxable_sale_usd = IF(sale_type = 'non_taxable', taxable_amount_usd, non_taxable_sale_usd),
  non_taxable_sale_khr = IF(sale_type = 'non_taxable', taxable_amount_khr, non_taxable_sale_khr),
  export_sale_usd = IF(sale_type = 'export_0', taxable_amount_usd, export_sale_usd),
  export_sale_khr = IF(sale_type = 'export_0', taxable_amount_khr, export_sale_khr),
  taxable_person_value_usd = IF(sale_type = 'taxable_person_10', taxable_amount_usd, taxable_person_value_usd),
  taxable_person_value_khr = IF(sale_type = 'taxable_person_10', taxable_amount_khr, taxable_person_value_khr),
  taxable_person_vat_usd = IF(sale_type = 'taxable_person_10', ROUND(taxable_amount_usd * vat_rate, 2), taxable_person_vat_usd),
  taxable_person_vat_khr = IF(sale_type = 'taxable_person_10', vat_amount_khr, taxable_person_vat_khr),
  local_sale_value_usd = IF(sale_type = 'local_consumer_10', taxable_amount_usd, local_sale_value_usd),
  local_sale_value_khr = IF(sale_type = 'local_consumer_10', taxable_amount_khr, local_sale_value_khr),
  local_sale_vat_usd = IF(sale_type = 'local_consumer_10', ROUND(taxable_amount_usd * vat_rate, 2), local_sale_vat_usd),
  local_sale_vat_khr = IF(sale_type = 'local_consumer_10', vat_amount_khr, local_sale_vat_khr),
  sale_categories_migrated = 1
WHERE sale_categories_migrated = 0;