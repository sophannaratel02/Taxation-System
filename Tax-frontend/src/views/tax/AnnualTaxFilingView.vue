<template>
  <main class="annual-filing container-fluid p-3 p-xl-4">
    <header class="filing-header d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
      <div>
        <div class="eyebrow">ANNUAL RETURN · TOI 01</div>
        <h1 class="h3 fw-bold mb-1">Annual Tax Filing</h1>
        <p class="text-muted mb-0">Cambodian Tax on Income return and supporting schedules</p>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <select v-if="returns.length" v-model="selectedId" class="form-select return-select" aria-label="Select annual return" @change="selectReturn">
          <option v-for="item in returns" :key="item.id" :value="String(item.id)">{{ item.company_name }} · {{ item.tax_year }}</option>
        </select>
        <button class="btn btn-outline-secondary" type="button" :disabled="loading" title="Reload returns" @click="loadReturns"><i class="bi bi-arrow-clockwise"></i></button>
        <button class="btn btn-outline-primary" type="button" @click="startNewReturn"><i class="bi bi-plus-lg me-1"></i>New return</button>
        <button class="btn btn-primary" type="button" :disabled="!isEditable || saving" @click="saveReturn">
          <i class="bi bi-floppy me-1"></i>{{ saving ? 'Saving...' : returnRecord.id ? 'Save draft' : 'Create return' }}
        </button>
        <button v-if="returnRecord.id && returnRecord.status === 'draft'" class="btn btn-dark" type="button" :disabled="saving" @click="fileReturn">
          <i class="bi bi-send-check me-1"></i>File return
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
    <div v-if="success" class="alert alert-success" role="status">{{ success }}</div>
    <div v-if="loading" class="loading-state"><span class="spinner-border spinner-border-sm me-2"></span>Loading annual returns...</div>

    <template v-else>
      <section class="identity-panel mb-3" aria-label="Enterprise and tax period">
        <div class="identity-heading">
          <span class="identity-icon"><i class="bi bi-building"></i></span>
          <div><div class="small text-muted">P1 · ENTERPRISE IDENTIFICATION</div><strong>Enterprise and tax period</strong></div>
          <span v-if="returnRecord.status" class="badge ms-auto" :class="returnRecord.status === 'filed' ? 'text-bg-success' : 'text-bg-secondary'">{{ returnRecord.status }}</span>
        </div>
        <div class="identity-fields">
          <label class="form-field"><span>Enterprise legal name</span><input v-model.trim="returnRecord.company_name" class="form-control" required :disabled="!isEditable" autocomplete="organization" /></label>
          <label class="form-field"><span>Enterprise TIN</span><input v-model.trim="returnRecord.enterprise_tin" class="form-control" required :disabled="!isEditable" /></label>
          <label class="form-field"><span>Tax year</span><input v-model.number="returnRecord.tax_year" class="form-control" type="number" min="2000" max="2200" required :disabled="!isEditable" /></label>
          <label class="form-field"><span>Period start</span><input v-model="returnRecord.period_start" class="form-control" type="date" :disabled="!isEditable" /></label>
          <label class="form-field"><span>Period end</span><input v-model="returnRecord.period_end" class="form-control" type="date" :disabled="!isEditable" /></label>
        </div>
      </section>

      <section v-if="returnRecord.id" class="return-summary mb-3" aria-label="Calculated tax summary">
        <div><span>Accounting profit before tax</span><strong>{{ money(calculations.accounting_profit_before_tax) }}</strong><small>KHR</small></div>
        <div><span>Taxable income</span><strong>{{ money(calculations.taxable_income) }}</strong><small>KHR</small></div>
        <div><span>Final income tax</span><strong>{{ money(calculations.final_income_tax) }}</strong><small>KHR</small></div>
        <div class="summary-payable"><span>Tax payable</span><strong>{{ money(minimumTaxApplies ? calculations.minimum_tax_payable : calculations.tax_payable_standard) }}</strong><small>KHR · {{ minimumTaxApplies ? 'minimum-tax rule' : 'standard' }}</small></div>
      </section>

      <div v-if="returnRecord.id" class="calculation-strip mb-3">
        <span><i class="bi bi-lightning-charge me-1"></i>Calculations update as you edit</span>
        <span>Charity add-back: {{ money(calculations.charitable_donation_addback) }} KHR</span>
        <span>Interest adjustment: {{ money(calculations.interest_adjustment) }} KHR</span>
        <span>Balance check (should be zero): {{ money(calculations.balance_check) }} KHR</span>
      </div>

      <nav v-if="returnRecord.id" class="schedule-nav mb-3" aria-label="TOI form schedules">
        <button v-for="schedule in schedules" :key="schedule.id" type="button" class="schedule-tab" :class="{ active: activeSchedule === schedule.id }" @click="activeSchedule = schedule.id">
          <span>{{ schedule.id }}</span>{{ schedule.short }}
        </button>
      </nav>

      <section v-if="returnRecord.id && activeDefinition" class="schedule-panel">
        <header class="schedule-heading">
          <div><div class="eyebrow">SCHEDULE {{ activeDefinition.id }}</div><h2 class="h5 fw-bold mb-1">{{ activeDefinition.title }}</h2><p class="text-muted small mb-0">{{ activeDefinition.description }}</p></div>
          <div class="schedule-pager">
            <button class="btn btn-sm btn-outline-secondary" type="button" title="Previous schedule" :disabled="activeIndex === 0" @click="stepSchedule(-1)"><i class="bi bi-chevron-left"></i></button>
            <span>{{ activeIndex + 1 }} / 21</span>
            <button class="btn btn-sm btn-outline-secondary" type="button" title="Next schedule" :disabled="activeIndex === schedules.length - 1" @click="stepSchedule(1)"><i class="bi bi-chevron-right"></i></button>
          </div>
        </header>

        <div v-if="activeDefinition.id === 'P10'" class="calculation-result mb-3">
          <div><span>Taxable income</span><strong>{{ money(calculations.taxable_income) }} KHR</strong></div>
          <div><span>Gross income tax incl. excess dividend tax</span><strong>{{ money(calculations.gross_income_tax) }} KHR</strong></div>
          <div><span>Credits and prepayments</span><strong>{{ money(calculations.foreign_tax_credit + calculations.advance_dividend_tax_credit + calculations.prepayments) }} KHR</strong></div>
          <div><span>Standard payable</span><strong>{{ money(calculations.tax_payable_standard) }} KHR</strong></div>
          <label class="minimum-toggle"><input v-model="minimumTaxApplies" class="form-check-input" type="checkbox" :disabled="!isEditable" /><span>Apply minimum tax comparison</span></label>
        </div>

        <div v-if="activeDefinition.fields?.length" class="schedule-fields">
          <label v-for="field in activeDefinition.fields" :key="field.key" class="form-field" :class="{ 'wide-field': field.wide }">
            <span>{{ field.label }} <small v-if="field.unit">({{ field.unit }})</small></span>
            <textarea v-if="field.type === 'textarea'" v-model="details[field.key]" class="form-control" rows="3" :disabled="!isEditable"></textarea>
            <select v-else-if="field.type === 'select'" v-model="details[field.key]" class="form-select" :disabled="!isEditable"><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
            <input v-else v-model.number="values[field.key]" class="form-control" type="number" min="0" :max="field.max" :step="field.step || 1" :disabled="!isEditable" />
          </label>
        </div>
        <div v-else class="empty-schedule"><i class="bi bi-check2-circle"></i><p class="mb-0">This schedule is informational. Complete its related balance or transaction inputs in the linked schedules.</p></div>

        <div v-if="activeDefinition.id === 'P3' || activeDefinition.id === 'P4'" class="schedule-total mt-3">
          <span>{{ activeDefinition.id === 'P3' ? 'Total assets' : 'Total equity and liabilities' }}</span>
          <strong>{{ money(activeDefinition.id === 'P3' ? calculations.assets.total : calculations.equity + calculations.liabilities) }} KHR</strong>
        </div>
        <div v-if="activeDefinition.id === 'P5' || activeDefinition.id === 'P6'" class="schedule-total mt-3">
          <span>{{ activeDefinition.id === 'P5' ? 'Gross profit' : 'Net accounting profit before tax' }}</span>
          <strong>{{ money(activeDefinition.id === 'P5' ? calculations.gross_profit : calculations.accounting_profit_before_tax) }} KHR</strong>
        </div>
        <div v-if="activeDefinition.id === 'P7'" class="schedule-total mt-3"><span>Raw materials consumed</span><strong>{{ money(p7RawConsumed) }} KHR</strong></div>
        <div v-if="activeDefinition.id === 'P7'" class="schedule-total"><span>Manufacturing COGS linked to P5</span><strong>{{ money(calculations.manufacturing_cogs) }} KHR</strong></div>
        <div v-if="activeDefinition.id === 'P8'" class="schedule-total mt-3"><span>Finished merchandise COGS</span><strong>{{ money(p8Cogs) }} KHR</strong></div>
        <div v-if="activeDefinition.id === 'P13'" class="schedule-total mt-3"><span>Ending net book value</span><strong>{{ money(calculations.depreciation_ending_nbv) }} KHR</strong></div>
        <div v-if="activeDefinition.id === 'P14'" class="schedule-total mt-3"><span>Special depreciation allowance (40%)</span><strong>{{ money(calculations.special_depreciation_allowance) }} KHR</strong></div>
        <div v-if="activeDefinition.id === 'P12'" class="schedule-total mt-3"><span>Interest carryforward available {{ money(calculations.interest_carryforward_available) }} · allowed this year {{ money(calculations.interest_carryforward_deduction) }} · loss applied {{ money(calculations.loss_carryforward_deduction) }}</span><strong>KHR</strong></div>
        <div v-if="activeDefinition.id === 'P15'" class="schedule-total mt-3"><span>Tax gain / (loss) on disposal</span><strong>{{ money(calculations.asset_disposal_tax_gain_loss) }} KHR</strong></div>
        <div v-if="activeDefinition.id === 'P16'" class="schedule-total mt-3"><span>Closing provisions</span><strong>{{ money(calculations.provision_closing_balance) }} KHR</strong></div>
        <div v-if="activeDefinition.id === 'P18'" class="schedule-total mt-3"><span>Closing related-party balance</span><strong>{{ money(calculations.related_party_closing_balance) }} KHR</strong></div>
      </section>
      <section v-else-if="!returnRecord.id" class="empty-return">
        <i class="bi bi-file-earmark-plus"></i>
        <h2 class="h5">Start an annual return</h2>
        <p class="text-muted">Enter the enterprise identity and tax year, then create a draft to open schedules P1–P21.</p>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '@/services/api';
import { confirmDialog } from '@/utils/dialog';

const numberField = (key, label, unit = 'KHR') => ({ key, label, unit });
const textField = (key, label) => ({ key, label, type: 'textarea', wide: true });
const schedules = [
  { id: 'P1', short: 'Identity', title: 'Enterprise General Information & Tax Period', description: 'Return identification and annual tax period.', fields: [{ key: 'business_type', label: 'Business activity for COGS linkage', type: 'select', options: [{ value: 'other', label: 'Other / enter costs in P5' }, { value: 'manufacturing', label: 'Manufacturing (P7)' }, { value: 'trading', label: 'Trading / commercial (P8)' }] }] },
  { id: 'P2', short: 'Ownership', title: 'Shareholder & Management Structure', description: 'Aggregate share and capital information. Shareholder detail records can be included in the supporting return documents.', fields: [numberField('p2_share_count', 'Total shares issued', 'shares'), numberField('p2_paid_capital', 'Paid-up capital'), numberField('p2_registered_capital', 'Registered capital')] },
  { id: 'P3', short: 'Assets', title: 'Balance Sheet: Assets', description: 'Enter year-end asset balances.', fields: [numberField('p3_intangible_assets', 'Intangible assets'), numberField('p3_property_plant_equipment', 'Property, plant and equipment'), numberField('p3_long_term_investments', 'Long-term investments'), numberField('p3_other_non_current_assets', 'Other non-current assets'), numberField('p3_inventory', 'Inventory'), numberField('p3_accounts_receivable', 'Accounts receivable'), numberField('p3_short_term_investments', 'Short-term investments'), numberField('p3_cash', 'Cash and cash equivalents'), numberField('p3_other_current_assets', 'Other current assets')] },
  { id: 'P4', short: 'Equity & Liabilities', title: 'Balance Sheet: Equity & Liabilities', description: 'Enter year-end equity and liability balances.', fields: [numberField('p4_share_capital', 'Share capital'), numberField('p4_retained_earnings', 'Retained earnings'), numberField('p4_current_year_profit', 'Current-year profit'), numberField('p4_other_equity', 'Other equity'), numberField('p4_long_term_borrowings', 'Long-term borrowings'), numberField('p4_other_non_current_liabilities', 'Other non-current liabilities'), numberField('p4_accounts_payable', 'Accounts payable'), numberField('p4_tax_payable', 'Tax payable'), numberField('p4_other_current_liabilities', 'Other current liabilities')] },
  { id: 'P5', short: 'Income', title: 'Income Statement: Revenues & Gross Profit', description: 'Enter annual revenue, cost of sales and income aggregates.', fields: [numberField('p5_revenue_goods', 'Revenue from goods'), numberField('p5_revenue_services', 'Revenue from services'), numberField('p5_revenue_rent', 'Rental revenue'), numberField('p5_revenue_commissions', 'Commission revenue'), numberField('p5_revenue_other', 'Other revenue'), numberField('p5_cogs_materials', 'Cost of materials'), numberField('p5_cogs_merchandise', 'Cost of merchandise'), numberField('p5_cogs_labor', 'Direct labor'), numberField('p5_cogs_other', 'Other cost of sales'), numberField('p5_interest_income', 'Interest income'), numberField('p5_dividend_income', 'Dividend income'), numberField('p5_rental_income', 'Other rental income'), numberField('p5_other_income', 'Other income'), numberField('p5_staff_costs', 'Staff costs'), numberField('p5_rent', 'Rent expense'), numberField('p5_utilities', 'Utilities'), numberField('p5_transport', 'Transport'), numberField('p5_marketing', 'Marketing'), numberField('p5_other_operating_costs', 'Other operating costs')] },
  { id: 'P6', short: 'Profit', title: 'Income Statement: Operating Expenses & Net Profit', description: 'Enter finance costs and other expenses not captured in P5.', fields: [numberField('p6_interest_expense', 'Interest expense'), numberField('p6_depreciation_expense', 'Accounting depreciation'), numberField('p6_other_expenses', 'Other expenses'), numberField('p6_income_tax_expense', 'Income tax expense')] },
  { id: 'P7', short: 'Manufacturing COGS', title: 'Manufacturing Cost of Goods Sold', description: 'Raw material consumption and manufacturing costs.', fields: [numberField('p7_opening_raw_materials', 'Opening raw materials'), numberField('p7_purchases_raw_materials', 'Raw material purchases'), numberField('p7_closing_raw_materials', 'Closing raw materials'), numberField('p7_direct_labor', 'Direct manufacturing labor'), numberField('p7_factory_overheads', 'Factory overheads'), numberField('p7_opening_wip', 'Opening work in progress'), numberField('p7_closing_wip', 'Closing work in progress'), numberField('p7_opening_finished_goods', 'Opening finished goods'), numberField('p7_closing_finished_goods', 'Closing finished goods')] },
  { id: 'P8', short: 'Trading COGS', title: 'Trading / Commercial Cost of Goods Sold', description: 'Merchandise available for sale and closing inventory.', fields: [numberField('p8_opening_merchandise', 'Opening merchandise'), numberField('p8_purchases', 'Merchandise purchases'), numberField('p8_closing_merchandise', 'Closing merchandise')] },
  { id: 'P9', short: 'Reconciliation', title: 'Tax Reconciliation', description: 'Bridge accounting profit to taxable profit through additions, deductions and exempt income.', fields: [numberField('p9_additions', 'Non-deductible additions'), numberField('p9_other_adjustments', 'Other taxable adjustments'), numberField('p9_deductions', 'Allowable deductions'), numberField('p9_exempt_income', 'Exempt income')] },
  { id: 'P10', short: 'TOI calculation', title: 'TOI Main Calculation & Tax Payable', description: 'Rates, credits and prepayments feed the computed annual liability.', fields: [numberField('p10_additional_deductions', 'Other deductions'), { ...numberField('p10_tax_rate_percent', 'Income tax rate', '%'), step: '0.01', max: 100 }, numberField('p10_foreign_tax_credit', 'Foreign tax credits'), numberField('p10_advance_dividend_tax', 'Advance tax on dividends'), numberField('p10_minimum_tax', 'Minimum tax'), numberField('p10_prepayments', 'Prepayments (including PPM 1%)')] },
  { id: 'P11', short: 'Tax limits', title: 'Charitable Donations & Interest Limitation', description: 'Donation deduction is limited to 5% of the positive cap base; interest deduction is limited using the supplied 50% rule.', fields: [numberField('p11_charitable_donation', 'Charitable donations'), numberField('p11_interest_income', 'Interest income for limitation')] },
  { id: 'P12', short: 'Carry forwards', title: 'Interest & Loss Carried Forward', description: 'Record unused interest and tax losses within the five preceding tax periods.', fields: [numberField('p12_loss_year_1', 'Tax loss · N−1'), numberField('p12_loss_year_2', 'Tax loss · N−2'), numberField('p12_loss_year_3', 'Tax loss · N−3'), numberField('p12_loss_year_4', 'Tax loss · N−4'), numberField('p12_loss_year_5', 'Tax loss · N−5'), numberField('p12_interest_cf_year_1', 'Unused interest · N−1'), numberField('p12_interest_cf_year_2', 'Unused interest · N−2'), numberField('p12_interest_cf_year_3', 'Unused interest · N−3'), numberField('p12_interest_cf_year_4', 'Unused interest · N−4'), numberField('p12_interest_cf_year_5', 'Unused interest · N−5')] },
  { id: 'P13', short: 'Depreciation', title: 'Depreciation Schedule', description: 'Enter asset cost and accumulated depreciation movements.', fields: [numberField('p13_historical_cost', 'Opening historical cost'), numberField('p13_additions', 'Current-year additions'), numberField('p13_cost_disposals', 'Asset cost disposed'), numberField('p13_opening_accumulated_depreciation', 'Opening accumulated depreciation'), numberField('p13_current_depreciation', 'Current-year depreciation'), numberField('p13_accumulated_depreciation_disposals', 'Accumulated depreciation removed on disposal')] },
  { id: 'P14', short: 'Special depreciation', title: 'Special Depreciation Allowance', description: 'Qualifying new tangible asset cost and the 40% allowance calculation.', fields: [numberField('p14_qualifying_asset_cost', 'Qualifying asset acquisition cost'), numberField('p14_disposals', 'Disposals / cost removed')] },
  { id: 'P15', short: 'Disposals', title: 'Asset Realization / Disposals', description: 'Compare sale proceeds with tax written-down value.', fields: [numberField('p15_sale_proceeds', 'Realized sale proceeds'), numberField('p15_tax_written_down_value', 'Tax written-down value')] },
  { id: 'P16', short: 'Provisions', title: 'Provisions Tracking Schedule', description: 'Track opening provisions, additions, reversals and use.', fields: [numberField('p16_opening_provisions', 'Opening provisions'), numberField('p16_additions', 'Additions'), numberField('p16_reversals', 'Reversals / amounts used')] },
  { id: 'P17', short: 'Related entities', title: 'Branch / Related Entity Directory', description: 'List related entities, tax identifiers, names and addresses for the supporting filing.', fields: [textField('p17_related_entities', 'Related entity directory (one entity per line)')] },
  { id: 'P18', short: 'Related parties', title: 'Related Party Transactions', description: 'Related-party balance movement: opening + increases − decreases.', fields: [numberField('p18_opening_related_balances', 'Opening balance'), numberField('p18_increases', 'Increases / transactions'), numberField('p18_decreases', 'Decreases / settlements')] },
  { id: 'P19', short: 'Business activities', title: 'Summary of Business Activities / Branches', description: 'List business sites, branch identifiers, and tax periods for the annual return.', fields: [textField('p19_branches', 'Branch and business-activity details (one branch per line)')] },
  { id: 'P20', short: 'Branch operations', title: 'Branch Operating Revenue & Expense', description: 'Aggregate operating revenue and expenses reported for branches.', fields: [numberField('p20_branch_revenue', 'Branch revenue'), numberField('p20_branch_expenses', 'Branch expenses')] },
  { id: 'P21', short: 'Dividend tax', title: 'Additional / Minimum Tax on Distributed Profit', description: 'Enter distributions and the applicable additional dividend-tax rate.', fields: [numberField('p21_profit_distributed', 'Profit distributed'), { ...numberField('p21_dividend_tax_rate_percent', 'Excess distribution tax rate', '%'), step: '0.01', max: 100 }] },
];

const nowYear = new Date().getFullYear() - 1;
const returns = ref([]);
const selectedId = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');
const activeSchedule = ref('P1');
const minimumTaxApplies = ref(false);
const returnRecord = reactive({ id: null, company_name: '', enterprise_tin: '', tax_year: nowYear, period_start: `${nowYear}-01-01`, period_end: `${nowYear}-12-31`, status: 'draft' });
const values = reactive({});
const details = reactive({});

for (const schedule of schedules) {
  for (const field of schedule.fields || []) {
    if (field.type === 'textarea' || field.type === 'select') details[field.key] = field.key === 'business_type' ? 'other' : '';
    else values[field.key] = field.key === 'p10_tax_rate_percent' ? 20 : 0;
  }
}

const isEditable = computed(() => !returnRecord.id || returnRecord.status === 'draft');
const activeIndex = computed(() => schedules.findIndex((schedule) => schedule.id === activeSchedule.value));
const activeDefinition = computed(() => schedules[activeIndex.value]);
const p7RawConsumed = computed(() => Math.max(0, Number(values.p7_opening_raw_materials || 0) + Number(values.p7_purchases_raw_materials || 0) - Number(values.p7_closing_raw_materials || 0)));
const p8Cogs = computed(() => Math.max(0, Number(values.p8_opening_merchandise || 0) + Number(values.p8_purchases || 0) - Number(values.p8_closing_merchandise || 0)));

const calculations = computed(() => {
  const n = (key) => Math.max(0, Number(values[key]) || 0);
  const sum = (...keys) => keys.reduce((total, key) => total + n(key), 0);
  const rounded = (value) => Math.round(value + Number.EPSILON);
  const assetsNonCurrent = sum('p3_intangible_assets', 'p3_property_plant_equipment', 'p3_long_term_investments', 'p3_other_non_current_assets');
  const assetsCurrent = sum('p3_inventory', 'p3_accounts_receivable', 'p3_short_term_investments', 'p3_cash', 'p3_other_current_assets');
  const assetsTotal = assetsNonCurrent + assetsCurrent;
  const equity = sum('p4_share_capital', 'p4_retained_earnings', 'p4_current_year_profit', 'p4_other_equity');
  const liabilities = sum('p4_long_term_borrowings', 'p4_other_non_current_liabilities', 'p4_accounts_payable', 'p4_tax_payable', 'p4_other_current_liabilities');
  const revenue = sum('p5_revenue_goods', 'p5_revenue_services', 'p5_revenue_rent', 'p5_revenue_commissions', 'p5_revenue_other');
  const manufacturingCosts = Math.max(0, sum('p7_opening_raw_materials', 'p7_purchases_raw_materials') - n('p7_closing_raw_materials') + sum('p7_direct_labor', 'p7_factory_overheads', 'p7_opening_wip', 'p7_opening_finished_goods') - sum('p7_closing_wip', 'p7_closing_finished_goods'));
  const tradingCosts = Math.max(0, sum('p8_opening_merchandise', 'p8_purchases') - n('p8_closing_merchandise'));
  const directCosts = details.business_type === 'manufacturing' ? manufacturingCosts : details.business_type === 'trading' ? tradingCosts : sum('p5_cogs_materials', 'p5_cogs_merchandise', 'p5_cogs_labor', 'p5_cogs_other');
  const otherIncome = sum('p5_interest_income', 'p5_dividend_income', 'p5_rental_income', 'p5_other_income');
  const operatingCosts = sum('p5_staff_costs', 'p5_rent', 'p5_utilities', 'p5_transport', 'p5_marketing', 'p5_other_operating_costs');
  const grossProfit = revenue - directCosts;
  const operatingProfit = grossProfit + otherIncome - operatingCosts;
  const accountingProfit = operatingProfit - sum('p6_interest_expense', 'p6_depreciation_expense', 'p6_other_expenses');
  const donation = n('p11_charitable_donation');
  const adjustedProfit = accountingProfit + n('p9_additions') + n('p9_other_adjustments') - n('p9_deductions') - n('p9_exempt_income') - n('p10_additional_deductions');
  const donationCapBase = Math.max(0, adjustedProfit + donation);
  const donationAllowance = Math.min(donation, rounded(donationCapBase * 0.05));
  const donationAddback = Math.max(0, Math.abs(donation) - donationAllowance);
  const interestExpense = n('p6_interest_expense');
  const interestIncome = n('p11_interest_income') || n('p5_interest_income');
  const interestCapBase = Math.max(0, adjustedProfit + donationAddback + interestExpense - interestIncome);
  const allowableInterest = Math.max(0, rounded(interestCapBase * 0.5) + interestIncome);
  const interestCarryforwardAvailable = sum('p12_interest_cf_year_1', 'p12_interest_cf_year_2', 'p12_interest_cf_year_3', 'p12_interest_cf_year_4', 'p12_interest_cf_year_5');
  const currentInterestAllowed = Math.min(interestExpense, allowableInterest);
  const interestCarryforwardDeduction = Math.min(interestCarryforwardAvailable, Math.max(0, allowableInterest - currentInterestAllowed));
  const interestAdjustment = Math.max(0, interestExpense - allowableInterest) - interestCarryforwardDeduction;
  const taxableBeforeLosses = Math.max(0, adjustedProfit + donationAddback + interestAdjustment);
  const lossCarryforward = Math.min(sum('p12_loss_year_1', 'p12_loss_year_2', 'p12_loss_year_3', 'p12_loss_year_4', 'p12_loss_year_5'), taxableBeforeLosses);
  const taxableIncome = Math.max(0, taxableBeforeLosses - lossCarryforward);
  const incomeTax = taxableIncome * Math.min(100, n('p10_tax_rate_percent')) / 100;
  const dividendExcess = Math.max(0, n('p21_profit_distributed') - taxableIncome);
  const dividendTax = dividendExcess * Math.min(100, n('p21_dividend_tax_rate_percent')) / 100;
  const grossTax = incomeTax + dividendTax;
  const taxAfterCredit = Math.max(0, grossTax - n('p10_foreign_tax_credit'));
  const dividendCredit = Math.min(taxAfterCredit, n('p10_advance_dividend_tax'));
  const finalTax = Math.max(0, taxAfterCredit - dividendCredit);
  const prepayments = n('p10_prepayments');
  return {
    assets: { non_current: assetsNonCurrent, current: assetsCurrent, total: assetsTotal }, equity, liabilities,
    balance_check: assetsTotal - equity - liabilities, revenue, direct_costs: directCosts,
    manufacturing_cogs: manufacturingCosts, trading_cogs: tradingCosts,
    gross_profit: grossProfit, other_income: otherIncome, operating_costs: operatingCosts,
    operating_profit: operatingProfit, accounting_profit_before_tax: accountingProfit,
    accounting_profit_after_tax: accountingProfit - n('p6_income_tax_expense'),
    adjusted_net_profit: adjustedProfit, donation_cap_base: donationCapBase,
    maximum_deductible_donation: donationAllowance, charitable_donation_addback: donationAddback,
    allowable_interest: allowableInterest, interest_adjustment: interestAdjustment,
    interest_carryforward_available: interestCarryforwardAvailable,
    interest_carryforward_deduction: interestCarryforwardDeduction,
    loss_carryforward_available: sum('p12_loss_year_1', 'p12_loss_year_2', 'p12_loss_year_3', 'p12_loss_year_4', 'p12_loss_year_5'),
    loss_carryforward_deduction: lossCarryforward, taxable_income: taxableIncome,
    taxable_income_tax: incomeTax, excess_dividend_distribution: dividendExcess,
    excess_dividend_tax: dividendTax, gross_income_tax: grossTax,
    foreign_tax_credit: n('p10_foreign_tax_credit'), advance_dividend_tax_credit: dividendCredit,
    final_income_tax: finalTax, prepayments,
    tax_payable_standard: Math.max(0, finalTax - prepayments),
    minimum_tax_payable: Math.max(0, Math.max(finalTax, n('p10_minimum_tax')) - prepayments),
    depreciation_ending_nbv: Math.max(0, Math.max(0, n('p13_historical_cost') + n('p13_additions') - n('p13_cost_disposals')) - Math.max(0, n('p13_opening_accumulated_depreciation') + n('p13_current_depreciation') - n('p13_accumulated_depreciation_disposals'))),
    special_depreciation_allowance: Math.max(0, n('p14_qualifying_asset_cost') - n('p14_disposals')) * 0.4,
    asset_disposal_tax_gain_loss: n('p15_sale_proceeds') - n('p15_tax_written_down_value'),
    provision_closing_balance: n('p16_opening_provisions') + n('p16_additions') - n('p16_reversals'),
    related_party_closing_balance: n('p18_opening_related_balances') + n('p18_increases') - n('p18_decreases'),
  };
});

function money(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
}

function stepSchedule(direction) {
  const nextIndex = Math.max(0, Math.min(schedules.length - 1, activeIndex.value + direction));
  activeSchedule.value = schedules[nextIndex].id;
}

function applyReturn(item) {
  returnRecord.id = item.id;
  returnRecord.company_name = item.company_name || '';
  returnRecord.enterprise_tin = item.enterprise_tin || '';
  returnRecord.tax_year = Number(item.tax_year);
  returnRecord.period_start = item.period_start ? String(item.period_start).slice(0, 10) : '';
  returnRecord.period_end = item.period_end ? String(item.period_end).slice(0, 10) : '';
  returnRecord.status = item.status || 'draft';
  Object.assign(values, item.values || item.values_json || {});
  Object.assign(details, item.details || item.details_json || {});
  minimumTaxApplies.value = Boolean(details.minimum_tax_applies);
  selectedId.value = String(item.id);
  activeSchedule.value = 'P1';
}

function startNewReturn() {
  returnRecord.id = null;
  returnRecord.company_name = '';
  returnRecord.enterprise_tin = '';
  returnRecord.tax_year = nowYear;
  returnRecord.period_start = `${nowYear}-01-01`;
  returnRecord.period_end = `${nowYear}-12-31`;
  returnRecord.status = 'draft';
  minimumTaxApplies.value = false;
  for (const key of Object.keys(values)) values[key] = key === 'p10_tax_rate_percent' ? 20 : 0;
  for (const key of Object.keys(details)) details[key] = key === 'business_type' ? 'other' : '';
  selectedId.value = '';
  activeSchedule.value = 'P1';
}

async function loadReturns() {
  loading.value = true;
  error.value = '';
  try {
    returns.value = await api.annualTaxReturns();
    const selected = returns.value.find((item) => String(item.id) === selectedId.value) || returns.value[0];
    if (selected) applyReturn(selected);
    else startNewReturn();
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    loading.value = false;
  }
}

function selectReturn() {
  const selected = returns.value.find((item) => String(item.id) === selectedId.value);
  if (selected) applyReturn(selected);
}

function payload(status = returnRecord.status) {
  return {
    company_name: returnRecord.company_name,
    enterprise_tin: returnRecord.enterprise_tin,
    tax_year: Number(returnRecord.tax_year),
    period_start: returnRecord.period_start || null,
    period_end: returnRecord.period_end || null,
    status,
    values: { ...values },
    details: { ...details, minimum_tax_applies: minimumTaxApplies.value },
  };
}

async function saveReturn(status = returnRecord.status) {
  if (!returnRecord.company_name.trim() || !returnRecord.enterprise_tin.trim()) {
    error.value = 'Enter the enterprise legal name and TIN before saving.';
    activeSchedule.value = 'P1';
    return;
  }
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const saved = returnRecord.id
      ? await api.updateAnnualTaxReturn(returnRecord.id, payload(status))
      : await api.createAnnualTaxReturn(payload(status));
    applyReturn(saved);
    returns.value = [saved, ...returns.value.filter((item) => String(item.id) !== String(saved.id))];
    success.value = status === 'filed' ? 'Annual TOI return filed and locked.' : 'Annual TOI return saved.';
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    saving.value = false;
  }
}

async function fileReturn() {
  const confirmed = await confirmDialog({
    title: 'File annual return',
    message: 'File this annual return? A filed return cannot be edited.',
    variant: 'warning',
    confirmText: 'File return',
  });

  if (!confirmed) return;
  await saveReturn('filed');
}

onMounted(loadReturns);
</script>

<style scoped>
.annual-filing { color: #24322d; --filing-ink: #24322d; --filing-green: #19724f; --filing-line: #dce5df; }
.filing-header { border-bottom: 1px solid var(--filing-line); padding-bottom: 1.1rem; }
.eyebrow { color: var(--filing-green); font-size: .7rem; font-weight: 800; letter-spacing: .08em; }
.return-select { width: min(340px, 72vw); }
.identity-panel, .schedule-panel { border: 1px solid var(--filing-line); background: #fff; }
.identity-panel { padding: 1rem; border-top: 3px solid var(--filing-green); }
.identity-heading { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; }
.identity-icon { display: grid; place-items: center; width: 38px; height: 38px; color: var(--filing-green); background: #eaf3ed; }
.identity-fields { display: grid; grid-template-columns: repeat(5, minmax(140px, 1fr)); gap: .75rem; }
.form-field { display: flex; flex-direction: column; gap: .35rem; font-size: .8rem; font-weight: 600; }
.form-field span small { color: #728078; font-weight: 400; }
.return-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--filing-line); background: #f7faf8; }
.return-summary > div { display: flex; flex-direction: column; gap: .2rem; padding: .8rem 1rem; border-right: 1px solid var(--filing-line); }
.return-summary > div:last-child { border-right: 0; }
.return-summary span, .calculation-result span { color: #64716a; font-size: .76rem; }
.return-summary strong { color: var(--filing-ink); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.return-summary small { color: #7e8983; font-size: .68rem; }
.summary-payable { background: #eaf3ed; }
.calculation-strip { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem 1rem; padding: .55rem .8rem; background: #f1f5f2; color: #4d5b53; font-size: .76rem; }
.calculation-strip span:first-child { color: var(--filing-green); font-weight: 700; }
.schedule-nav { display: flex; gap: .35rem; overflow-x: auto; padding: 0 0 .35rem; scrollbar-width: thin; }
.schedule-tab { display: inline-flex; flex: 0 0 auto; align-items: center; gap: .45rem; min-height: 38px; padding: .35rem .6rem; border: 1px solid var(--filing-line); background: #fff; color: #44534a; font-size: .75rem; }
.schedule-tab span { color: var(--filing-green); font-size: .67rem; font-weight: 800; }
.schedule-tab.active { border-color: var(--filing-green); background: var(--filing-green); color: #fff; }
.schedule-tab.active span { color: #d8f0e1; }
.schedule-panel { min-height: 330px; padding: 1.1rem; }
.schedule-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; padding-bottom: .9rem; border-bottom: 1px solid var(--filing-line); }
.schedule-pager { display: flex; align-items: center; gap: .55rem; color: #67746c; font-size: .78rem; white-space: nowrap; }
.schedule-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .8rem; }
.wide-field { grid-column: 1 / -1; }
.schedule-total { display: flex; justify-content: space-between; align-items: center; padding: .7rem .85rem; border-top: 1px solid var(--filing-line); background: #f7faf8; font-size: .85rem; }
.schedule-total strong { font-variant-numeric: tabular-nums; }
.calculation-result { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .65rem; padding: .8rem; background: #f1f5f2; }
.calculation-result > div { display: flex; flex-direction: column; gap: .2rem; }
.calculation-result strong { font-size: .92rem; font-variant-numeric: tabular-nums; }
.minimum-toggle { display: flex; align-items: center; gap: .5rem; grid-column: 1 / -1; margin-top: .2rem; font-size: .8rem; }
.empty-schedule, .empty-return { display: grid; place-items: center; gap: .6rem; padding: 3rem 1rem; color: #758279; text-align: center; }
.empty-schedule i, .empty-return > i { color: var(--filing-green); font-size: 1.7rem; }
.empty-return { min-height: 300px; border: 1px dashed #cbd8cf; background: #f8faf8; }
.empty-return p { max-width: 480px; }
.loading-state { padding: 3rem; text-align: center; color: #69766e; }
@media (max-width: 900px) {
  .identity-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .return-summary, .calculation-result { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .return-summary > div:nth-child(2) { border-right: 0; }
  .return-summary > div:nth-child(-n+2) { border-bottom: 1px solid var(--filing-line); }
  .schedule-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .identity-fields, .schedule-fields { grid-template-columns: minmax(0, 1fr); }
  .wide-field, .minimum-toggle { grid-column: auto; }
  .schedule-panel { padding: .8rem; }
  .schedule-heading { flex-direction: column; }
  .return-summary > div { padding: .65rem; }
  .return-summary strong { font-size: .98rem; }
  .calculation-strip { align-items: flex-start; flex-direction: column; gap: .25rem; }
  .return-select { flex: 1 1 100%; width: 100%; }
}
</style>