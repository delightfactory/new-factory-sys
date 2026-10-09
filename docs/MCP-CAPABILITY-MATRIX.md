# Checkpoint 4 reconciliation

This source-only matrix incorporates the last bounded fix: four factory_edit_* tools now expose atomic native inventory edit; quantity/cost changes require a reason and preserve derived costs. Exact deletion routes replaced generic section routes. The root agent reports the latest serial full run as 62 pass / 0 fail in 13.678 seconds, with latest PostgreSQL 17 and Vercel checks also PASS; this independent audit did not rerun them. Other P entries remain pending; this is not a claim of complete UI parity.

# Factory source capability matrix — review draft, 2026-10-09

Read-only source audit of `factory-mcp`, branch `feat/remote-mcp-foundation`.
Compared current services with Git HEAD/main reference
`8b2422eeb0bcd59f5ada330835da2979213b1f6e` via diff. Sources:
`src/services/*.ts`, `src/pages/reports/index.tsx`, `mcp/catalog.mjs`,
`mcp/tools.mjs`, `mcp/analytics.mjs`, comprehensive SQL migration.
No tests or live operations performed for this matrix.

Status: **S** = source tool/dispatcher exists, runtime/semantic parity not proved
by this audit; **H** = protected native handoff, not MCP execution;
**P** = parity gap or validation pending; **L** = local presentation/helper,
not a business mutation. Tool names below include the `factory_` prefix.
An S entry is not a blanket production-readiness or complete-coverage claim.

## Ten modified native services

| Service | Main behavior → current command path | Exceptions still native / risk |
|---|---|---|
| InventoryService | Client CRUD/recipe replace/order header+lines and completion RPC → inventoryCommand/factoryCommand | Reads and deletes still direct; native and MCP edit_* combine metadata/recipe and explicit stock adjustment atomically; separate update/adjust tools remain available |
| BundlesService | Client bundle/components/assembly inserts and completion/cancel RPC → factoryCommand | Reads, availability, code helpers and delete still native |
| StocktakingService | Client session/count/cancel + snapshot/reconcile RPC → factoryCommand | Reads remain native; count first reads owning session_id |
| PartiesService | Client insert/update → create_party/update_party | Delete direct; reads direct |
| TreasuriesService | Client CRUD/deposit/withdraw/transfer/addTransaction → factoryCommand | Reads direct; opening balance supported, update balance stripped intentionally |
| FinancialService | Client category/transaction insertion and manual balance changes → commands | Category delete direct; transaction delete native command is intentionally NOT an MCP write tool |
| SalesInvoicesService | Client document insertion + process/void RPC → commercialCommand/factoryCommand | Reads/delete direct |
| PurchaseInvoicesService | Same above for purchases → commands | Reads/delete direct |
| SalesReturnsService | Client header/lines + post/void RPC → commands | Reads/delete direct |
| PurchaseReturnsService | Same above for purchase returns → commands | Reads/delete direct |

FactoryCommandsService is the added shared adapter (not an eleventh modified
old service): canonical payload hash plus per-user/action/payload request UUID,
pending UUID retained after error, `public.factory_write` RPC, result unwrap.
`commercialCommand` translates native date/item foreign keys; inventoryCommand
uses create_* or edit_* with metadata/recipe and explicit quantity/cost in one transaction.
Review error/retry semantics and API return shapes before claiming closure.

## Every service capability → tool or exact handoff

Grouped names are explicitly enumerated; one row may cover synonymous helpers.

| Source service / exported methods | MCP mapping | Status / limits |
|---|---|---|
| Inventory.getRawMaterials | list_records(resource=raw_materials) | S; pagination |
| Inventory.createRawMaterial | create_raw_material | S |
| Inventory.updateRawMaterial | edit_raw_material; update_raw_material; adjust_inventory | S: combined edit is atomic with required reason |
| Inventory.deleteRawMaterial | protected_handoff(delete_record,raw_materials,id) → /inventory | H; irreversible target confirmation |
| Inventory.getPackagingMaterials | list_records(packaging_materials) | S |
| Inventory.createPackagingMaterial | create_packaging_material | S |
| Inventory.updatePackagingMaterial | edit_packaging_material; update_packaging_material; adjust_inventory | S: combined edit is atomic with required reason |
| Inventory.deletePackagingMaterial | protected_handoff(delete_record,packaging_materials,id) → /inventory | H |
| Inventory.getSemiFinishedProducts | list_records(semi_finished_products) | S |
| Inventory.createSemiFinishedProductWithRecipe | create_semi_finished_product | S; recipe atomic |
| Inventory.updateSemiFinishedProductWithRecipe | edit_semi_finished_product; update_semi_finished_product; adjust_inventory | S: combined metadata/recipe/quantity edit is atomic; edit preserves system-owned unit cost |
| Inventory.getSemiFinishedIngredients | get_record(semi_finished_products,id) paged lines | S; full pagination required |
| Inventory.getSemiFinishedIngredientsWithStock | stock_requirements(kind=semi_finished,id,quantity) | S; recipe batch basis explicit |
| Inventory.getFinishedProductRequirementsWithStock | stock_requirements(kind=finished_product,id,quantity) | S |
| Inventory.deleteSemiFinishedProduct | protected_handoff(delete_record,semi_finished_products,id) → /inventory | H |
| Inventory.getFinishedProducts | list_records(finished_products) | S |
| Inventory.createFinishedProduct; createFinishedProductWithPackaging | create_finished_product | S; packaging array needed; helper-only bare creation defaults require validation |
| Inventory.updateFinishedProductWithPackaging | edit_finished_product; update_finished_product; adjust_inventory | S: combined metadata/packaging/quantity edit is atomic; edit preserves system-owned unit cost |
| Inventory.getFinishedProductPackaging | get_record(finished_products,id) paged lines | S |
| Inventory.deleteFinishedProduct | protected_handoff(delete_record,finished_products,id) → /inventory | H |
| Inventory.getProductionOrders | list_records(production_orders) | S |
| Inventory.getProductionOrderItems | get_record(production_orders,id) paged lines | S |
| Inventory.createProductionOrder; createQuickProductionOrder | create_production_order | S; server costs, native quick order originally zero estimate |
| Inventory.updateProductionOrderStatus | start/complete/cancel_production_order | S; pending/reset intentionally invalid |
| Inventory.completeProductionOrder; completeProductionOrderById | complete_production_order | S; WACO/consumption |
| Inventory.cancelProductionOrder | cancel_production_order | S; completed reversal requires recorded execution effects; legacy orders need explicit handling |
| Inventory.getPackagingOrders | list_records(packaging_orders) | S |
| Inventory.getPackagingOrderItems | get_record(packaging_orders,id) paged lines | S |
| Inventory.createPackagingOrder; createPackagingOrderWithItems | create_packaging_order | S |
| Inventory.updatePackagingOrderStatus | start/complete/cancel_packaging_order | S |
| Inventory.completePackagingOrder | complete_packaging_order | S |
| Inventory.cancelPackagingOrder | cancel_packaging_order | S; legacy reversal caveat |
| Inventory.analyzePackagingRequirements | stock_requirements(kind=packaging_order,id) | S; aggregate shortages |
| Packaging UI shortage supply sequence | create/complete_production_order then complete_packaging_order; fulfill_packaging_order | S; atomic helper returns phase IDs/costs, individual tools retain each phase |
| Inventory.getPendingProductionDemand; getPendingPackagingDemand; calculateAdjustedAvailability | stock_requirements pending_demand/adjusted_available | S/L; helper arithmetic not separate write |
| Inventory.getNextCode | create tools return allocated number | L/P: no standalone next-code preview tool, concurrent-safe creation preferable |
| Bundles.getBundles; getItemsForType | list_records(product_bundles or selected stock resource) | S; activeOnly filter parity needs checking |
| Bundles.getBundle | get_record(product_bundles,id) | S; components paged |
| Bundles.createBundle; updateBundle | create_bundle; update_bundle | S; cost recalculation and preserving old WACO need behavior proof |
| Bundles.deleteBundle | protected_handoff(delete_record,product_bundles,id) → /inventory | H; native stock>0 delete guard |
| Bundles.getAssemblyOrders; getAssemblyOrder | list_records(bundle_assembly_orders); get_record | S |
| Bundles.createAssemblyOrder; completeAssemblyOrder; cancelAssemblyOrder | create/complete/cancel_bundle_assembly_order | S; completed assembly reversal UNSUPPORTED by app and tool |
| Bundles.checkAvailability | stock_requirements(kind=bundle,id,quantity) | S; aggregate duplicate components |
| Bundles.generateBundleCode; generateAssemblyCode | creation returns code | L/P: no code-preview tool |
| Stocktaking.getSessions; getSession; getSessionItems | list_records(inventory_count_sessions); get_record | S; count lines paged |
| Stocktaking.createSession; startSession; updateItemCount; reconcileSession; cancelSession | create/start_stocktake; record_stocktake_counts; reconcile/cancel_stocktake | S; snapshot once, delta/current qty, preserved unit_cost |
| Parties.getParties; getParty | list_records(parties); get_record | S; type/search filtering parity check |
| Parties.createParty; updateParty | create_party; update_party | S; real opening balance; update balance intentionally unavailable |
| Parties.deleteParty | protected_handoff(delete_record,parties,uuid) → /financial | H |
| SalesInvoices.getInvoices; getUnpaidInvoices; getPostedInvoices; getInvoice | list_records(sales_invoices) filters + get_record | S/P: analyze cannot compare paid_amount < total_amount across columns. Consume all applicable pages and compare client-side, or add a fixed unpaid predicate; status alone is insufficient |
| SalesInvoices.createInvoice; processInvoice; voidInvoice | create/post/void_sales_invoice | S; all 5 item types, immediate payment+COGS, balance |
| SalesInvoices.deleteInvoice | protected_handoff(delete_record,sales_invoices,id) → /commercial | H; draft-only native guard |
| PurchaseInvoices.getInvoices; getUnpaidInvoices; getPostedInvoices; getInvoice | list_records(purchase_invoices) + get_record | S/P: analyze has no field-to-field unpaid predicate; complete client-side page consumption and value comparison or a fixed predicate is required |
| PurchaseInvoices.createInvoice; processInvoice; voidInvoice | create/post/void_purchase_invoice | S; 4 item types, no bundle purchase |
| PurchaseInvoices.deleteInvoice | protected_handoff(delete_record,purchase_invoices,id) → /commercial | H |
| SalesReturns.getReturns; getReturn | list_records(sales_returns); get_record | S |
| SalesReturns.createReturn; processReturn; voidReturn | create/post/void_sales_return | S; linked partial quantities and stored return COGS |
| SalesReturns.deleteReturn | protected_handoff(delete_record,sales_returns,id) → /commercial | H |
| PurchaseReturns.getReturns; getReturn | list_records(purchase_returns); get_record | S |
| PurchaseReturns.createReturn; processReturn; voidReturn | create/post/void_purchase_return | S; partial cumulative limits |
| PurchaseReturns.deleteReturn | protected_handoff(delete_record,purchase_returns,id) → /commercial | H |
| Treasuries.getTreasuries; getTreasury | list_records(treasuries); get_record | S |
| Treasuries.createTreasury; updateTreasury | create_treasury; update_treasury | S; opening_balance, no metadata balance overwrite |
| Treasuries.deposit; withdraw; addTransaction | record_financial_transaction | S; internal ledger only, optional invoice settlement |
| Treasuries.transfer | transfer_treasury | S; two ledger sides, not bank transfer |
| Financial.getCategories; createCategory | list_records(financial_categories); create_financial_category | S |
| Financial.deleteCategory | protected_handoff(delete_record,financial_categories,id) → /financial | H |
| Financial.getTransactions; getExpenses | list_records(financial_transactions); analyze/report for transfer/party predicates | S/P: all UI getTransactions options not present in list_records schema |
| Financial.createTransaction; createExpense | record_financial_transaction | S |
| Financial.deleteTransaction; deleteExpense | protected_handoff(delete_financial_transaction,record_id) → /financial | H; linked party/invoice/transfer: blocked_reversal_requires_review; no MCP deletion tool |
| Financial.getPnLReport | report(pnl,start_date,end_date) | S; posted net revenue/returns/manual categories/stored COGS |
| BalanceSheet.getBalanceSheet; getQuickSummary | report(balance_sheet) | S; liquidity/inventory/debt coverage |
| BalanceSheet.getInventoryValuation | report(inventory) or balance_sheet breakdown | S |
| BalanceSheet.getTreasuryBalances; getPartiesBalances | list_records(treasuries/parties); report(balance_sheet) | S |
| Dashboard.getStats | report(dashboard) | S; daily sales/orders/stock/cash; audit last activities mapping requires field parity |
| Dashboard.getAuditLogs(page,pageSize,filters) | list_records(audit_logs,offset,limit,filters) | S/P: arbitrary native filters not automatically accepted by fixed MCP filters |
| DecisionSupport.getDecisionSupportData; getAlerts; getLiquidity; getInventoryCoverage; getProductionStatus; getProfitability; getTrends | report(decision_support), trends/product_performance/production as applicable | S; returns combined outputs; verify every alert/action and coverage window against UI |
| Backup.createBackup; getBackupStats | backup_manifest; backup_export(snapshot_id,table,pages) | S; coherent business snapshot; excludes auth/credentials, native format parity P |
| Backup.downloadBackup | manifest/export to client-local assembled JSON | P: no MCP browser download side effect; output assembling must preserve native metadata contract |
| Backup.validateBackup | native local helper in /settings/system | L/H; no MCP upload/restore validation tool |
| Backup.restoreBackup; factoryReset | protected_handoff(restore_backup/factory_reset) → /settings/system | H; exact approval, native admin session |
| Cloud backup UI download | protected_handoff(download_cloud_backup) → /settings/system | H; no cloud credential/export URL |
| User UI list/rename | list_users; rename_user | S; current real role/admin |
| User UI create/change role/change active/reset password/delete | protected_handoff(create_user/change_user_role/change_user_status/reset_password/delete_user,user_id) → /settings/users | H; no passwords or privilege changes through MCP |
| InventoryMovements / ItemDetails / MovementDetails direct page reads | list_records(inventory_movements), get_record, analyze relationships | S; full pagination beyond native limits30/100 |
| Analytical exploratory UI capability | factory_schema + factory_analyze | S; structured fixed tables/joins/typed fields only, no SQL; actual source RLS |

## Eighteen named report rows

Every row is source-implemented; all remain **S / behavior parity pending this
read-only audit**. Report snapshots support stable pages and full-filter totals;
consume until has_more=false rather than treating the first page as complete.

| Report key / tool | Current UI/source | Basis / specific parity verification |
|---|---|---|
| dashboard / factory_report | Dashboard, DashboardService | Current daily sales, active orders, low-stock, treasury cash; verify recent activities |
| pnl | FinancialService.getPnLReport | Posted sales−returns+configured manual income, stored sale−return COGS, configured expenses |
| balance_sheet | FinancialBalanceSheet, BalanceSheetService | Current quantities×cost, treasury balances, receivables/payables sign logic |
| cash_flow | CashFlowReport | Source uses cumulative invoice paid_amount on invoice date plus income ledger; explicit double-count warning retained |
| aging | AgingReport | Debt remaining, invoice date age and buckets, partial payments; snapshot as_of |
| inventory | InventoryReport | All item quantities/cost/value including bundles |
| inventory_analytics | InventoryAnalytics | Stock classification and value metrics; consistent total across full records |
| low_stock | LowStockReport | Quantity/min_stock edge cases and need quantities |
| turnover | InventoryTurnoverReport | 90d window, annualization4, average inventory=current+consumed/2; disclose approximation |
| production | ProductionReport | Orders status/date/cost; production/packaging outputs and separate assembly scope |
| product_performance | ProductPerformanceReport | Source bundle sales treated zero; all posted sales through as_of, component cost shown |
| decision_support | DecisionSupport, DecisionSupportService | Alerts, liquidity, inventory coverage, pending order aging, profitability, trends |
| party_analysis | PartyAnalysisReport | Customer/supplier filtering, balances and purchases/sales/payment histories |
| expense_analysis | ExpenseAnalysisReport | Category/type/date and source transfer exclusion rules |
| cost_card | ProductCostCardReport | Current raw recipes, batch size, packaging requirements, bundle components; not historical issued-cost overwrite |
| pricing_analysis | PricingAnalysisReport | target_margin, currentcost/salesprice; margin versus markup must match source |
| trends | TrendsAnalyticsReport | Period comparison sales/purchases/expenses/profit; return treatment/date basis |
| product_journey | ProductJourneyReport | Component→production→packaging→sale trace; joins/full details/history coverage |

Other report pages: ReportsHub is navigation; ExecutiveAnalytics.tsx is not routed
by current reports/index.tsx. Do not count an unrouted file as another deployed
workflow. party_statement and treasury_statement are separate fixed paged tools,
not extra members of the eighteen-report enumeration.

## Explicit pending/unsupported boundaries

- No stock transfer between warehouses exists in source; no such tool added.
- Completed bundle assembly reversal is absent in current app and remains
  unsupported. Start bundle_assembly exists as a status path, not proof of a
  separate original UI button.
- Irreversible deletes, identity credentials, role/status changes, cloud download,
  restore/reset are H: a returned path/target is not completed execution.
- Tool schemas include strict filter limitations. Analyze supports registered field-to-scalar/array predicates, not field-to-field comparison. Unpaid invoices require complete client-side page consumption and comparison or a fixed predicate; transfer-related filter parity also needs verification.
- Four atomic MCP edit_* tools support metadata/recipe and stock adjustment together, require a reason, and preserve system-owned derived costs. Choosing separate update_* and adjust_inventory calls still creates separate intents.
- Source evidence is not a test report. This audit ran no tests; root must attach
  operation-specific transaction/idempotency/role and report parity evidence.
- Credentials/OAuth grants/live provider settings and deployment are outside this
  source audit and still require the exact approval step.
