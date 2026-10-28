<template>
  <main class="annual-filing container-fluid p-3 p-xl-4">
    <!-- Header Actions -->
    <header class="filing-header d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
      <div>
        <div class="eyebrow">{{ text('ANNUAL RETURN · TOI 01', 'លិខិតប្រកាសប្រចាំឆ្នាំ · TOI 01') }}</div>
        <h1 class="h3 fw-bold mb-1">{{ text('Annual Tax Filing', 'ការដាក់លិខិតប្រកាសពន្ធប្រចាំឆ្នាំ') }}</h1>
        <p class="text-muted mb-0">
          {{ text('Cambodian Tax on Income return and supporting schedules', 'លិខិតប្រកាសពន្ធលើប្រាក់ចំណូលកម្ពុជា និងតារាងគាំទ្រ') }}
        </p>
      </div>

      <div class="d-flex flex-wrap gap-2 align-items-center">
        <select
          v-if="returns.length"
          v-model="selectedId"
          class="form-select return-select"
          :aria-label="text('Select annual return', 'ជ្រើសរើសលិខិតប្រកាសប្រចាំឆ្នាំ')"
          @change="selectReturn"
        >
          <option v-for="item in returns" :key="item.id" :value="String(item.id)">
            {{ item.company_name || text('Unnamed Entity', 'គ្មានឈ្មោះ') }} · {{ item.tax_year }}
          </option>
        </select>

        <button
          class="btn btn-outline-secondary"
          type="button"
          :disabled="loading"
          :title="text('Reload returns', 'ផ្ទុកលិខិតប្រកាសឡើងវិញ')"
          @click="loadReturns"
        >
          <i class="bi bi-arrow-clockwise"></i>
        </button>

        <button
          class="btn btn-outline-primary"
          type="button"
          :disabled="saving"
          @click="startNewReturn"
        >
          <i class="bi bi-plus-lg me-1"></i>{{ text('New return', 'លិខិតប្រកាសថ្មី') }}
        </button>

        <button
          class="btn btn-primary"
          type="button"
          :disabled="!isEditable || saving"
          @click="saveReturn(returnRecord.status)"
        >
          <i class="bi bi-floppy me-1"></i>
          {{ saving ? text('Saving...', 'កំពុងរក្សាទុក...') : returnRecord.id ? text('Save draft', 'រក្សាទុកសេចក្តីព្រាង') : text('Create return', 'បង្កើតលិខិតប្រកាស') }}
        </button>

        <button
          v-if="returnRecord.id && returnRecord.status === 'draft'"
          class="btn btn-dark"
          type="button"
          :disabled="saving"
          @click="fileReturn"
        >
          <i class="bi bi-send-check me-1"></i>{{ text('File return', 'ដាក់លិខិតប្រកាស') }}
        </button>
      </div>
    </header>

    <!-- Alerts -->
    <div v-if="error" class="alert alert-danger alert-dismissible fade show" role="alert">
      {{ error }}
      <button type="button" class="btn-close" aria-label="Close" @click="error = ''"></button>
    </div>

    <div v-if="success" class="alert alert-success alert-dismissible fade show" role="status">
      {{ success }}
      <button type="button" class="btn-close" aria-label="Close" @click="success = ''"></button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <span class="spinner-border spinner-border-sm me-2"></span>
      {{ text('Loading annual returns...', 'កំពុងផ្ទុកលិខិតប្រកាសប្រចាំឆ្នាំ...') }}
    </div>

    <template v-else>
      <!-- P1 Enterprise Info -->
      <section class="identity-panel mb-3" :aria-label="text('Enterprise and tax period', 'សហគ្រាស និងរយៈពេលពន្ធ')">
        <div class="identity-heading">
          <span class="identity-icon"><i class="bi bi-building"></i></span>
          <div>
            <div class="small text-muted">{{ text('P1 · ENTERPRISE IDENTIFICATION', 'P1 · អត្តសញ្ញាណសហគ្រាស') }}</div>
            <strong>{{ text('Enterprise and tax period', 'សហគ្រាស និងរយៈពេលពន្ធ') }}</strong>
          </div>
          <span
            v-if="returnRecord.status"
            class="badge ms-auto"
            :class="returnRecord.status === 'filed' ? 'text-bg-success' : 'text-bg-secondary'"
          >
            {{ returnRecord.status === 'filed' ? text('Filed', 'បានដាក់រួច') : text('Draft', 'សេចក្តីព្រាង') }}
          </span>
        </div>

        <div class="identity-fields">
          <label class="form-field">
            <span>{{ text('Enterprise legal name', 'ឈ្មោះស្របច្បាប់របស់សហគ្រាស') }}</span>
            <input
              v-model.trim="returnRecord.company_name"
              class="form-control"
              required
              :disabled="!isEditable"
              autocomplete="organization"
            />
          </label>
          <label class="form-field">
            <span>{{ text('Enterprise TIN', 'លេខអត្តសញ្ញាណអ្នកជាប់ពន្ធរបស់សហគ្រាស') }}</span>
            <input
              v-model.trim="returnRecord.enterprise_tin"
              class="form-control"
              required
              :disabled="!isEditable"
            />
          </label>
          <label class="form-field">
            <span>{{ text('Tax year', 'ឆ្នាំពន្ធ') }}</span>
            <input
              v-model.number="returnRecord.tax_year"
              class="form-control"
              type="number"
              min="2000"
              max="2200"
              required
              :disabled="!isEditable"
            />
          </label>
          <label class="form-field">
            <span>{{ text('Period start', 'ថ្ងៃចាប់ផ្តើមរយៈពេល') }}</span>
            <input
              v-model="returnRecord.period_start"
              class="form-control"
              type="date"
              :disabled="!isEditable"
            />
          </label>
          <label class="form-field">
            <span>{{ text('Period end', 'ថ្ងៃបញ្ចប់រយៈពេល') }}</span>
            <input
              v-model="returnRecord.period_end"
              class="form-control"
              type="date"
              :disabled="!isEditable"
            />
          </label>
        </div>
      </section>

      <!-- Overall Summary -->
      <section v-if="returnRecord.id" class="return-summary mb-3" :aria-label="text('Calculated tax summary', 'សេចក្តីសង្ខេបពន្ធដែលបានគណនា')">
        <div>
          <span>{{ text('Accounting profit before tax', 'ប្រាក់ចំណេញគណនេយ្យមុនបង់ពន្ធ') }}</span>
          <strong>{{ money(calculations.accounting_profit_before_tax) }}</strong>
          <small>KHR</small>
        </div>
        <div>
          <span>{{ text('Taxable income', 'ប្រាក់ចំណូលជាប់ពន្ធ') }}</span>
          <strong>{{ money(calculations.taxable_income) }}</strong>
          <small>KHR</small>
        </div>
        <div>
          <span>{{ text('Final income tax', 'ពន្ធលើប្រាក់ចំណូលចុងក្រោយ') }}</span>
          <strong>{{ money(calculations.final_income_tax) }}</strong>
          <small>KHR</small>
        </div>
        <div class="summary-payable">
          <span>{{ text('Tax payable', 'ពន្ធត្រូវបង់') }}</span>
          <strong>{{ money(minimumTaxApplies ? calculations.minimum_tax_payable : calculations.tax_payable_standard) }}</strong>
          <small>KHR · {{ minimumTaxApplies ? text('minimum-tax rule', 'វិធានពន្ធអប្បបរមា') : text('standard', 'ស្តង់ដារ') }}</small>
        </div>
      </section>

      <!-- Live Calculation Validation Strip -->
      <div v-if="returnRecord.id" class="calculation-strip mb-3">
        <span><i class="bi bi-lightning-charge me-1"></i>{{ text('Calculations update as you edit', 'ការគណនាធ្វើបច្ចុប្បន្នភាពតាមពេលអ្នកកែសម្រួល') }}</span>
        <span>{{ text('Charity add-back:', 'បូកត្រឡប់វិញនូវអំណោយសប្បុរសធម៌៖') }} {{ money(calculations.charitable_donation_addback) }} KHR</span>
        <span>{{ text('Interest adjustment:', 'ការកែតម្រូវការប្រាក់៖') }} {{ money(calculations.interest_adjustment) }} KHR</span>
        <span>
          {{ text('Balance check (Assets − L&E):', 'ការត្រួតពិនិត្យសមតុល្យ (ទ្រព្យសកម្ម − បំណុល&ដើមទុន)៖') }}
          <strong :class="calculations.balance_check === 0 ? 'text-success' : 'text-danger'">
            {{ money(calculations.balance_check) }} KHR
          </strong>
        </span>
      </div>

      <!-- Schedule Tabs Navigation -->
      <nav v-if="returnRecord.id" class="schedule-nav mb-3" :aria-label="text('TOI form schedules', 'តារាងទម្រង់ TOI')">
        <button
          v-for="schedule in schedules"
          :key="schedule.id"
          type="button"
          class="schedule-tab"
          :class="{ active: activeSchedule === schedule.id }"
          @click="activeSchedule = schedule.id"
        >
          <span>{{ schedule.id }}</span>{{ localize(schedule.short) }}
        </button>
      </nav>

      <!-- Active Schedule Body -->
      <section v-if="returnRecord.id && activeDefinition" class="schedule-panel">
        <header class="schedule-heading">
          <div>
            <div class="eyebrow">{{ text('SCHEDULE', 'តារាង') }} {{ activeDefinition.id }}</div>
            <h2 class="h5 fw-bold mb-1">{{ localize(activeDefinition.title) }}</h2>
            <p class="text-muted small mb-0">{{ localize(activeDefinition.description) }}</p>
          </div>
          <div class="schedule-pager">
            <button
              class="btn btn-sm btn-outline-secondary"
              type="button"
              :title="text('Previous schedule', 'តារាងមុន')"
              :disabled="activeIndex === 0"
              @click="stepSchedule(-1)"
            >
              <i class="bi bi-chevron-left"></i>
            </button>
            <span>{{ activeIndex + 1 }} / {{ schedules.length }}</span>
            <button
              class="btn btn-sm btn-outline-secondary"
              type="button"
              :title="text('Next schedule', 'តារាងបន្ទាប់')"
              :disabled="activeIndex === schedules.length - 1"
              @click="stepSchedule(1)"
            >
              <i class="bi bi-chevron-right"></i>
            </button>
          </div>
        </header>

        <!-- Special Header for P10 (Calculation Summary) -->
        <div v-if="activeDefinition.id === 'P10'" class="calculation-result mb-3">
          <div>
            <span>{{ text('Taxable income', 'ប្រាក់ចំណូលជាប់ពន្ធ') }}</span>
            <strong>{{ money(calculations.taxable_income) }} KHR</strong>
          </div>
          <div>
            <span>{{ text('Gross income tax incl. excess dividend tax', 'ពន្ធលើប្រាក់ចំណូលសរុប រួមទាំងពន្ធលើភាគលាភលើស') }}</span>
            <strong>{{ money(calculations.gross_income_tax) }} KHR</strong>
          </div>
          <div>
            <span>{{ text('Credits & prepayments', 'ឥណទានពន្ធ និងការបង់មុន') }}</span>
            <strong>{{ money(calculations.foreign_tax_credit + calculations.advance_dividend_tax_credit + calculations.prepayments) }} KHR</strong>
          </div>
          <div>
            <span>{{ text('Standard payable', 'ពន្ធត្រូវបង់តាមស្តង់ដារ') }}</span>
            <strong>{{ money(calculations.tax_payable_standard) }} KHR</strong>
          </div>
          <label class="minimum-toggle">
            <input
              v-model="minimumTaxApplies"
              class="form-check-input"
              type="checkbox"
              :disabled="!isEditable"
            />
            <span>{{ text('Apply minimum tax rule comparison (Pay greater of Income Tax vs. Minimum Tax)', 'អនុវត្តការប្រៀបធៀបវិធានពន្ធអប្បបរមា (បង់ចំនួនធំជាងរវាងពន្ធលើប្រាក់ចំណូល និងពន្ធអប្បបរមា)') }}</span>
          </label>
        </div>

        <!-- Schedule Inputs Grid -->
        <div v-if="activeDefinition.fields?.length" class="schedule-fields">
          <label
            v-for="field in activeDefinition.fields"
            :key="field.key"
            class="form-field"
            :class="{ 'wide-field': field.wide }"
          >
            <span>
              {{ localize(field.label) }}
              <small v-if="field.unit">({{ field.unit === 'shares' ? text('shares', 'ភាគហ៊ុន') : field.unit }})</small>
            </span>

            <textarea
              v-if="field.type === 'textarea'"
              v-model="details[field.key]"
              class="form-control"
              rows="3"
              :disabled="!isEditable"
            ></textarea>

            <select
              v-else-if="field.type === 'select'"
              v-model="details[field.key]"
              class="form-select"
              :disabled="!isEditable"
            >
              <option v-for="option in field.options" :key="option.value" :value="option.value">
                {{ localize(option.label) }}
              </option>
            </select>

            <input
              v-else
              v-model.number="values[field.key]"
              class="form-control"
              type="number"
              min="0"
              :max="field.max"
              :step="field.step || 1"
              :disabled="!isEditable"
            />
          </label>
        </div>

        <div v-else class="empty-schedule">
          <i class="bi bi-check2-circle"></i>
          <p class="mb-0">
            {{ text('This schedule is informational. Complete its related balance or transaction inputs in the linked schedules.', 'តារាងនេះមានព័ត៌មានប៉ុណ្ណោះ។ សូមបំពេញព័ត៌មានសមតុល្យ ឬប្រតិបត្តិការដែលពាក់ព័ន្ធក្នុងតារាងដែលភ្ជាប់។') }}
          </p>
        </div>

        <!-- Bottom Schedule Aggregations -->
        <div v-if="activeDefinition.id === 'P3' || activeDefinition.id === 'P4'" class="schedule-total mt-3">
          <span>{{ activeDefinition.id === 'P3' ? text('Total assets', 'ទ្រព្យសកម្មសរុប') : text('Total equity and liabilities', 'មូលធន និងបំណុលសរុប') }}</span>
          <strong>{{ money(activeDefinition.id === 'P3' ? calculations.assets.total : calculations.equity + calculations.liabilities) }} KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P5' || activeDefinition.id === 'P6'" class="schedule-total mt-3">
          <span>{{ activeDefinition.id === 'P5' ? text('Gross profit', 'ប្រាក់ចំណេញដុល') : text('Net accounting profit before tax', 'ប្រាក់ចំណេញគណនេយ្យសុទ្ធមុនបង់ពន្ធ') }}</span>
          <strong>{{ money(activeDefinition.id === 'P5' ? calculations.gross_profit : calculations.accounting_profit_before_tax) }} KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P7'" class="schedule-total mt-3">
          <span>{{ text('Raw materials consumed', 'វត្ថុធាតុដើមដែលបានប្រើប្រាស់') }}</span>
          <strong>{{ money(p7RawConsumed) }} KHR</strong>
        </div>
        <div v-if="activeDefinition.id === 'P7'" class="schedule-total">
          <span>{{ text('Manufacturing COGS linked to P5', 'ថ្លៃដើមទំនិញផលិតដែលភ្ជាប់ទៅ P5') }}</span>
          <strong>{{ money(calculations.manufacturing_cogs) }} KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P8'" class="schedule-total mt-3">
          <span>{{ text('Finished merchandise COGS', 'ថ្លៃដើមទំនិញដែលបានលក់') }}</span>
          <strong>{{ money(p8Cogs) }} KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P12'" class="schedule-total mt-3">
          <span>
            {{ text('Interest carryforward pool:', 'ការប្រាក់យកទៅមុខសរុប៖') }} {{ money(calculations.interest_carryforward_available) }} ·
            {{ text('Deducted this year:', 'បានកាត់កងឆ្នាំនេះ៖') }} {{ money(calculations.interest_carryforward_deduction) }} ·
            {{ text('Loss carryforward applied:', 'ការខាតបានអនុវត្ត៖') }} {{ money(calculations.loss_carryforward_deduction) }}
          </span>
          <strong>KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P13'" class="schedule-total mt-3">
          <span>{{ text('Ending net book value', 'តម្លៃសៀវភៅសុទ្ធចុងឆ្នាំ') }}</span>
          <strong>{{ money(calculations.depreciation_ending_nbv) }} KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P14'" class="schedule-total mt-3">
          <span>{{ text('Special depreciation allowance (40%)', 'ប្រាក់ឧបត្ថម្ភរំលស់ពិសេស (៤០%)') }}</span>
          <strong>{{ money(calculations.special_depreciation_allowance) }} KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P15'" class="schedule-total mt-3">
          <span>{{ text('Tax gain / (loss) on disposal', 'ចំណេញ / (ខាត) ពន្ធពីការចោល') }}</span>
          <strong>{{ money(calculations.asset_disposal_tax_gain_loss) }} KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P16'" class="schedule-total mt-3">
          <span>{{ text('Closing provisions', 'សំវិធានធនចុងឆ្នាំ') }}</span>
          <strong>{{ money(calculations.provision_closing_balance) }} KHR</strong>
        </div>

        <div v-if="activeDefinition.id === 'P18'" class="schedule-total mt-3">
          <span>{{ text('Closing related-party balance', 'សមតុល្យភាគីពាក់ព័ន្ធចុងឆ្នាំ') }}</span>
          <strong>{{ money(calculations.related_party_closing_balance) }} KHR</strong>
        </div>
      </section>

      <!-- Empty State if no return is loaded -->
      <section v-else-if="!returnRecord.id" class="empty-return">
        <i class="bi bi-file-earmark-plus"></i>
        <h2 class="h5">{{ text('Start an annual return', 'ចាប់ផ្តើមលិខិតប្រកាសប្រចាំឆ្នាំ') }}</h2>
        <p class="text-muted">
          {{ text('Enter the enterprise identity and tax year, then click Create return to open schedules P1–P21.', 'បញ្ចូលអត្តសញ្ញាណសហគ្រាស និងឆ្នាំពន្ធ បន្ទាប់មកចុច បង្កើតលិខិតប្រកាស ដើម្បីបើកតារាង P1–P21។') }}
        </p>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '@/services/api';
import { confirmDialog } from '@/utils/dialog';
import { useLanguageStore } from '../../stores/language.js';

const language = useLanguageStore();
const text = (english, khmer) => (language.isKhmer ? khmer : english);
const userError = (err) =>
  language.isKhmer
    ? 'មិនអាចដំណើរការលិខិតប្រកាសពន្ធប្រចាំឆ្នាំបានទេ។ សូមព្យាយាមម្តងទៀត។'
    : err?.message || 'Unable to process the annual tax return. Please try again.';

const khmerLabels = {
  Identity: 'អត្តសញ្ញាណ',
  Ownership: 'កម្មសិទ្ធិ',
  Assets: 'ទ្រព្យសកម្ម',
  'Equity & Liabilities': 'មូលធន និងបំណុល',
  Income: 'ចំណូល',
  Profit: 'ប្រាក់ចំណេញ',
  'Manufacturing COGS': 'ថ្លៃដើមផលិតកម្ម',
  'Trading COGS': 'ថ្លៃដើមពាណិជ្ជកម្ម',
  Reconciliation: 'ការផ្ទៀងផ្ទាត់',
  'TOI calculation': 'ការគណនា TOI',
  'Tax limits': 'ដែនកំណត់ពន្ធ',
  'Carry forwards': 'ការយកសមតុល្យទៅមុខ',
  Depreciation: 'រំលស់',
  'Special depreciation': 'រំលស់ពិសេស',
  Disposals: 'ការចោលទ្រព្យសកម្ម',
  Provisions: 'សំវិធានធន',
  'Related entities': 'អង្គភាពពាក់ព័ន្ធ',
  'Related parties': 'ភាគីពាក់ព័ន្ធ',
  'Business activities': 'សកម្មភាពអាជីវកម្ម',
  'Branch operations': 'ប្រតិបត្តិការសាខា',
  'Dividend tax': 'ពន្ធលើភាគលាភ',
  'Enterprise General Information & Tax Period': 'ព័ត៌មានទូទៅអំពីសហគ្រាស និងរយៈពេលពន្ធ',
  'Return identification and annual tax period.': 'អត្តសញ្ញាណលិខិតប្រកាស និងរយៈពេលពន្ធប្រចាំឆ្នាំ។',
  'Shareholder & Management Structure': 'រចនាសម្ព័ន្ធភាគទុនិក និងការគ្រប់គ្រង',
  'Aggregate share and capital information. Shareholder detail records can be included in the supporting return documents.': 'ព័ត៌មានសរុបអំពីភាគហ៊ុន និងដើមទុន។ ព័ត៌មានលម្អិតរបស់ភាគទុនិកអាចដាក់បញ្ចូលក្នុងឯកសារគាំទ្រលិខិតប្រកាស។',
  'Balance Sheet: Assets': 'តារាងតុល្យការ៖ ទ្រព្យសកម្ម',
  'Enter year-end asset balances.': 'បញ្ចូលសមតុល្យទ្រព្យសកម្មចុងឆ្នាំ។',
  'Balance Sheet: Equity & Liabilities': 'តារាងតុល្យការ៖ មូលធន និងបំណុល',
  'Enter year-end equity and liability balances.': 'បញ្ចូលសមតុល្យមូលធន និងបំណុលចុងឆ្នាំ។',
  'Income Statement: Revenues & Gross Profit': 'របាយការណ៍លទ្ធផល៖ ចំណូល និងប្រាក់ចំណេញដុល',
  'Enter annual revenue, cost of sales and income aggregates.': 'បញ្ចូលចំណូលប្រចាំឆ្នាំ ថ្លៃដើមលក់ និងចំណូលសរុប។',
  'Income Statement: Operating Expenses & Net Profit': 'របាយការណ៍លទ្ធផល៖ ចំណាយប្រតិបត្តិការ និងប្រាក់ចំណេញសុទ្ធ',
  'Enter finance costs and other expenses not captured in P5.': 'បញ្ចូលថ្លៃហិរញ្ញវត្ថុ និងចំណាយផ្សេងទៀតដែលមិនបានបញ្ចូលក្នុង P5។',
  'Manufacturing Cost of Goods Sold': 'ថ្លៃដើមទំនិញដែលបានលក់ពីការផលិត',
  'Raw material consumption and manufacturing costs.': 'ការប្រើប្រាស់វត្ថុធាតុដើម និងថ្លៃដើមផលិតកម្ម។',
  'Trading / Commercial Cost of Goods Sold': 'ថ្លៃដើមទំនិញដែលបានលក់ក្នុងពាណិជ្ជកម្ម',
  'Merchandise available for sale and closing inventory.': 'ទំនិញសម្រាប់លក់ និងសារពើភ័ណ្ឌចុងឆ្នាំ។',
  'Tax Reconciliation': 'ការផ្ទៀងផ្ទាត់ពន្ធ',
  'Bridge accounting profit to taxable profit through additions, deductions and exempt income.': 'កែតម្រូវប្រាក់ចំណេញគណនេយ្យទៅជាប្រាក់ចំណេញជាប់ពន្ធ តាមរយៈការបូក ការដក និងចំណូលលើកលែងពន្ធ។',
  'TOI Main Calculation & Tax Payable': 'ការគណនាសំខាន់របស់ TOI និងពន្ធត្រូវបង់',
  'Rates, credits and prepayments feed the computed annual liability.': 'អត្រា ឥណទាន និងការបង់មុនត្រូវបានប្រើសម្រាប់គណនាបំណុលពន្ធប្រចាំឆ្នាំ។',
  'Charitable Donations & Interest Limitation': 'អំណោយសប្បុរសធម៌ និងដែនកំណត់ការប្រាក់',
  'Donation deduction is limited to 5% of the positive cap base; interest deduction is limited using the supplied 50% rule.': 'ការកាត់កងអំណោយកំណត់ត្រឹម ៥% នៃមូលដ្ឋានវិជ្ជមាន។ ការកាត់កងការប្រាក់កំណត់តាមវិធាន ៥០% ដែលបានផ្តល់។',
  'Interest & Loss Carried Forward': 'ការប្រាក់ និងការខាតដែលយកទៅមុខ',
  'Record unused interest and tax losses within the five preceding tax periods.': 'កត់ត្រាការប្រាក់ដែលមិនបានប្រើ និងការខាតពន្ធក្នុងរយៈពេលពន្ធប្រាំឆ្នាំមុន។',
  'Depreciation Schedule': 'តារាងរំលស់',
  'Enter asset cost and accumulated depreciation movements.': 'បញ្ចូលថ្លៃដើមទ្រព្យសកម្ម និងចលនារំលស់បង្គរ។',
  'Special Depreciation Allowance': 'ប្រាក់ឧបត្ថម្ភរំលស់ពិសេស',
  'Qualifying new tangible asset cost and the 40% allowance calculation.': 'ថ្លៃដើមទ្រព្យសកម្មរូបីថ្មីដែលមានលក្ខណៈគ្រប់គ្រាន់ និងការគណនាប្រាក់ឧបត្ថម្ភ ៤០%។',
  'Asset Realization / Disposals': 'ការលក់ / ការចោលទ្រព្យសកម្ម',
  'Compare sale proceeds with tax written-down value.': 'ប្រៀបធៀបប្រាក់បានពីការលក់ជាមួយតម្លៃសៀវភៅសម្រាប់គោលបំណងពន្ធ។',
  'Provisions Tracking Schedule': 'តារាងតាមដានសំវិធានធន',
  'Track opening provisions, additions, reversals and use.': 'តាមដានសំវិធានធនដើមឆ្នាំ ការបន្ថែម ការបញ្ច្រាស និងការប្រើប្រាស់។',
  'Branch / Related Entity Directory': 'បញ្ជីសាខា / អង្គភាពពាក់ព័ន្ធ',
  'List related entities, tax identifiers, names and addresses for the supporting filing.': 'រាយអង្គភាពពាក់ព័ន្ធ លេខអត្តសញ្ញាណពន្ធ ឈ្មោះ និងអាសយដ្ឋានសម្រាប់ឯកសារគាំទ្រលិខិតប្រកាស។',
  'Related Party Transactions': 'ប្រតិបត្តិការជាមួយភាគីពាក់ព័ន្ធ',
  'Related-party balance movement: opening + increases − decreases.': 'ចលនាសមតុល្យភាគីពាក់ព័ន្ធ៖ សមតុល្យដើម + ការកើនឡើង − ការថយចុះ។',
  'Summary of Business Activities / Branches': 'សេចក្តីសង្ខេបសកម្មភាពអាជីវកម្ម / សាខា',
  'List business sites, branch identifiers, and tax periods for the annual return.': 'រាយទីតាំងអាជីវកម្ម លេខសម្គាល់សាខា និងរយៈពេលពន្ធសម្រាប់លិខិតប្រកាសប្រចាំឆ្នាំ។',
  'Branch Operating Revenue & Expense': 'ចំណូល និងចំណាយប្រតិបត្តិការសាខា',
  'Aggregate operating revenue and expenses reported for branches.': 'បញ្ចូលចំណូល និងចំណាយប្រតិបត្តិការសរុបដែលបានរាយការណ៍សម្រាប់សាខា។',
  'Additional / Minimum Tax on Distributed Profit': 'ពន្ធបន្ថែម / ពន្ធអប្បបរមាលើប្រាក់ចំណេញដែលបានចែកចាយ',
  'Enter distributions and the applicable additional dividend-tax rate.': 'បញ្ចូលប្រាក់ចំណេញដែលបានចែកចាយ និងអត្រាពន្ធបន្ថែមលើភាគលាភដែលអនុវត្ត។',
  'Business activity for COGS linkage': 'សកម្មភាពអាជីវកម្មសម្រាប់ភ្ជាប់ថ្លៃដើមលក់',
  'Other / enter costs in P5': 'ផ្សេងទៀត / បញ្ចូលថ្លៃដើមក្នុង P5',
  'Manufacturing (P7)': 'ការផលិត (P7)',
  'Trading / commercial (P8)': 'ពាណិជ្ជកម្ម (P8)',
  'Total shares issued': 'ចំនួនភាគហ៊ុនដែលបានបោះផ្សាយសរុប',
  'Paid-up capital': 'ដើមទុនដែលបានបង់',
  'Registered capital': 'ដើមទុនដែលបានចុះបញ្ជី',
  'Intangible assets': 'ទ្រព្យសកម្មអរូបី',
  'Property, plant and equipment': 'អចលនទ្រព្យ រោងចក្រ និងបរិក្ខារ',
  'Long-term investments': 'ការវិនិយោគរយៈពេលវែង',
  'Other non-current assets': 'ទ្រព្យសកម្មមិនមែនចរន្តផ្សេងទៀត',
  Inventory: 'សារពើភ័ណ្ឌ',
  'Accounts receivable': 'គណនីត្រូវទទួល',
  'Short-term investments': 'ការវិនិយោគរយៈពេលខ្លី',
  'Cash and cash equivalents': 'សាច់ប្រាក់ និងសមមូលសាច់ប្រាក់',
  'Other current assets': 'ទ្រព្យសកម្មចរន្តផ្សេងទៀត',
  'Share capital': 'ដើមទុនភាគហ៊ុន',
  'Retained earnings': 'ប្រាក់ចំណេញរក្សាទុក',
  'Current-year profit': 'ប្រាក់ចំណេញឆ្នាំបច្ចុប្បន្ន',
  'Other equity': 'មូលធនផ្សេងទៀត',
  'Long-term borrowings': 'ប្រាក់កម្ចីរយៈពេលវែង',
  'Other non-current liabilities': 'បំណុលមិនមែនចរន្តផ្សេងទៀត',
  'Accounts payable': 'គណនីត្រូវសង',
  'Tax payable': 'ពន្ធត្រូវបង់',
  'Other current liabilities': 'បំណុលចរន្តផ្សេងទៀត',
  'Revenue from goods': 'ចំណូលពីទំនិញ',
  'Revenue from services': 'ចំណូលពីសេវាកម្ម',
  'Rental revenue': 'ចំណូលពីការជួល',
  'Commission revenue': 'ចំណូលកម្រៃជើងសារ',
  'Other revenue': 'ចំណូលផ្សេងទៀត',
  'Cost of materials': 'ថ្លៃដើមវត្ថុធាតុដើម',
  'Cost of merchandise': 'ថ្លៃដើមទំនិញ',
  'Direct labor': 'កម្លាំងពលកម្មផ្ទាល់',
  'Other cost of sales': 'ថ្លៃដើមលក់ផ្សេងទៀត',
  'Interest income': 'ចំណូលការប្រាក់',
  'Dividend income': 'ចំណូលភាគលាភ',
  'Other rental income': 'ចំណូលជួលផ្សេងទៀត',
  'Other income': 'ចំណូលផ្សេងទៀត',
  'Staff costs': 'ចំណាយបុគ្គលិក',
  'Rent expense': 'ចំណាយជួល',
  Utilities: 'សេវាសាធារណៈ',
  Transport: 'ដឹកជញ្ជូន',
  Marketing: 'ទីផ្សារ',
  'Other operating costs': 'ចំណាយប្រតិបត្តិការផ្សេងទៀត',
  'Interest expense': 'ចំណាយការប្រាក់',
  'Accounting depreciation': 'រំលស់គណនេយ្យ',
  'Other expenses': 'ចំណាយផ្សេងទៀត',
  'Income tax expense': 'ចំណាយពន្ធលើប្រាក់ចំណូល',
  'Opening raw materials': 'វត្ថុធាតុដើមដើមឆ្នាំ',
  'Raw material purchases': 'ការទិញវត្ថុធាតុដើម',
  'Closing raw materials': 'វត្ថុធាតុដើមចុងឆ្នាំ',
  'Direct manufacturing labor': 'កម្លាំងពលកម្មផលិតកម្មផ្ទាល់',
  'Factory overheads': 'ចំណាយទូទៅរោងចក្រ',
  'Opening work in progress': 'ផលិតកម្មកំពុងដំណើរការដើមឆ្នាំ',
  'Closing work in progress': 'ផលិតកម្មកំពុងដំណើរការចុងឆ្នាំ',
  'Opening finished goods': 'ទំនិញសម្រេចដើមឆ្នាំ',
  'Closing finished goods': 'ទំនិញសម្រេចចុងឆ្នាំ',
  'Opening merchandise': 'ទំនិញដើមឆ្នាំ',
  'Merchandise purchases': 'ការទិញទំនិញ',
  'Closing merchandise': 'ទំនិញចុងឆ្នាំ',
  'Non-deductible additions': 'ការបន្ថែមដែលមិនអាចកាត់កងបាន',
  'Other taxable adjustments': 'ការកែតម្រូវជាប់ពន្ធផ្សេងទៀត',
  'Allowable deductions': 'ការកាត់កងដែលអនុញ្ញាត',
  'Exempt income': 'ចំណូលលើកលែងពន្ធ',
  'Other deductions': 'ការកាត់កងផ្សេងទៀត',
  'Income tax rate': 'អត្រាពន្ធលើប្រាក់ចំណូល',
  'Foreign tax credits': 'ឥណទានពន្ធបរទេស',
  'Advance tax on dividends': 'ពន្ធបង់មុនលើភាគលាភ',
  'Minimum tax': 'ពន្ធអប្បបរមា',
  'Prepayments (including PPM 1%)': 'ការបង់មុន (រួមទាំង PPM 1%)',
  'Charitable donations': 'អំណោយសប្បុរសធម៌',
  'Interest income for limitation': 'ចំណូលការប្រាក់សម្រាប់ការកំណត់ដែន',
  'Tax loss · N−1': 'ការខាតពន្ធ · N−1',
  'Tax loss · N−2': 'ការខាតពន្ធ · N−2',
  'Tax loss · N−3': 'ការខាតពន្ធ · N−3',
  'Tax loss · N−4': 'ការខាតពន្ធ · N−4',
  'Tax loss · N−5': 'ការខាតពន្ធ · N−5',
  'Unused interest · N−1': 'ការប្រាក់មិនបានប្រើ · N−1',
  'Unused interest · N−2': 'ការប្រាក់មិនបានប្រើ · N−2',
  'Unused interest · N−3': 'ការប្រាក់មិនបានប្រើ · N−3',
  'Unused interest · N−4': 'ការប្រាក់មិនបានប្រើ · N−4',
  'Unused interest · N−5': 'ការប្រាក់មិនបានប្រើ · N−5',
  'Opening historical cost': 'ថ្លៃដើមប្រវត្តិសាស្ត្រដើមឆ្នាំ',
  'Current-year additions': 'ការបន្ថែមក្នុងឆ្នាំបច្ចុប្បន្ន',
  'Asset cost disposed': 'ថ្លៃដើមទ្រព្យសកម្មដែលបានចោល',
  'Opening accumulated depreciation': 'រំលស់បង្គរដើមឆ្នាំ',
  'Current-year depreciation': 'រំលស់ក្នុងឆ្នាំបច្ចុប្បន្ន',
  'Accumulated depreciation removed on disposal': 'រំលស់បង្គរដែលបានដកពេលចោល',
  'Qualifying asset acquisition cost': 'ថ្លៃដើមទិញទ្រព្យសកម្មដែលមានលក្ខណៈគ្រប់គ្រាន់',
  'Disposals / cost removed': 'ការចោល / ថ្លៃដើមដែលបានដក',
  'Realized sale proceeds': 'ប្រាក់ដែលបានពីការលក់',
  'Tax written-down value': 'តម្លៃសៀវភៅសម្រាប់ពន្ធ',
  'Opening provisions': 'សំវិធានធនដើមឆ្នាំ',
  Additions: 'ការបន្ថែម',
  'Reversals / amounts used': 'ការបញ្ច្រាស / ចំនួនដែលបានប្រើ',
  'Related entity directory (one entity per line)': 'បញ្ជីអង្គភាពពាក់ព័ន្ធ (មួយអង្គភាពក្នុងមួយបន្ទាត់)',
  'Opening balance': 'សមតុល្យដើម',
  'Increases / transactions': 'ការកើនឡើង / ប្រតិបត្តិការ',
  'Decreases / settlements': 'ការថយចុះ / ការទូទាត់',
  'Branch and business-activity details (one branch per line)': 'ព័ត៌មានសាខា និងសកម្មភាពអាជីវកម្ម (មួយសាខាក្នុងមួយបន្ទាត់)',
  'Branch revenue': 'ចំណូលសាខា',
  'Branch expenses': 'ចំណាយសាខា',
  'Profit distributed': 'ប្រាក់ចំណេញដែលបានចែកចាយ',
  'Excess distribution tax rate': 'អត្រាពន្ធលើការចែកចាយលើស',
};

function localize(val) {
  return language.isKhmer ? khmerLabels[val] || val : val;
}

const numberField = (key, label, unit = 'KHR') => ({ key, label, unit });
const textField = (key, label) => ({ key, label, type: 'textarea', wide: true });

const schedules = [
  {
    id: 'P1',
    short: 'Identity',
    title: 'Enterprise General Information & Tax Period',
    description: 'Return identification and annual tax period.',
    fields: [
      {
        key: 'business_type',
        label: 'Business activity for COGS linkage',
        type: 'select',
        options: [
          { value: 'other', label: 'Other / enter costs in P5' },
          { value: 'manufacturing', label: 'Manufacturing (P7)' },
          { value: 'trading', label: 'Trading / commercial (P8)' },
        ],
      },
    ],
  },
  {
    id: 'P2',
    short: 'Ownership',
    title: 'Shareholder & Management Structure',
    description: 'Aggregate share and capital information. Shareholder detail records can be included in the supporting return documents.',
    fields: [
      numberField('p2_share_count', 'Total shares issued', 'shares'),
      numberField('p2_paid_capital', 'Paid-up capital'),
      numberField('p2_registered_capital', 'Registered capital'),
    ],
  },
  {
    id: 'P3',
    short: 'Assets',
    title: 'Balance Sheet: Assets',
    description: 'Enter year-end asset balances.',
    fields: [
      numberField('p3_intangible_assets', 'Intangible assets'),
      numberField('p3_property_plant_equipment', 'Property, plant and equipment'),
      numberField('p3_long_term_investments', 'Long-term investments'),
      numberField('p3_other_non_current_assets', 'Other non-current assets'),
      numberField('p3_inventory', 'Inventory'),
      numberField('p3_accounts_receivable', 'Accounts receivable'),
      numberField('p3_short_term_investments', 'Short-term investments'),
      numberField('p3_cash', 'Cash and cash equivalents'),
      numberField('p3_other_current_assets', 'Other current assets'),
    ],
  },
  {
    id: 'P4',
    short: 'Equity & Liabilities',
    title: 'Balance Sheet: Equity & Liabilities',
    description: 'Enter year-end equity and liability balances.',
    fields: [
      numberField('p4_share_capital', 'Share capital'),
      numberField('p4_retained_earnings', 'Retained earnings'),
      numberField('p4_current_year_profit', 'Current-year profit'),
      numberField('p4_other_equity', 'Other equity'),
      numberField('p4_long_term_borrowings', 'Long-term borrowings'),
      numberField('p4_other_non_current_liabilities', 'Other non-current liabilities'),
      numberField('p4_accounts_payable', 'Accounts payable'),
      numberField('p4_tax_payable', 'Tax payable'),
      numberField('p4_other_current_liabilities', 'Other current liabilities'),
    ],
  },
  {
    id: 'P5',
    short: 'Income',
    title: 'Income Statement: Revenues & Gross Profit',
    description: 'Enter annual revenue, cost of sales and income aggregates.',
    fields: [
      numberField('p5_revenue_goods', 'Revenue from goods'),
      numberField('p5_revenue_services', 'Revenue from services'),
      numberField('p5_revenue_rent', 'Rental revenue'),
      numberField('p5_revenue_commissions', 'Commission revenue'),
      numberField('p5_revenue_other', 'Other revenue'),
      numberField('p5_cogs_materials', 'Cost of materials'),
      numberField('p5_cogs_merchandise', 'Cost of merchandise'),
      numberField('p5_cogs_labor', 'Direct labor'),
      numberField('p5_cogs_other', 'Other cost of sales'),
      numberField('p5_interest_income', 'Interest income'),
      numberField('p5_dividend_income', 'Dividend income'),
      numberField('p5_rental_income', 'Other rental income'),
      numberField('p5_other_income', 'Other income'),
      numberField('p5_staff_costs', 'Staff costs'),
      numberField('p5_rent', 'Rent expense'),
      numberField('p5_utilities', 'Utilities'),
      numberField('p5_transport', 'Transport'),
      numberField('p5_marketing', 'Marketing'),
      numberField('p5_other_operating_costs', 'Other operating costs'),
    ],
  },
  {
    id: 'P6',
    short: 'Profit',
    title: 'Income Statement: Operating Expenses & Net Profit',
    description: 'Enter finance costs and other expenses not captured in P5.',
    fields: [
      numberField('p6_interest_expense', 'Interest expense'),
      numberField('p6_depreciation_expense', 'Accounting depreciation'),
      numberField('p6_other_expenses', 'Other expenses'),
      numberField('p6_income_tax_expense', 'Income tax expense'),
    ],
  },
  {
    id: 'P7',
    short: 'Manufacturing COGS',
    title: 'Manufacturing Cost of Goods Sold',
    description: 'Raw material consumption and manufacturing costs.',
    fields: [
      numberField('p7_opening_raw_materials', 'Opening raw materials'),
      numberField('p7_purchases_raw_materials', 'Raw material purchases'),
      numberField('p7_closing_raw_materials', 'Closing raw materials'),
      numberField('p7_direct_labor', 'Direct manufacturing labor'),
      numberField('p7_factory_overheads', 'Factory overheads'),
      numberField('p7_opening_wip', 'Opening work in progress'),
      numberField('p7_closing_wip', 'Closing work in progress'),
      numberField('p7_opening_finished_goods', 'Opening finished goods'),
      numberField('p7_closing_finished_goods', 'Closing finished goods'),
    ],
  },
  {
    id: 'P8',
    short: 'Trading COGS',
    title: 'Trading / Commercial Cost of Goods Sold',
    description: 'Merchandise available for sale and closing inventory.',
    fields: [
      numberField('p8_opening_merchandise', 'Opening merchandise'),
      numberField('p8_purchases', 'Merchandise purchases'),
      numberField('p8_closing_merchandise', 'Closing merchandise'),
    ],
  },
  {
    id: 'P9',
    short: 'Reconciliation',
    title: 'Tax Reconciliation',
    description: 'Bridge accounting profit to taxable profit through additions, deductions and exempt income.',
    fields: [
      numberField('p9_additions', 'Non-deductible additions'),
      numberField('p9_other_adjustments', 'Other taxable adjustments'),
      numberField('p9_deductions', 'Allowable deductions'),
      numberField('p9_exempt_income', 'Exempt income'),
    ],
  },
  {
    id: 'P10',
    short: 'TOI calculation',
    title: 'TOI Main Calculation & Tax Payable',
    description: 'Rates, credits and prepayments feed the computed annual liability.',
    fields: [
      numberField('p10_additional_deductions', 'Other deductions'),
      { ...numberField('p10_tax_rate_percent', 'Income tax rate', '%'), step: '0.01', max: 100 },
      numberField('p10_foreign_tax_credit', 'Foreign tax credits'),
      numberField('p10_advance_dividend_tax', 'Advance tax on dividends'),
      numberField('p10_minimum_tax', 'Minimum tax'),
      numberField('p10_prepayments', 'Prepayments (including PPM 1%)'),
    ],
  },
  {
    id: 'P11',
    short: 'Tax limits',
    title: 'Charitable Donations & Interest Limitation',
    description: 'Donation deduction is limited to 5% of the positive cap base; interest deduction is limited using the supplied 50% rule.',
    fields: [
      numberField('p11_charitable_donation', 'Charitable donations'),
      numberField('p11_interest_income', 'Interest income for limitation'),
    ],
  },
  {
    id: 'P12',
    short: 'Carry forwards',
    title: 'Interest & Loss Carried Forward',
    description: 'Record unused interest and tax losses within the five preceding tax periods.',
    fields: [
      numberField('p12_loss_year_1', 'Tax loss · N−1'),
      numberField('p12_loss_year_2', 'Tax loss · N−2'),
      numberField('p12_loss_year_3', 'Tax loss · N−3'),
      numberField('p12_loss_year_4', 'Tax loss · N−4'),
      numberField('p12_loss_year_5', 'Tax loss · N−5'),
      numberField('p12_interest_cf_year_1', 'Unused interest · N−1'),
      numberField('p12_interest_cf_year_2', 'Unused interest · N−2'),
      numberField('p12_interest_cf_year_3', 'Unused interest · N−3'),
      numberField('p12_interest_cf_year_4', 'Unused interest · N−4'),
      numberField('p12_interest_cf_year_5', 'Unused interest · N−5'),
    ],
  },
  {
    id: 'P13',
    short: 'Depreciation',
    title: 'Depreciation Schedule',
    description: 'Enter asset cost and accumulated depreciation movements.',
    fields: [
      numberField('p13_historical_cost', 'Opening historical cost'),
      numberField('p13_additions', 'Current-year additions'),
      numberField('p13_cost_disposals', 'Asset cost disposed'),
      numberField('p13_opening_accumulated_depreciation', 'Opening accumulated depreciation'),
      numberField('p13_current_depreciation', 'Current-year depreciation'),
      numberField('p13_accumulated_depreciation_disposals', 'Accumulated depreciation removed on disposal'),
    ],
  },
  {
    id: 'P14',
    short: 'Special depreciation',
    title: 'Special Depreciation Allowance',
    description: 'Qualifying new tangible asset cost and the 40% allowance calculation.',
    fields: [
      numberField('p14_qualifying_asset_cost', 'Qualifying asset acquisition cost'),
      numberField('p14_disposals', 'Disposals / cost removed'),
    ],
  },
  {
    id: 'P15',
    short: 'Disposals',
    title: 'Asset Realization / Disposals',
    description: 'Compare sale proceeds with tax written-down value.',
    fields: [
      numberField('p15_sale_proceeds', 'Realized sale proceeds'),
      numberField('p15_tax_written_down_value', 'Tax written-down value'),
    ],
  },
  {
    id: 'P16',
    short: 'Provisions',
    title: 'Provisions Tracking Schedule',
    description: 'Track opening provisions, additions, reversals and use.',
    fields: [
      numberField('p16_opening_provisions', 'Opening provisions'),
      numberField('p16_additions', 'Additions'),
      numberField('p16_reversals', 'Reversals / amounts used'),
    ],
  },
  {
    id: 'P17',
    short: 'Related entities',
    title: 'Branch / Related Entity Directory',
    description: 'List related entities, tax identifiers, names and addresses for the supporting filing.',
    fields: [textField('p17_related_entities', 'Related entity directory (one entity per line)')],
  },
  {
    id: 'P18',
    short: 'Related parties',
    title: 'Related Party Transactions',
    description: 'Related-party balance movement: opening + increases − decreases.',
    fields: [
      numberField('p18_opening_related_balances', 'Opening balance'),
      numberField('p18_increases', 'Increases / transactions'),
      numberField('p18_decreases', 'Decreases / settlements'),
    ],
  },
  {
    id: 'P19',
    short: 'Business activities',
    title: 'Summary of Business Activities / Branches',
    description: 'List business sites, branch identifiers, and tax periods for the annual return.',
    fields: [textField('p19_branches', 'Branch and business-activity details (one branch per line)')],
  },
  {
    id: 'P20',
    short: 'Branch operations',
    title: 'Branch Operating Revenue & Expense',
    description: 'Aggregate operating revenue and expenses reported for branches.',
    fields: [
      numberField('p20_branch_revenue', 'Branch revenue'),
      numberField('p20_branch_expenses', 'Branch expenses'),
    ],
  },
  {
    id: 'P21',
    short: 'Dividend tax',
    title: 'Additional / Minimum Tax on Distributed Profit',
    description: 'Enter distributions and the applicable additional dividend-tax rate.',
    fields: [
      numberField('p21_profit_distributed', 'Profit distributed'),
      { ...numberField('p21_dividend_tax_rate_percent', 'Excess distribution tax rate', '%'), step: '0.01', max: 100 },
    ],
  },
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

const returnRecord = reactive({
  id: null,
  company_name: '',
  enterprise_tin: '',
  tax_year: nowYear,
  period_start: `${nowYear}-01-01`,
  period_end: `${nowYear}-12-31`,
  status: 'draft',
});

const values = reactive({});
const details = reactive({});

function resetFields() {
  for (const schedule of schedules) {
    for (const field of schedule.fields || []) {
      if (field.type === 'textarea' || field.type === 'select') {
        details[field.key] = field.key === 'business_type' ? 'other' : '';
      } else {
        values[field.key] = field.key === 'p10_tax_rate_percent' ? 20 : 0;
      }
    }
  }
}
resetFields();

const isEditable = computed(() => !returnRecord.id || returnRecord.status === 'draft');
const activeIndex = computed(() => schedules.findIndex((schedule) => schedule.id === activeSchedule.value));
const activeDefinition = computed(() => schedules[activeIndex.value] || schedules[0]);

const p7RawConsumed = computed(() => {
  const opening = Number(values.p7_opening_raw_materials) || 0;
  const purchases = Number(values.p7_purchases_raw_materials) || 0;
  const closing = Number(values.p7_closing_raw_materials) || 0;
  return Math.max(0, opening + purchases - closing);
});

const p8Cogs = computed(() => {
  const opening = Number(values.p8_opening_merchandise) || 0;
  const purchases = Number(values.p8_purchases) || 0;
  const closing = Number(values.p8_closing_merchandise) || 0;
  return Math.max(0, opening + purchases - closing);
});

const calculations = computed(() => {
  const n = (key) => Math.max(0, Number(values[key]) || 0);
  const sum = (...keys) => keys.reduce((total, key) => total + n(key), 0);
  const rounded = (val) => Math.round(val + Number.EPSILON);

  // Balance Sheet
  const assetsNonCurrent = sum(
    'p3_intangible_assets',
    'p3_property_plant_equipment',
    'p3_long_term_investments',
    'p3_other_non_current_assets'
  );
  const assetsCurrent = sum(
    'p3_inventory',
    'p3_accounts_receivable',
    'p3_short_term_investments',
    'p3_cash',
    'p3_other_current_assets'
  );
  const assetsTotal = assetsNonCurrent + assetsCurrent;

  const equity = sum(
    'p4_share_capital',
    'p4_retained_earnings',
    'p4_current_year_profit',
    'p4_other_equity'
  );
  const liabilities = sum(
    'p4_long_term_borrowings',
    'p4_other_non_current_liabilities',
    'p4_accounts_payable',
    'p4_tax_payable',
    'p4_other_current_liabilities'
  );

  // Income Statement
  const revenue = sum(
    'p5_revenue_goods',
    'p5_revenue_services',
    'p5_revenue_rent',
    'p5_revenue_commissions',
    'p5_revenue_other'
  );

  const rawConsumed = sum('p7_opening_raw_materials', 'p7_purchases_raw_materials') - n('p7_closing_raw_materials');
  const manufacturingCosts = Math.max(
    0,
    rawConsumed +
      sum('p7_direct_labor', 'p7_factory_overheads', 'p7_opening_wip', 'p7_opening_finished_goods') -
      sum('p7_closing_wip', 'p7_closing_finished_goods')
  );

  const tradingCosts = Math.max(
    0,
    sum('p8_opening_merchandise', 'p8_purchases') - n('p8_closing_merchandise')
  );

  let directCosts = sum('p5_cogs_materials', 'p5_cogs_merchandise', 'p5_cogs_labor', 'p5_cogs_other');
  if (details.business_type === 'manufacturing') directCosts = manufacturingCosts;
  else if (details.business_type === 'trading') directCosts = tradingCosts;

  const otherIncome = sum('p5_interest_income', 'p5_dividend_income', 'p5_rental_income', 'p5_other_income');
  const operatingCosts = sum(
    'p5_staff_costs',
    'p5_rent',
    'p5_utilities',
    'p5_transport',
    'p5_marketing',
    'p5_other_operating_costs'
  );

  const grossProfit = revenue - directCosts;
  const operatingProfit = grossProfit + otherIncome - operatingCosts;
  const accountingProfit = operatingProfit - sum('p6_interest_expense', 'p6_depreciation_expense', 'p6_other_expenses');

  // Reconciliation (P9 & P10)
  const donation = n('p11_charitable_donation');
  const adjustedProfit =
    accountingProfit +
    n('p9_additions') +
    n('p9_other_adjustments') -
    n('p9_deductions') -
    n('p9_exempt_income') -
    n('p10_additional_deductions');

  // Charitable Donation Limitation (P11): 5% Cap
  const donationCapBase = Math.max(0, adjustedProfit + donation);
  const donationAllowance = Math.min(donation, rounded(donationCapBase * 0.05));
  const donationAddback = Math.max(0, donation - donationAllowance);

  // Interest Expense Limitation (P11 & P12)
  const interestExpense = n('p6_interest_expense');
  const interestIncome = n('p11_interest_income') || n('p5_interest_income');
  const interestCapBase = Math.max(0, adjustedProfit + donationAddback + interestExpense - interestIncome);
  const allowableInterest = Math.max(0, rounded(interestCapBase * 0.5) + interestIncome);

  const interestCarryforwardAvailable = sum(
    'p12_interest_cf_year_1',
    'p12_interest_cf_year_2',
    'p12_interest_cf_year_3',
    'p12_interest_cf_year_4',
    'p12_interest_cf_year_5'
  );

  const currentInterestAllowed = Math.min(interestExpense, allowableInterest);
  const remainingInterestRoom = Math.max(0, allowableInterest - currentInterestAllowed);
  const interestCarryforwardDeduction = Math.min(interestCarryforwardAvailable, remainingInterestRoom);
  const interestAdjustment = Math.max(0, interestExpense - allowableInterest) - interestCarryforwardDeduction;

  // Taxable Income & Loss Carryforwards (P12)
  const taxableBeforeLosses = Math.max(0, adjustedProfit + donationAddback + interestAdjustment);
  const lossCarryforwardAvailable = sum(
    'p12_loss_year_1',
    'p12_loss_year_2',
    'p12_loss_year_3',
    'p12_loss_year_4',
    'p12_loss_year_5'
  );
  const lossCarryforwardDeduction = Math.min(lossCarryforwardAvailable, taxableBeforeLosses);
  const taxableIncome = Math.max(0, taxableBeforeLosses - lossCarryforwardDeduction);

  // Tax on Income (P10)
  const taxRate = Math.min(100, Math.max(0, Number(values.p10_tax_rate_percent) || 0)) / 100;
  const incomeTax = rounded(taxableIncome * taxRate);

  // Excess Dividend Distribution (P21)
  const dividendExcess = Math.max(0, n('p21_profit_distributed') - taxableIncome);
  const divTaxRate = Math.min(100, Math.max(0, Number(values.p21_dividend_tax_rate_percent) || 0)) / 100;
  const dividendTax = rounded(dividendExcess * divTaxRate);

  const grossTax = incomeTax + dividendTax;
  const foreignTaxCredit = Math.min(grossTax, n('p10_foreign_tax_credit'));
  const taxAfterForeignCredit = Math.max(0, grossTax - foreignTaxCredit);

  const advanceDividendCredit = Math.min(taxAfterForeignCredit, n('p10_advance_dividend_tax'));
  const finalTax = Math.max(0, taxAfterForeignCredit - advanceDividendCredit);

  const prepayments = n('p10_prepayments');
  const minimumTax = n('p10_minimum_tax');

  return {
    assets: { non_current: assetsNonCurrent, current: assetsCurrent, total: assetsTotal },
    equity,
    liabilities,
    balance_check: assetsTotal - equity - liabilities,
    revenue,
    direct_costs: directCosts,
    manufacturing_cogs: manufacturingCosts,
    trading_cogs: tradingCosts,
    gross_profit: grossProfit,
    other_income: otherIncome,
    operating_costs: operatingCosts,
    operating_profit: operatingProfit,
    accounting_profit_before_tax: accountingProfit,
    accounting_profit_after_tax: accountingProfit - n('p6_income_tax_expense'),
    adjusted_net_profit: adjustedProfit,
    donation_cap_base: donationCapBase,
    maximum_deductible_donation: donationAllowance,
    charitable_donation_addback: donationAddback,
    allowable_interest: allowableInterest,
    interest_adjustment: interestAdjustment,
    interest_carryforward_available: interestCarryforwardAvailable,
    interest_carryforward_deduction: interestCarryforwardDeduction,
    loss_carryforward_available: lossCarryforwardAvailable,
    loss_carryforward_deduction: lossCarryforwardDeduction,
    taxable_income: taxableIncome,
    taxable_income_tax: incomeTax,
    excess_dividend_distribution: dividendExcess,
    excess_dividend_tax: dividendTax,
    gross_income_tax: grossTax,
    foreign_tax_credit: foreignTaxCredit,
    advance_dividend_tax_credit: advanceDividendCredit,
    final_income_tax: finalTax,
    prepayments,
    tax_payable_standard: Math.max(0, finalTax - prepayments),
    minimum_tax_payable: Math.max(0, Math.max(finalTax, minimumTax) - prepayments),
    depreciation_ending_nbv: Math.max(
      0,
      Math.max(0, n('p13_historical_cost') + n('p13_additions') - n('p13_cost_disposals')) -
        Math.max(0, n('p13_opening_accumulated_depreciation') + n('p13_current_depreciation') - n('p13_accumulated_depreciation_disposals'))
    ),
    special_depreciation_allowance: Math.max(0, n('p14_qualifying_asset_cost') - n('p14_disposals')) * 0.4,
    asset_disposal_tax_gain_loss: n('p15_sale_proceeds') - n('p15_tax_written_down_value'),
    provision_closing_balance: n('p16_opening_provisions') + n('p16_additions') - n('p16_reversals'),
    related_party_closing_balance: n('p18_opening_related_balances') + n('p18_increases') - n('p18_decreases'),
  };
});

function money(val) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(val) || 0));
}

function stepSchedule(direction) {
  const nextIdx = Math.max(0, Math.min(schedules.length - 1, activeIndex.value + direction));
  activeSchedule.value = schedules[nextIdx].id;
}

function applyReturn(item) {
  resetFields();
  returnRecord.id = item.id;
  returnRecord.company_name = item.company_name || '';
  returnRecord.enterprise_tin = item.enterprise_tin || '';
  returnRecord.tax_year = Number(item.tax_year) || nowYear;
  returnRecord.period_start = item.period_start ? String(item.period_start).slice(0, 10) : '';
  returnRecord.period_end = item.period_end ? String(item.period_end).slice(0, 10) : '';
  returnRecord.status = item.status || 'draft';

  const rawValues = item.values || item.values_json || {};
  const rawDetails = item.details || item.details_json || {};

  Object.assign(values, rawValues);
  Object.assign(details, rawDetails);

  minimumTaxApplies.value = Boolean(rawDetails.minimum_tax_applies);
  selectedId.value = String(item.id);
  activeSchedule.value = 'P1';
}

function startNewReturn() {
  resetFields();
  returnRecord.id = null;
  returnRecord.company_name = '';
  returnRecord.enterprise_tin = '';
  returnRecord.tax_year = nowYear;
  returnRecord.period_start = `${nowYear}-01-01`;
  returnRecord.period_end = `${nowYear}-12-31`;
  returnRecord.status = 'draft';
  minimumTaxApplies.value = false;
  selectedId.value = '';
  activeSchedule.value = 'P1';
}

async function loadReturns() {
  loading.value = true;
  error.value = '';
  try {
    const list = await api.annualTaxReturns();
    returns.value = Array.isArray(list) ? list : [];
    const selected = returns.value.find((item) => String(item.id) === selectedId.value) || returns.value[0];
    if (selected) applyReturn(selected);
    else startNewReturn();
  } catch (err) {
    error.value = userError(err);
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
    company_name: returnRecord.company_name.trim(),
    enterprise_tin: returnRecord.enterprise_tin.trim(),
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
    error.value = text(
      'Enter the enterprise legal name and TIN before saving.',
      'សូមបញ្ចូលឈ្មោះស្របច្បាប់របស់សហគ្រាស និងលេខ TIN មុនពេលរក្សាទុក។'
    );
    activeSchedule.value = 'P1';
    return;
  }

  saving.value = true;
  error.value = '';
  success.value = '';

  try {
    const data = payload(status);
    const saved = returnRecord.id
      ? await api.updateAnnualTaxReturn(returnRecord.id, data)
      : await api.createAnnualTaxReturn(data);

    applyReturn(saved);

    const exists = returns.value.some((item) => String(item.id) === String(saved.id));
    if (exists) {
      returns.value = returns.value.map((item) => (String(item.id) === String(saved.id) ? saved : item));
    } else {
      returns.value.unshift(saved);
    }

    success.value =
      status === 'filed'
        ? text('Annual TOI return filed and locked.', 'លិខិតប្រកាស TOI ប្រចាំឆ្នាំត្រូវបានដាក់ និងចាក់សោ។')
        : text('Annual TOI return saved.', 'លិខិតប្រកាស TOI ប្រចាំឆ្នាំត្រូវបានរក្សាទុក។');
  } catch (err) {
    error.value = userError(err);
  } finally {
    saving.value = false;
  }
}

async function fileReturn() {
  const confirmed = await confirmDialog({
    title: text('File annual return', 'ដាក់លិខិតប្រកាសប្រចាំឆ្នាំ'),
    message: text(
      'File this annual return? A filed return is legally submitted and cannot be edited.',
      'តើអ្នកចង់ដាក់លិខិតប្រកាសប្រចាំឆ្នាំនេះឬទេ? លិខិតប្រកាសដែលបានដាក់រួចត្រូវបានបញ្ជូនជាផ្លូវការ និងមិនអាចកែសម្រួលបានទេ។'
    ),
    variant: 'warning',
    confirmText: text('File return', 'ដាក់លិខិតប្រកាស'),
  });

  if (!confirmed) return;
  await saveReturn('filed');
}

onMounted(loadReturns);
</script>

<style scoped>
.annual-filing {
  color: #24322d;
  --filing-ink: #24322d;
  --filing-green: #19724f;
  --filing-line: #dce5df;
}
.filing-header {
  border-bottom: 1px solid var(--filing-line);
  padding-bottom: 1.1rem;
}
.eyebrow {
  color: var(--filing-green);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.return-select {
  width: min(340px, 72vw);
}
.identity-panel,
.schedule-panel {
  border: 1px solid var(--filing-line);
  background: #fff;
  border-radius: 4px;
}
.identity-panel {
  padding: 1rem;
  border-top: 3px solid var(--filing-green);
}
.identity-heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.identity-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  color: var(--filing-green);
  background: #eaf3ed;
  border-radius: 4px;
}
.identity-fields {
  display: grid;
  grid-template-columns: repeat(5, minmax(140px, 1fr));
  gap: 0.75rem;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
}
.form-field span small {
  color: #728078;
  font-weight: 400;
}
.return-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--filing-line);
  background: #f7faf8;
  border-radius: 4px;
}
.return-summary > div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.8rem 1rem;
  border-right: 1px solid var(--filing-line);
}
.return-summary > div:last-child {
  border-right: 0;
}
.return-summary span,
.calculation-result span {
  color: #64716a;
  font-size: 0.76rem;
}
.return-summary strong {
  color: var(--filing-ink);
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}
.return-summary small {
  color: #7e8983;
  font-size: 0.68rem;
}
.summary-payable {
  background: #eaf3ed;
}
.calculation-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 1rem;
  padding: 0.55rem 0.8rem;
  background: #f1f5f2;
  color: #4d5b53;
  font-size: 0.76rem;
  border-radius: 4px;
}
.calculation-strip span:first-child {
  color: var(--filing-green);
  font-weight: 700;
}
.schedule-nav {
  display: flex;
  gap: 0.35rem;
  overflow-x: auto;
  padding-bottom: 0.4rem;
  scrollbar-width: thin;
}
.schedule-tab {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.45rem;
  min-height: 38px;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--filing-line);
  background: #fff;
  color: #44534a;
  font-size: 0.75rem;
  border-radius: 4px;
  cursor: pointer;
}
.schedule-tab span {
  color: var(--filing-green);
  font-size: 0.67rem;
  font-weight: 800;
}
.schedule-tab.active {
  border-color: var(--filing-green);
  background: var(--filing-green);
  color: #fff;
}
.schedule-tab.active span {
  color: #d8f0e1;
}
.schedule-panel {
  min-height: 330px;
  padding: 1.1rem;
}
.schedule-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--filing-line);
}
.schedule-pager {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: #67746c;
  font-size: 0.78rem;
  white-space: nowrap;
}
.schedule-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
}
.wide-field {
  grid-column: 1 / -1;
}
.schedule-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 0.85rem;
  border-top: 1px solid var(--filing-line);
  background: #f7faf8;
  font-size: 0.85rem;
}
.schedule-total strong {
  font-variant-numeric: tabular-nums;
}
.calculation-result {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
  padding: 0.8rem;
  background: #f1f5f2;
  border-radius: 4px;
}
.calculation-result > div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.calculation-result strong {
  font-size: 0.92rem;
  font-variant-numeric: tabular-nums;
}
.minimum-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  grid-column: 1 / -1;
  margin-top: 0.2rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.empty-schedule,
.empty-return {
  display: grid;
  place-items: center;
  gap: 0.6rem;
  padding: 3rem 1rem;
  color: #758279;
  text-align: center;
}
.empty-schedule i,
.empty-return > i {
  color: var(--filing-green);
  font-size: 1.7rem;
}
.empty-return {
  min-height: 300px;
  border: 1px dashed #cbd8cf;
  background: #f8faf8;
  border-radius: 4px;
}
.empty-return p {
  max-width: 480px;
}
.loading-state {
  padding: 3rem;
  text-align: center;
  color: #69766e;
}

@media (max-width: 900px) {
  .identity-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .return-summary,
  .calculation-result {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .return-summary > div:nth-child(2) {
    border-right: 0;
  }
  .return-summary > div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--filing-line);
  }
  .schedule-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .identity-fields,
  .schedule-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .wide-field,
  .minimum-toggle {
    grid-column: auto;
  }
  .schedule-panel {
    padding: 0.8rem;
  }
  .schedule-heading {
    flex-direction: column;
  }
  .return-summary > div {
    padding: 0.65rem;
  }
  .return-summary strong {
    font-size: 0.98rem;
  }
  .calculation-strip {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
  }
  .return-select {
    flex: 1 1 100%;
    width: 100%;
  }
}
</style>