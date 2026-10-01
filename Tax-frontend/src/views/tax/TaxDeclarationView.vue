<template>
  <section class="tax-workspace container-fluid p-3 p-xl-4">
    <!-- Workspace Header -->
    <header class="workspace-header d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
      <div>
        <div class="eyebrow mb-1">
          {{ isKhmer ? 'អនុលោមភាពពន្ធ' : 'TAX COMPLIANCE' }}
        </div>
        <h1 class="h3 fw-bold mb-1">
          {{ isKhmer ? 'ប្រកាសពន្ធប្រចាំខែ' : 'Monthly Tax Declaration' }}
        </h1>
        <p class="text-muted mb-0">
          {{ isKhmer ? 'កំណត់ត្រាពន្ធ និងការគណនាតាមខែ' : 'Monthly journals, returns, and tax payable' }}
        </p>
      </div>

      <div class="d-flex flex-wrap gap-2 align-items-center">
        <button class="btn btn-outline-secondary" type="button" :disabled="loading" @click="reload">
          <i class="bi bi-arrow-clockwise me-1"></i>
          {{ isKhmer ? 'ផ្ទុកឡើងវិញ' : 'Refresh' }}
        </button>
        <button class="btn btn-dark" type="button" :disabled="!summary" @click="printDeclaration">
          <i class="bi bi-printer me-1"></i>
          {{ isKhmer ? 'បោះពុម្ព' : 'Print declaration' }}
        </button>
      </div>
    </header>

    <!-- Notification Alerts -->
    <div v-if="error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
      <span>{{ error }}</span>
      <button class="btn-close" type="button" aria-label="Close" @click="error = ''"></button>
    </div>

    <div v-if="success" class="alert alert-success alert-dismissible fade show" role="status">
      <span>{{ success }}</span>
      <button class="btn-close" type="button" aria-label="Close" @click="success = ''"></button>
    </div>

    <!-- Tax Period Settings Panel -->
    <section class="period-panel mb-4" aria-label="Tax period settings">
      <div class="period-heading d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div class="d-flex align-items-center gap-2">
          <span class="period-mark">
            <i class="bi bi-calendar3"></i>
          </span>
          <div>
            <div class="small text-muted">
              {{ isKhmer ? 'ក្រុមហ៊ុន និងរយៈពេល' : 'COMPANY & TAX PERIOD' }}
            </div>
            <strong>{{ periodForm.company_name || 'Axis Investment Consulting' }}</strong>
          </div>
        </div>

        <div class="d-flex flex-wrap align-items-center gap-2">
          <select 
            v-model="selectedPeriodId" 
            class="form-select period-select" 
            :disabled="loading" 
            aria-label="Select tax period" 
            @change="loadSelectedPeriod"
          >
            <option v-for="entry in periods" :key="entry.id" :value="String(entry.id)">
              {{ periodName(entry) }}
            </option>
          </select>

          <span v-if="periodForm.status" class="badge status-badge" :class="`status-${periodForm.status}`">
            {{ periodForm.status }}
          </span>

          <button class="btn btn-outline-primary" type="button" :disabled="loading" @click="createPeriod">
            <i class="bi bi-plus-lg me-1"></i>
            {{ isKhmer ? 'ខែថ្មី' : 'New period' }}
          </button>
        </div>
      </div>

      <div class="period-fields">
        <label class="form-field">
          <span>{{ isKhmer ? 'ខែ' : 'Month' }}</span>
          <select v-model.number="periodForm.period_month" class="form-select" :disabled="!isDraft">
            <option v-for="month in 12" :key="month" :value="month">{{ monthName(month) }}</option>
          </select>
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'ឆ្នាំ' : 'Year' }}</span>
          <input v-model.number="periodForm.period_year" class="form-control" type="number" min="2000" max="2200" :disabled="!isDraft" />
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'អត្រាប្តូរប្រាក់ NBC (KHR/USD)' : 'NBC rate (KHR/USD)' }}</span>
          <input v-model.number="periodForm.nbc_exchange_rate" class="form-control" type="number" min="1" step="1" :disabled="!isDraft" @input="syncFormExchangeRate" />
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'VAT credit ខែមុន (KHR)' : 'Prior VAT credit (KHR)' }}</span>
          <input :value="summary?.vat?.box_05_previous_credit_khr ?? periodForm.previous_vat_credit_khr" class="form-control" type="number" disabled />
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'ToP credit ខែមុន (KHR)' : 'Prior ToP credit (KHR)' }}</span>
          <input v-model.number="periodForm.previous_top_credit_khr" class="form-control" type="number" min="0" step="1" :disabled="!isDraft" />
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'ពន្ធជាក់លាក់ (KHR)' : 'Specific tax (KHR)' }}</span>
          <input v-model.number="periodForm.specific_tax_khr" class="form-control" type="number" min="0" step="1" :disabled="!isDraft" />
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'ពន្ធផ្សេងៗ (KHR)' : 'Other taxes (KHR)' }}</span>
          <input v-model.number="periodForm.other_taxes_khr" class="form-control" type="number" min="0" step="1" :disabled="!isDraft" />
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'មូលដ្ឋានពន្ធស្នាក់នៅ (KHR)' : 'Accommodation tax base (KHR)' }}</span>
          <input v-model.number="periodForm.accommodation_tax_base_khr" class="form-control" type="number" min="0" step="1" :disabled="!isDraft" />
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'មូលដ្ឋានពន្ធបំភ្លឺសាធារណៈ (KHR)' : 'Public lighting tax base (KHR)' }}</span>
          <input v-model.number="periodForm.public_lighting_tax_base_khr" class="form-control" type="number" min="0" step="1" :disabled="!isDraft" />
        </label>

        <label class="form-field">
          <span>{{ isKhmer ? 'ស្ថានភាព' : 'Status' }}</span>
          <select v-model="periodForm.status" class="form-select" :disabled="selectedSavedStatus === 'locked'">
            <option value="draft" :disabled="selectedSavedStatus !== 'draft'">{{ isKhmer ? 'ព្រាង' : 'Draft' }}</option>
            <option value="filed">{{ isKhmer ? 'បានដាក់' : 'Filed' }}</option>
            <option value="locked">{{ isKhmer ? 'បានចាក់សោ' : 'Locked' }}</option>
          </select>
        </label>

        <div class="period-save align-self-end">
          <button class="btn btn-primary w-100" type="button" :disabled="saving || selectedSavedStatus === 'locked'" @click="savePeriod">
            <i class="bi bi-check2 me-1"></i>
            {{ saving ? (isKhmer ? 'កំពុងរក្សាទុក...' : 'Saving...') : (isKhmer ? 'រក្សាទុកការកំណត់' : 'Save settings') }}
          </button>
        </div>
      </div>
    </section>

    <!-- Navigation Tabs -->
    <nav class="tax-tabs nav nav-tabs mb-3" aria-label="Tax declaration sections">
      <button 
        v-for="tab in tabs" 
        :key="tab.id" 
        class="nav-link" 
        :class="{ active: activeTab === tab.id }" 
        type="button" 
        @click="activeTab = tab.id"
      >
        <i :class="`bi ${tab.icon} me-1`"></i>{{ label(tab) }}
      </button>
    </nav>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <span class="spinner-border spinner-border-sm me-2"></span>
      {{ isKhmer ? 'កំពុងផ្ទុកទិន្នន័យពន្ធ...' : 'Loading tax data...' }}
    </div>

    <!-- Active Journal Tabs (Purchases, Sales, Salaries, WHT) -->
    <template v-else-if="recordKind">
      <!-- Specialized Sales Component -->
      <SalesJournalView
        v-if="recordKind === 'sales'"
        ref="salesJournalRef"
        :key="selectedPeriodId"
        :records="records.sales"
        :nbc-exchange-rate="Number(periodForm.nbc_exchange_rate) || 0"
        :period-month="Number(periodForm.period_month)"
        :period-year="Number(periodForm.period_year)"
        :is-draft="isDraft"
        :is-khmer="isKhmer"
        :saving="saving"
        @save-record="saveSalesRecord"
        @delete-record="deleteSalesRecord"
      />

      <!-- Specialized WHT Component -->
      <WithholdingTaxEntry
        v-else-if="recordKind === 'wht'"
        :rows="records.wht"
        :objects="whtObjects"
        :is-draft="isDraft"
        :saving="saving"
        @save-items="saveWhtItems"
      />

      <!-- Standard Entry Form for Purchases & Salaries -->
      <section v-if="recordKind !== 'sales' && recordKind !== 'wht'" class="entry-panel mb-3">
        <div class="section-heading d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <h2 class="h6 fw-bold mb-1">
              {{ editingId ? (isKhmer ? 'កែប្រែកំណត់ត្រា' : 'Edit journal entry') : label(activeTabDefinition) }}
            </h2>
            <p class="small text-muted mb-0">
              {{ isDraft 
                ? (isKhmer ? 'រូបិយប័ណ្ណ USD នឹងបម្លែងទៅ KHR តាមអត្រាខែនេះ។' : 'USD entries convert using this period’s NBC exchange rate.') 
                : (isKhmer ? 'រយៈពេលនេះមិនអាចកែប្រែបានទេ។' : 'This period is read-only.') 
              }}
            </p>
          </div>
          <span class="small text-muted">
            {{ (records[recordKind] || []).length }} {{ isKhmer ? 'កំណត់ត្រា' : 'entries' }}
          </span>
        </div>

        <form class="entry-form" @submit.prevent="saveRecord">
          <div class="field-grid">
            <label 
              v-for="field in fieldsFor(recordKind)" 
              :key="field.key" 
              class="form-field" 
              :class="{ 'wide-field': field.wide, 'checkbox-field': field.type === 'checkbox' }"
            >
              <span>{{ fieldLabel(field) }}</span>

              <select v-if="field.type === 'select'" v-model="recordForm[field.key]" class="form-select" :disabled="!isDraft" :required="field.required">
                <option v-for="option in field.options" :key="option.value" :value="option.value">
                  {{ optionLabel(option) }}
                </option>
              </select>

              <input v-else-if="field.type === 'checkbox'" v-model="recordForm[field.key]" class="form-check-input" type="checkbox" :disabled="!isDraft" />

              <input 
                v-else 
                v-model="recordForm[field.key]" 
                class="form-control" 
                :type="field.type || 'text'" 
                :step="field.step" 
                :min="field.min" 
                :max="field.max" 
                :required="field.required" 
                :readonly="field.readonly" 
                :disabled="!isDraft" 
                @input="syncCurrency(field.key)" 
              />
            </label>
          </div>

          <div v-if="recordKind !== 'wht'" class="calculation-preview">
            <span>{{ isKhmer ? 'ការគណនាបច្ចុប្បន្ន' : 'Live calculation' }}</span>
            <strong>{{ liveCalculation }}</strong>
          </div>

          <div class="form-actions d-flex flex-wrap justify-content-end gap-2">
            <button v-if="editingId" class="btn btn-outline-secondary" type="button" @click="resetForm">
              {{ isKhmer ? 'បោះបង់' : 'Cancel edit' }}
            </button>
            <button class="btn btn-primary" type="submit" :disabled="saving || !isDraft">
              <i class="bi bi-plus-lg me-1"></i>
              {{ saving 
                ? (isKhmer ? 'កំពុងរក្សាទុក...' : 'Saving...') 
                : editingId 
                  ? (isKhmer ? 'ធ្វើបច្ចុប្បន្នភាព' : 'Update entry') 
                  : (isKhmer ? 'បន្ថែមកំណត់ត្រា' : 'Add entry') 
              }}
            </button>
          </div>
        </form>
      </section>

      <!-- Purchases Journal Table -->
      <section v-if="recordKind === 'purchases'" class="journal-panel">
        <div class="table-responsive">
          <table class="table journal-table purchase-record-table align-middle mb-0">
            <thead>
              <tr>
                <th>{{ isKhmer ? 'កាលបរិច្ឆេទ' : 'Date' }}</th>
                <th>{{ isKhmer ? 'លេខវិក្កយបត្រ' : 'Invoice No' }}</th>
                <th>{{ isKhmer ? 'អ្នកផ្គត់ផ្គង់ / VAT TIN' : 'Supplier / VAT TIN' }}</th>
                <th>{{ isKhmer ? 'បរិយាយ' : 'Description' }}</th>
                <th class="text-end">{{ isKhmer ? 'បរិមាណ' : 'Qty' }}</th>
                <th>{{ isKhmer ? 'ប្រភេទ' : 'Type' }}</th>
                <th class="text-end">{{ isKhmer ? 'ចំនួនទឹកប្រាក់' : 'Amount' }}</th>
                <th class="text-end">VAT (KHR)</th>
                <th class="text-end">{{ isKhmer ? 'សរុប (KHR)' : 'Total (KHR)' }}</th>
                <th class="text-end no-print">{{ isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in records.purchases" :key="row.id">
                <td class="text-nowrap">{{ purchaseDate(row.invoice_date) }}</td>
                <td class="text-nowrap">{{ row.invoice_no || '-' }}</td>
                <td>
                  <div>{{ row.supplier_name }}</div>
                  <small class="text-muted">{{ row.supplier_tin ? `TIN: ${row.supplier_tin}` : '' }}</small>
                </td>
                <td>{{ row.description || '-' }}</td>
                <td class="text-end">{{ Number(row.quantity || 0) || '-' }}</td>
                <td>{{ purchaseTypeLabel(row.expense_type) }}</td>
                <td class="text-end purchase-amount-cell">
                  <div>$ {{ moneyUsd(row.amount_usd) }}</div>
                  <small class="text-muted">{{ money(row.amount_khr) }} KHR</small>
                </td>
                <td class="text-end">{{ money(row.vat_amount_khr) }}</td>
                <td class="text-end fw-semibold">{{ money(row.amount_khr) }}</td>
                <td class="text-end text-nowrap no-print">
                  <button class="btn btn-sm btn-light me-1" type="button" :disabled="!isDraft" :title="isKhmer ? 'កែប្រែ' : 'Edit'" @click="editRecord(row)">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-sm btn-light text-danger" type="button" :disabled="!isDraft" :title="isKhmer ? 'លុប' : 'Delete'" @click="removeRecord(row)">
                    <i class="bi bi-trash3"></i>
                  </button>
                </td>
              </tr>
              <tr v-if="!records.purchases.length">
                <td colspan="10" class="empty-row">{{ isKhmer ? 'មិនទាន់មានកំណត់ត្រាទិញ' : 'No purchase entries for this period.' }}</td>
              </tr>
            </tbody>
            <tfoot v-if="records.purchases.length">
              <tr class="total-row">
                <th colspan="6" class="text-end">{{ isKhmer ? 'សរុប' : 'Total' }}</th>
                <td class="text-end purchase-amount-cell">
                  <div>$ {{ moneyUsd(purchaseTotalUsd) }}</div>
                  <small>{{ money(purchaseTotalKhr) }} KHR</small>
                </td>
                <td class="text-end">{{ money(purchaseTotalVat) }}</td>
                <td class="text-end">{{ money(purchaseTotalKhr) }}</td>
                <td class="no-print"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- Salaries Journal Table -->
      <section v-else-if="recordKind === 'salaries'" class="journal-panel">
        <div class="table-responsive">
          <table class="table journal-table salary-record-table align-middle mb-0">
            <thead>
              <tr>
                <th>{{ isKhmer ? 'ល.រ' : 'N°' }}</th>
                <th>{{ isKhmer ? 'ឈ្មោះ' : 'Name' }}</th>
                <th class="text-end">{{ isKhmer ? 'ប្រាក់ខែគោល (US$)' : 'Basic Salary (US$)' }}</th>
                <th class="text-end">{{ isKhmer ? 'ប្រាក់ខែគោល (KHR)' : 'Basic Salary (KHR)' }}</th>
                <th class="text-end">{{ isKhmer ? 'ប្រាក់រង្វាន់ (KHR) (*20%)' : 'Bonus (KHR) (*20%)' }}</th>
                <th class="text-end">{{ isKhmer ? 'អត្រាពន្ធ' : 'Tax Rate' }}</th>
                <th class="text-end">{{ isKhmer ? 'ពន្ធប្រាក់បៀវត្ស' : 'TOS' }}</th>
                <th class="text-end">{{ isKhmer ? 'ប្រាក់ខែសុទ្ធ (KHR)' : 'Net Salary (KHR)' }}</th>
                <th class="text-end no-print">{{ isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in records.salaries" :key="row.id">
                <td>{{ index + 1 }}</td>
                <td>{{ row.employee_name }}</td>
                <td class="text-end text-nowrap">$ {{ moneyUsd(row.basic_salary_usd) }}</td>
                <td class="text-end text-nowrap">R {{ money(row.basic_salary_khr) }}</td>
                <td class="text-end text-nowrap">R {{ money(row.bonus_khr) }}</td>
                <td class="text-end">{{ percentLabel(row.tax_rate) }}</td>
                <td class="text-end text-nowrap">R {{ money(row.tos_amount_khr) }}</td>
                <td class="text-end text-nowrap fw-semibold">R {{ money(row.net_salary_khr) }}</td>
                <td class="text-end text-nowrap no-print">
                  <button class="btn btn-sm btn-light me-1" type="button" :disabled="!isDraft" :title="isKhmer ? 'កែប្រែ' : 'Edit'" @click="editRecord(row)">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-sm btn-light text-danger" type="button" :disabled="!isDraft" :title="isKhmer ? 'លុប' : 'Delete'" @click="removeRecord(row)">
                    <i class="bi bi-trash3"></i>
                  </button>
                </td>
              </tr>
              <tr v-if="!records.salaries.length">
                <td colspan="9" class="empty-row">{{ isKhmer ? 'មិនទាន់មានកំណត់ត្រាប្រាក់បៀវត្ស' : 'No salary records for this period.' }}</td>
              </tr>
            </tbody>
            <tfoot v-if="records.salaries.length">
              <tr class="total-row">
                <th colspan="2" class="text-end">{{ isKhmer ? 'សរុប' : 'Total' }}</th>
                <th class="text-end">$ {{ moneyUsd(salaryTotalUsd) }}</th>
                <th class="text-end">R {{ money(salaryTotalKhr) }}</th>
                <th class="text-end">R {{ money(salaryTotalBonus) }}</th>
                <th></th>
                <th class="text-end">R {{ money(salaryTotalTos) }}</th>
                <th class="text-end">R {{ money(salaryTotalNet) }}</th>
                <th class="no-print"></th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </template>

    <!-- Computed Summary Panels -->
    <section v-else-if="summary" class="return-panel">
      <!-- VAT Return Tab -->
      <template v-if="activeTab === 'vat'">
        <div class="section-heading d-flex justify-content-between align-items-center gap-2">
          <div>
            <h2 class="h6 fw-bold mb-1">{{ isKhmer ? 'ប្រកាសអាករលើតម្លៃបន្ថែម' : 'Value Added Tax Return' }}</h2>
            <p class="small text-muted mb-0">{{ isKhmer ? 'គណនាតាមទិន្នន័យសៀវភៅទិញ និងលក់' : 'Calculated from purchase and sales journals' }}</p>
          </div>
          <span class="badge" :class="Number(summary?.vat?.box_16_tax_payable_khr || 0) > 0 ? 'text-bg-danger' : 'text-bg-success'">
            {{ Number(summary?.vat?.box_16_tax_payable_khr || 0) > 0 ? (isKhmer ? 'ត្រូវបង់' : 'Tax due') : (isKhmer ? 'ឥណទាន' : 'Credit') }}
          </span>
        </div>
        <div class="return-table-wrap">
          <table class="table return-table align-middle">
            <thead>
              <tr>
                <th>{{ isKhmer ? 'ប្រអប់' : 'Box' }}</th>
                <th>{{ isKhmer ? 'បរិយាយ' : 'Description' }}</th>
                <th class="text-end">KHR</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="box in vatBoxes" :key="box.key" :class="{ 'total-row': box.total }">
                <td class="box-number">{{ box.number }}</td>
                <td>{{ label(box) }}</td>
                <td class="text-end amount-cell">{{ money(summary?.vat?.[box.key]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Prepayment of Profit Tax Tab -->
      <template v-else-if="activeTab === 'prepayment'">
        <div class="section-heading">
          <h2 class="h6 fw-bold mb-1">{{ isKhmer ? 'ប្រាក់បង់មុនពន្ធលើប្រាក់ចំណេញ និងពន្ធផ្សេងៗ' : 'Prepayment of Profit Tax & Other Taxes' }}</h2>
          <p class="small text-muted mb-0">{{ isKhmer ? 'គណនាតាមប្រអប់នៃប្រកាសពន្ធប្រចាំខែ' : 'Monthly tax return boxes calculated from sales and period settings' }}</p>
        </div>
        <div class="return-table-wrap">
          <table class="table return-table align-middle">
            <thead>
              <tr>
                <th>{{ isKhmer ? 'ប្រអប់' : 'Box' }}</th>
                <th>{{ isKhmer ? 'បរិយាយ' : 'Description' }}</th>
                <th class="text-end">{{ isKhmer ? 'មូលដ្ឋាន (KHR)' : 'Tax base (KHR)' }}</th>
                <th class="text-end">{{ isKhmer ? 'អត្រា' : 'Rate' }}</th>
                <th class="text-end">{{ isKhmer ? 'ចំនួនពន្ធ (KHR)' : 'Tax amount (KHR)' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="box-number">04</td>
                <td>{{ isKhmer ? 'ឥណទានពីខែមុន' : 'Credit from last month' }}</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_04_previous_credit_khr) }}</td>
              </tr>
              <tr>
                <td class="box-number">05</td>
                <td>{{ isKhmer ? 'មូលដ្ឋានគណនាប្រាក់បង់មុន (ចំណូលលក់)' : 'Prepayment calculation base (sales turnover)' }}</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_05_calculation_base_khr) }}</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
              </tr>
              <tr>
                <td class="box-number">06</td>
                <td>{{ isKhmer ? 'ប្រាក់បង់មុនប្រចាំខែ' : 'Prepayment of the month' }}</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_05_calculation_base_khr) }}</td>
                <td class="text-end">1%</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_06_prepayment_khr) }}</td>
              </tr>
              <tr>
                <td class="box-number">07</td>
                <td>{{ isKhmer ? 'ឥណទានផ្ទេរទៅខែក្រោយ' : 'Credit carried forward' }}</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_07_credit_carried_forward_khr) }}</td>
              </tr>
              <tr>
                <td class="box-number">08</td>
                <td>{{ isKhmer ? 'ប្រាក់បង់មុនពន្ធលើប្រាក់ចំណេញត្រូវបង់' : 'Prepayment of profit tax due' }}</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_08_profit_tax_due_khr) }}</td>
              </tr>
              <tr>
                <td class="box-number">09-12</td>
                <td>{{ isKhmer ? 'ពន្ធជាក់លើទំនិញ និងសេវាកម្ម' : 'Specific tax on goods and services' }}</td>
                <td class="text-end">-</td>
                <td class="text-end">{{ isKhmer ? 'បញ្ចូលដោយដៃ' : 'Manual' }}</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_09_12_specific_tax_khr) }}</td>
              </tr>
              <tr>
                <td class="box-number">13</td>
                <td>{{ isKhmer ? 'មូលដ្ឋានពន្ធស្នាក់នៅ' : 'Accommodation tax base' }}</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_13_accommodation_base_khr) }}</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
              </tr>
              <tr>
                <td class="box-number">14</td>
                <td>{{ isKhmer ? 'ពន្ធស្នាក់នៅ' : 'Accommodation tax' }}</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_13_accommodation_base_khr) }}</td>
                <td class="text-end">2%</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_14_accommodation_tax_khr) }}</td>
              </tr>
              <tr>
                <td class="box-number">15</td>
                <td>{{ isKhmer ? 'មូលដ្ឋានពន្ធបំភ្លឺសាធារណៈ' : 'Public lighting tax base' }}</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_15_public_lighting_base_khr) }}</td>
                <td class="text-end">-</td>
                <td class="text-end">-</td>
              </tr>
              <tr>
                <td class="box-number">16</td>
                <td>{{ isKhmer ? 'ពន្ធបំភ្លឺសាធារណៈ' : 'Public lighting tax' }}</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_15_public_lighting_base_khr) }}</td>
                <td class="text-end">3%</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_16_public_lighting_tax_khr) }}</td>
              </tr>
              <tr>
                <td class="box-number">17-18</td>
                <td>{{ isKhmer ? 'ពន្ធផ្សេងៗ' : 'Other taxes' }}</td>
                <td class="text-end">-</td>
                <td class="text-end">{{ isKhmer ? 'បញ្ចូលដោយដៃ' : 'Manual' }}</td>
                <td class="text-end">{{ money(summary?.prepayment?.box_17_18_other_taxes_khr) }}</td>
              </tr>
              <tr class="total-row">
                <td class="box-number">19</td>
                <td colspan="3">{{ isKhmer ? 'សរុបពន្ធត្រូវបង់' : 'Total tax due' }}</td>
                <td class="text-end amount-cell">{{ money(summary?.prepayment?.box_19_total_tax_due_khr) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- TOS Tab -->
      <template v-else-if="activeTab === 'tos'">
        <div class="section-heading">
          <h2 class="h6 fw-bold mb-1">{{ isKhmer ? 'ពន្ធលើប្រាក់បៀវត្ស' : 'Tax on Salary (TOS)' }}</h2>
          <p class="small text-muted mb-0">
            {{ isKhmer ? 'ពន្ធអ្នកស្នាក់នៅគណនាតាមកម្រិតជាន់ និងការកាត់បន្ថយអ្នកក្នុងបន្ទុក ១៥០,០០០ KHR' : 'Resident salary tax is progressive; dependant relief is KHR 150,000 each.' }}
          </p>
        </div>
        <div class="return-table-wrap">
          <table class="table journal-table align-middle">
            <thead>
              <tr>
                <th>{{ isKhmer ? 'ឈ្មោះបុគ្គលិក' : 'Employee' }}</th>
                <th>{{ isKhmer ? 'ស្ថានភាព' : 'Residency' }}</th>
                <th class="text-end">{{ isKhmer ? 'មូលដ្ឋានជាប់ពន្ធ' : 'Taxable base' }}</th>
                <th class="text-end">{{ isKhmer ? 'អត្រាបន្ទាប់' : 'Marginal rate' }}</th>
                <th class="text-end">{{ isKhmer ? 'ពន្ធលើប្រាក់បៀវត្ស' : 'TOS' }}</th>
                <th class="text-end">{{ isKhmer ? 'ពន្ធអត្ថប្រយោជន៍' : 'Fringe benefit tax' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in records.salaries" :key="row.id">
                <td>{{ row.employee_name }}</td>
                <td>{{ row.is_resident ? (isKhmer ? 'អ្នកស្នាក់នៅ' : 'Resident') : (isKhmer ? 'មិនស្នាក់នៅ' : 'Non-resident') }}</td>
                <td class="text-end">{{ money(row.taxable_base_khr) }}</td>
                <td class="text-end">{{ Number(row.tax_rate || 0) * 100 }}%</td>
                <td class="text-end">{{ money(row.tos_amount_khr) }}</td>
                <td class="text-end">{{ money(row.fringe_benefit_tax_khr) }}</td>
              </tr>
              <tr v-if="!records.salaries.length">
                <td colspan="6" class="empty-row">{{ isKhmer ? 'មិនទាន់មានបុគ្គលិក' : 'No salary records for this period.' }}</td>
              </tr>
              <tr class="total-row">
                <td colspan="4">{{ isKhmer ? 'សរុបពន្ធលើប្រាក់បៀវត្ស' : 'Total tax on salary' }}</td>
                <td class="text-end amount-cell">{{ money(summary?.totals?.salary_tos_khr) }}</td>
                <td class="text-end">{{ money(summary?.totals?.fringe_benefit_tax_khr) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Declaration Summary Tab (Printable Document) -->
      <template v-else>
        <article id="declaration-print" class="declaration-paper">
          <div class="paper-company">
            <div class="company-symbol">AX</div>
            <div>
              <strong>{{ periodForm.company_name }}</strong>
              <div>{{ isKhmer ? 'ប្រព័ន្ធគ្រប់គ្រងប្រកាសពន្ធប្រចាំខែ' : 'Monthly Tax Declaration' }}</div>
              <small>VAT TIN: {{ periodForm.vat_tin }}</small>
            </div>
          </div>

          <div class="paper-rule"></div>

          <div class="paper-title">
            <p>{{ isKhmer ? 'ប្រកាសពន្ធប្រចាំខែ' : 'MONTHLY TAX DECLARATION' }}</p>
            <h2>{{ monthName(periodForm.period_month) }} {{ periodForm.period_year }}</h2>
          </div>

          <div class="paper-meta">
            <span>{{ isKhmer ? 'អត្រាប្តូរប្រាក់ NBC' : 'NBC Exchange Rate' }}: {{ money(periodForm.nbc_exchange_rate) }} KHR/USD</span>
            <span>{{ isKhmer ? 'ស្ថានភាព' : 'Status' }}: {{ periodForm.status }}</span>
          </div>

          <table class="table paper-table">
            <tbody>
              <tr>
                <td>{{ isKhmer ? 'ប្រាក់បង់មុនពន្ធលើប្រាក់ចំណេញ និងពន្ធផ្សេងៗ' : 'Prepayment & related taxes' }}</td>
                <td>{{ money(summary?.prepayment?.total_khr) }} KHR</td>
              </tr>
              <tr>
                <td>{{ isKhmer ? 'ពន្ធកាត់ទុក' : 'Withholding tax' }}</td>
                <td>{{ money(summary?.totals?.wht_khr) }} KHR</td>
              </tr>
              <tr>
                <td>{{ isKhmer ? 'ពន្ធលើប្រាក់បៀវត្ស' : 'Tax on salary' }}</td>
                <td>{{ money(summary?.totals?.tos_khr) }} KHR</td>
              </tr>
              <tr>
                <td>{{ isKhmer ? 'អាករលើតម្លៃបន្ថែមត្រូវបង់' : 'VAT payable' }}</td>
                <td>{{ money(summary?.totals?.vat_due_khr) }} KHR</td>
              </tr>
              <tr class="paper-total">
                <td>{{ isKhmer ? 'សរុបពន្ធត្រូវបង់' : 'TOTAL TAX PAYABLE' }}</td>
                <td>{{ money(summary?.totals?.total_tax_due_khr) }} KHR</td>
              </tr>
              <tr>
                <td>{{ isKhmer ? 'ឥណទាន VAT ទៅខែក្រោយ' : 'VAT credit carried forward' }}</td>
                <td>{{ money(summary?.totals?.vat_credit_khr) }} KHR</td>
              </tr>
            </tbody>
          </table>

          <div class="paper-signatures">
            <div>
              <span></span>
              {{ isKhmer ? 'ហត្ថលេខាអ្នករៀបចំ' : 'Prepared by' }}
            </div>
            <div>
              <span></span>
              {{ isKhmer ? 'ហត្ថលេខា និងត្រាក្រុមហ៊ុន' : 'Authorized signature & stamp' }}
            </div>
          </div>
        </article>

        <div class="summary-footer d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3">
          <div>
            <span class="text-muted small">{{ isKhmer ? 'សរុបពន្ធត្រូវបង់' : 'Total tax payable' }}</span>
            <div class="payable-total">
              {{ money(summary?.totals?.total_tax_due_khr) }} <small>KHR</small>
            </div>
          </div>
          <span 
            class="badge fs-6" 
            :class="Number(summary?.totals?.total_tax_due_khr || 0) > 0 ? 'text-bg-warning' : 'text-bg-success'"
          >
            {{ Number(summary?.totals?.total_tax_due_khr || 0) > 0 ? (isKhmer ? 'ត្រូវបង់' : 'Payable') : (isKhmer ? 'គ្មានពន្ធត្រូវបង់' : 'No tax due') }}
          </span>
        </div>
      </template>
    </section>

    <!-- Empty State -->
    <div v-else class="empty-state">
      {{ isKhmer ? 'ជ្រើសរើស ឬបង្កើតរយៈពេលពន្ធ ដើម្បីចាប់ផ្តើម។' : 'Create or select a tax period to begin.' }}
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';
import SalesJournalView from '@/components/SalesJournalView.vue';
import WithholdingTaxEntry from '@/components/WithholdingTaxEntry.vue';

// ---------------------------------------------------------------------------
// Store & UI State
// ---------------------------------------------------------------------------
const language = useLanguageStore();
const isKhmer = computed(() => language?.isKhmer ?? false);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');

const activeTab = ref('purchases');
const editingId = ref(null);
const salesJournalRef = ref(null);

// ---------------------------------------------------------------------------
// Periods & Summary Data
// ---------------------------------------------------------------------------
const periods = ref([]);
const selectedPeriodId = ref('');
const summary = ref(null);
const whtObjects = ref([]);

const periodForm = reactive({
  company_name: 'Axis Investment Consulting',
  vat_tin: 'K002-107004771',
  period_month: new Date().getMonth() + 1,
  period_year: new Date().getFullYear(),
  nbc_exchange_rate: 4070,
  previous_vat_credit_khr: 0,
  previous_top_credit_khr: 0,
  specific_tax_khr: 0,
  other_taxes_khr: 0,
  accommodation_tax_base_khr: 0,
  public_lighting_tax_base_khr: 0,
  status: 'draft',
});

const records = reactive({
  purchases: [],
  sales: [],
  salaries: [],
  wht: [],
});

// ---------------------------------------------------------------------------
// Form State
// ---------------------------------------------------------------------------
const INITIAL_RECORD_STATE = {
  invoice_date: '',
  invoice_no: '',
  supplier_name: '',
  supplier_tin: '',
  customer_name: '',
  customer_tin: '',
  employee_name: '',
  is_resident: true,
  description: '',
  quantity: 1,
  expense_type: 'local',
  sale_type: 'local_consumer_10',
  wht_type: 'resident',
  category: 'service_15',
  amount_usd: 0,
  amount_khr: 0,
  taxable_value_khr: 0,
  taxable_amount_usd: 0,
  taxable_amount_khr: 0,
  basic_salary_usd: 0,
  basic_salary_khr: 0,
  bonus_khr: 0,
  tax_rate: 0,
  tos_amount_khr: 0,
  base_amount_khr: 0,
  vat_rate: 10,
  remarks: '',
};

const recordForm = reactive({ ...INITIAL_RECORD_STATE });

// ---------------------------------------------------------------------------
// Configuration / Schemas
// ---------------------------------------------------------------------------
const tabs = [
  { id: 'purchases', en: 'Purchases', kh: 'ការទិញ', icon: 'bi-cart3' },
  { id: 'sales', en: 'Sales', kh: 'ការលក់', icon: 'bi-receipt' },
  { id: 'salaries', en: 'Salary', kh: 'ប្រាក់បៀវត្ស', icon: 'bi-people' },
  { id: 'wht', en: 'WHT', kh: 'ពន្ធកាត់ទុក', icon: 'bi-percent' },
  { id: 'vat', en: 'VAT Return', kh: 'ប្រកាស VAT', icon: 'bi-file-earmark-check' },
  { id: 'prepayment', en: 'Prepayment', kh: 'បង់មុន', icon: 'bi-calculator' },
  { id: 'tos', en: 'TOS', kh: 'ពន្ធប្រាក់បៀវត្ស', icon: 'bi-person-vcard' },
  { id: 'summary', en: 'Summary', kh: 'សង្ខេប', icon: 'bi-clipboard-data' },
];

const purchaseTypes = [
  { id: 'non_taxable', en: 'Non-taxable purchase', kh: 'ការទិញមិនជាប់ពន្ធ' },
  { id: 'import', en: 'Import purchase', kh: 'ការទិញនាំចូល' },
  { id: 'local', en: 'Local purchase', kh: 'ការទិញក្នុងស្រុក' },
];

const fields = {
  purchases: [
    { key: 'invoice_date', en: 'Invoice date', kh: 'កាលបរិច្ឆេទវិក្កយបត្រ', type: 'date' },
    { key: 'invoice_no', en: 'Invoice no.', kh: 'លេខវិក្កយបត្រ' },
    { key: 'supplier_name', en: 'Supplier name', kh: 'ឈ្មោះអ្នកផ្គត់ផ្គង់', required: true },
    { key: 'supplier_tin', en: 'Supplier TIN', kh: 'លេខអត្តសញ្ញាណពន្ធអ្នកផ្គត់ផ្គង់' },
    { key: 'description', en: 'Description', kh: 'បរិយាយ', wide: true },
    { key: 'quantity', en: 'Quantity', kh: 'បរិមាណ', type: 'number', min: 0, step: '0.001' },
    { 
      key: 'expense_type', 
      en: 'Purchase type', 
      kh: 'ប្រភេទការទិញ', 
      type: 'select', 
      options: [
        { value: 'non_taxable', en: 'Non-taxable', kh: 'មិនជាប់ពន្ធ' },
        { value: 'import', en: 'Import', kh: 'នាំចូល' },
        { value: 'local', en: 'Local', kh: 'ក្នុងស្រុក' },
      ] 
    },
    { key: 'amount_usd', en: 'Amount (USD)', kh: 'ចំនួនទឹកប្រាក់ (USD)', type: 'number', min: 0, step: '0.01' },
    { key: 'amount_khr', en: 'Amount (KHR)', kh: 'ចំនួនទឹកប្រាក់ (KHR)', type: 'number', min: 0, step: '1' },
    { key: 'taxable_value_khr', en: 'Taxable value (KHR)', kh: 'តម្លៃជាប់ពន្ធ (KHR)', type: 'number', min: 0, step: '1' },
    { key: 'vat_rate', en: 'VAT rate (%)', kh: 'អត្រា VAT (%)', type: 'number', min: 0, step: '0.1' },
  ],
  sales: [
    { key: 'invoice_date', en: 'Invoice date', kh: 'កាលបរិច្ឆេទវិក្កយបត្រ', type: 'date' },
    { key: 'invoice_no', en: 'Invoice no.', kh: 'លេខវិក្កយបត្រ' },
    { key: 'customer_name', en: 'Customer name', kh: 'ឈ្មោះអតិថិជន', required: true },
    { key: 'customer_tin', en: 'Customer TIN', kh: 'លេខអត្តសញ្ញាណពន្ធអតិថិជន' },
    { key: 'description', en: 'Description', kh: 'បរិយាយ', wide: true },
    { 
      key: 'sale_type', 
      en: 'Sale type', 
      kh: 'ប្រភេទការលក់', 
      type: 'select', 
      options: [
        { value: 'non_taxable', en: 'Non-taxable', kh: 'មិនជាប់ពន្ធ' },
        { value: 'export_0', en: 'Export 0%', kh: 'នាំចេញ ០%' },
        { value: 'taxable_person_10', en: 'Taxable person 10%', kh: 'អ្នកជាប់ពន្ធ ១០%' },
        { value: 'local_consumer_10', en: 'Local consumer 10%', kh: 'អ្នកប្រើប្រាស់ក្នុងស្រុក ១០%' },
      ] 
    },
    { key: 'taxable_amount_usd', en: 'Taxable amount (USD)', kh: 'ចំនួនជាប់ពន្ធ (USD)', type: 'number', min: 0, step: '0.01' },
    { key: 'taxable_amount_khr', en: 'Taxable amount (KHR)', kh: 'ចំនួនជាប់ពន្ធ (KHR)', type: 'number', min: 0, step: '1' },
    { key: 'vat_rate', en: 'VAT rate (%)', kh: 'អត្រា VAT (%)', type: 'number', min: 0, step: '0.1' },
  ],
  salaries: [
    { key: 'employee_name', en: 'Employee name', kh: 'ឈ្មោះបុគ្គលិក', required: true },
    { key: 'is_resident', en: 'Cambodian tax resident', kh: 'អ្នកស្នាក់នៅសម្រាប់ពន្ធ', type: 'checkbox' },
    { key: 'basic_salary_usd', en: 'Basic salary (USD)', kh: 'ប្រាក់ខែគោល (USD)', type: 'number', min: 0, step: '0.01' },
    { key: 'basic_salary_khr', en: 'Basic salary (KHR)', kh: 'ប្រាក់ខែគោល (KHR)', type: 'number', min: 0, step: '1' },
    { key: 'bonus_khr', en: 'Bonus (KHR, 20% tax)', kh: 'ប្រាក់រង្វាន់ (KHR, ពន្ធ ២០%)', type: 'number', min: 0, step: '1' },
    { key: 'tax_rate', en: 'Tax Rate (%)', kh: 'អត្រាពន្ធ (%)', type: 'number', min: 0, max: 100, step: '0.01' },
    { key: 'tos_amount_khr', en: 'TOS (KHR)', kh: 'ពន្ធប្រាក់បៀវត្ស (KHR)', type: 'number', min: 0, step: '1', readonly: true },
  ],
  wht: [
    { 
      key: 'wht_type', 
      en: 'Recipient type', 
      kh: 'ប្រភេទអ្នកទទួល', 
      type: 'select', 
      options: [
        { value: 'resident', en: 'Resident', kh: 'អ្នកស្នាក់នៅ' },
        { value: 'non_resident', en: 'Non-resident', kh: 'អ្នកមិនស្នាក់នៅ' },
      ] 
    },
    { 
      key: 'category', 
      en: 'WHT category', 
      kh: 'ប្រភេទពន្ធកាត់ទុក', 
      type: 'select', 
      options: [
        { value: 'service_15', en: 'Services 15%', kh: 'សេវាកម្ម ១៥%' },
        { value: 'rental_10', en: 'Rent 10%', kh: 'ជួល ១០%' },
        { value: 'interest_non_bank_15', en: 'Non-bank interest 15%', kh: 'ការប្រាក់ក្រៅធនាគារ ១៥%' },
        { value: 'fixed_deposit_6', en: 'Fixed deposit 6%', kh: 'ប្រាក់បញ្ញើមានកាលកំណត់ ៦%' },
        { value: 'savings_4', en: 'Savings 4%', kh: 'ប្រាក់សន្សំ ៤%' },
        { value: 'non_resident_14', en: 'Non-resident 14%', kh: 'អ្នកមិនស្នាក់នៅ ១៤%' },
      ] 
    },
    { key: 'base_amount_khr', en: 'Tax base (KHR)', kh: 'មូលដ្ឋានគិតពន្ធ (KHR)', type: 'number', min: 0, step: '1', required: true },
    { key: 'remarks', en: 'Remarks', kh: 'កំណត់សម្គាល់', wide: true },
  ],
};

const vatBoxes = [
  { key: 'box_05_previous_credit_khr', number: '05', en: 'Credit from previous month', kh: 'ឥណទានពីខែមុន' },
  { key: 'box_06_non_taxable_purchases_khr', number: '06', en: 'Non-taxable purchases', kh: 'ការទិញមិនជាប់ពន្ធ' },
  { key: 'box_07_local_purchases_khr', number: '07', en: 'Local purchases value', kh: 'តម្លៃការទិញក្នុងស្រុក' },
  { key: 'box_08_local_input_vat_khr', number: '08', en: 'VAT on local purchases', kh: 'VAT លើការទិញក្នុងស្រុក' },
  { key: 'box_09_import_purchases_khr', number: '09', en: 'Import purchases value', kh: 'តម្លៃការទិញនាំចូល' },
  { key: 'box_10_import_input_vat_khr', number: '10', en: 'VAT on import purchases', kh: 'VAT លើការទិញនាំចូល' },
  { key: 'box_11_total_input_vat_khr', number: '11', en: 'Total input tax', kh: 'អាករទិញសរុប', total: true },
  { key: 'box_12_non_taxable_sales_khr', number: '12', en: 'Non-taxable sales', kh: 'ការលក់មិនជាប់ពន្ធ' },
  { key: 'box_13_export_sales_khr', number: '13', en: 'Export sales (0%)', kh: 'ការនាំចេញ (០%)' },
  { key: 'box_14_standard_sales_khr', number: '14', en: 'Standard-rated sales', kh: 'ការលក់អត្រាស្តង់ដារ' },
  { key: 'box_15_output_vat_khr', number: '15', en: 'Output VAT', kh: 'អាករលក់' },
  { key: 'box_16_tax_payable_khr', number: '16', en: 'Tax payable', kh: 'VAT ត្រូវបង់', total: true },
  { key: 'box_18_credit_carried_forward_khr', number: '18', en: 'Credit carried forward', kh: 'ឥណទានទៅខែក្រោយ', total: true },
];

// ---------------------------------------------------------------------------
// Computed Properties
// ---------------------------------------------------------------------------
const activeTabDefinition = computed(() => tabs.find((t) => t.id === activeTab.value));
const recordKind = computed(() => ['purchases', 'sales', 'salaries', 'wht'].includes(activeTab.value) ? activeTab.value : '');
const isDraft = computed(() => periodForm.status === 'draft');
const selectedSavedStatus = computed(() => periods.value.find((p) => String(p.id) === selectedPeriodId.value)?.status || 'draft');

// Sum totals
const purchaseTotalUsd = computed(() => records.purchases.reduce((acc, row) => acc + (Number(row.amount_usd) || 0), 0));
const purchaseTotalKhr = computed(() => records.purchases.reduce((acc, row) => acc + (Number(row.amount_khr) || 0), 0));
const purchaseTotalVat = computed(() => records.purchases.reduce((acc, row) => acc + (Number(row.vat_amount_khr) || 0), 0));

const salaryTotalUsd = computed(() => records.salaries.reduce((acc, row) => acc + (Number(row.basic_salary_usd) || 0), 0));
const salaryTotalKhr = computed(() => records.salaries.reduce((acc, row) => acc + (Number(row.basic_salary_khr) || 0), 0));
const salaryTotalBonus = computed(() => records.salaries.reduce((acc, row) => acc + (Number(row.bonus_khr) || 0), 0));
const salaryTotalTos = computed(() => records.salaries.reduce((acc, row) => acc + (Number(row.tos_amount_khr) || 0), 0));
const salaryTotalNet = computed(() => records.salaries.reduce((acc, row) => acc + (Number(row.net_salary_khr) || 0), 0));

const liveCalculation = computed(() => {
  if (recordKind.value === 'purchases') {
    const localAmount = Number(recordForm.amount_usd) > 0 ? usdToKhr(recordForm.amount_usd) : Number(recordForm.amount_khr) || 0;
    const taxable = recordForm.expense_type === 'non_taxable' ? 0 : (Number(recordForm.taxable_value_khr) || localAmount);
    const vatRate = recordForm.expense_type === 'non_taxable' ? 0 : (Number(recordForm.vat_rate) || 0);
    return `${money(localAmount)} KHR · VAT ${money(taxable * (vatRate / 100))} KHR`;
  }
  if (recordKind.value === 'sales') {
    const amountKhr = Number(recordForm.taxable_amount_usd) > 0 ? usdToKhr(recordForm.taxable_amount_usd) : Number(recordForm.taxable_amount_khr) || 0;
    const vatRate = ['taxable_person_10', 'local_consumer_10'].includes(recordForm.sale_type) ? (Number(recordForm.vat_rate) || 0) : 0;
    return `${money(amountKhr)} KHR · VAT ${money(amountKhr * (vatRate / 100))} KHR`;
  }
  if (recordKind.value === 'salaries') {
    const basic = Number(recordForm.basic_salary_usd) > 0 ? usdToKhr(recordForm.basic_salary_usd) : Number(recordForm.basic_salary_khr) || 0;
    const bonus = Number(recordForm.bonus_khr || 0);
    const taxable = basic + bonus;
    const taxRate = Number(recordForm.tax_rate || 0);
    const tos = calculateSalaryTos(basic, taxRate);
    return `${money(taxable)} KHR taxable · ${taxRate}% rate · ${money(tos)} KHR TOS · ${money(taxable - tos)} KHR net`;
  }
  return '-';
});

// Watch tab kind changes to clean the current form
watch(recordKind, (kind) => {
  if (kind) resetForm();
});

// ---------------------------------------------------------------------------
// Helpers & Formatters
// ---------------------------------------------------------------------------
function label(item) { return isKhmer.value ? item.kh : item.en; }
function fieldLabel(field) { return isKhmer.value ? field.kh : field.en; }
function optionLabel(option) { return isKhmer.value ? option.kh : option.en; }
function purchaseTypeLabel(type) { return label(purchaseTypes.find((item) => item.id === type) || { en: type, kh: type }); }

function money(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
}

function moneyUsd(value) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function percentLabel(value) {
  return `${Number(((Number(value) || 0) * 100).toFixed(2))}%`;
}

function monthName(month) {
  return new Intl.DateTimeFormat(isKhmer.value ? 'km-KH' : 'en-US', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2020, Number(month || 1) - 1, 1)));
}

function periodName(period) {
  return `${monthName(period.period_month)} ${period.period_year} · ${period.status}`;
}

function purchaseDate(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) 
    ? String(value).slice(0, 10) 
    : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function usdToKhr(value) {
  return Math.round((Number(value) || 0) * (Number(periodForm.nbc_exchange_rate) || 0));
}

function calculateSalaryTos(basicSalaryKhr, taxRatePercent) {
  return Math.max(0, Math.round(((Number(basicSalaryKhr) || 0) * (Number(taxRatePercent) || 0)) / 100 - 60000));
}

function fieldsFor(kind) {
  return (fields[kind] || []).filter((field) => {
    if (kind !== 'purchases') return true;
    if (recordForm.expense_type === 'non_taxable' && ['taxable_value_khr', 'vat_rate'].includes(field.key)) {
      return false;
    }
    return true;
  });
}

function defaultRecord(kind) {
  const monthStr = String(periodForm.period_month).padStart(2, '0');
  const base = {
    ...INITIAL_RECORD_STATE,
    invoice_date: `${periodForm.period_year}-${monthStr}-01`,
  };
  if (kind === 'purchases' || kind === 'sales') {
    base.vat_rate = 10;
  }
  return base;
}

function resetForm() {
  editingId.value = null;
  Object.assign(recordForm, defaultRecord(recordKind.value));
}

// ---------------------------------------------------------------------------
// Currency Synchronization
// ---------------------------------------------------------------------------
function syncCurrency(key) {
  const exchangeRate = Number(periodForm.nbc_exchange_rate) || 0;

  if (recordKind.value === 'purchases') {
    if (key === 'amount_usd') {
      const prevKhr = Number(recordForm.amount_khr) || 0;
      recordForm.amount_khr = usdToKhr(recordForm.amount_usd);
      if (!Number(recordForm.taxable_value_khr) || Number(recordForm.taxable_value_khr) === prevKhr) {
        recordForm.taxable_value_khr = recordForm.amount_khr;
      }
    } else if (key === 'amount_khr') {
      recordForm.amount_usd = exchangeRate > 0 ? Number(((Number(recordForm.amount_khr) || 0) / exchangeRate).toFixed(2)) : 0;
      recordForm.taxable_value_khr = Number(recordForm.amount_khr) || 0;
    }
  }

  if (recordKind.value === 'sales') {
    if (key === 'taxable_amount_usd') {
      recordForm.taxable_amount_khr = usdToKhr(recordForm.taxable_amount_usd);
    } else if (key === 'taxable_amount_khr') {
      recordForm.taxable_amount_usd = exchangeRate > 0 ? Number(((Number(recordForm.taxable_amount_khr) || 0) / exchangeRate).toFixed(2)) : 0;
    }
  }

  if (recordKind.value === 'salaries') {
    if (key === 'basic_salary_usd') {
      recordForm.basic_salary_khr = usdToKhr(recordForm.basic_salary_usd);
    } else if (key === 'basic_salary_khr') {
      recordForm.basic_salary_usd = exchangeRate > 0 ? Number(((Number(recordForm.basic_salary_khr) || 0) / exchangeRate).toFixed(2)) : 0;
    }

    if (['basic_salary_usd', 'basic_salary_khr', 'tax_rate'].includes(key)) {
      const basicKhr = Number(recordForm.basic_salary_usd) > 0 ? usdToKhr(recordForm.basic_salary_usd) : Number(recordForm.basic_salary_khr) || 0;
      recordForm.tos_amount_khr = calculateSalaryTos(basicKhr, recordForm.tax_rate);
    }
  }
}

function syncFormExchangeRate() {
  const currencyKeys = { purchases: 'amount_usd', sales: 'taxable_amount_usd', salaries: 'basic_salary_usd' };
  const key = currencyKeys[recordKind.value];
  if (key) syncCurrency(key);
}

// ---------------------------------------------------------------------------
// API Interactions
// ---------------------------------------------------------------------------
async function loadPeriods() {
  periods.value = await api.taxPeriods();
  if (!periods.value?.length) {
    await createPeriod();
    return;
  }
  const matching = periods.value.find((p) => String(p.id) === selectedPeriodId.value);
  selectedPeriodId.value = String((matching || periods.value[0]).id);
  await loadSelectedPeriod();
}

async function loadSelectedPeriod() {
  if (!selectedPeriodId.value) return;
  loading.value = true;
  error.value = '';

  try {
    const current = periods.value.find((p) => String(p.id) === selectedPeriodId.value);
    if (!current) return;
    Object.assign(periodForm, current);
    await loadPeriodData();
    resetForm();
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  } finally {
    loading.value = false;
  }
}

async function loadPeriodData() {
  const [purchases, sales, salaries, whtResult, nextSummary] = await Promise.all([
    api.taxRecords(selectedPeriodId.value, 'purchases'),
    api.taxRecords(selectedPeriodId.value, 'sales'),
    api.taxRecords(selectedPeriodId.value, 'salaries'),
    api.monthlyWhtItems(selectedPeriodId.value),
    api.taxSummary(selectedPeriodId.value),
  ]);

  records.purchases = purchases || [];
  records.sales = sales || [];
  records.salaries = salaries || [];
  records.wht = whtResult?.items || [];
  whtObjects.value = whtResult?.objects || [];
  summary.value = nextSummary || null;
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    await loadPeriods();
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  } finally {
    loading.value = false;
  }
}

async function createPeriod() {
  const now = new Date();
  try {
    const created = await api.createTaxPeriod({
      period_month: now.getMonth() + 1,
      period_year: now.getFullYear(),
      nbc_exchange_rate: 4070,
    });
    periods.value = [created, ...periods.value.filter((p) => String(p.id) !== String(created.id))];
    selectedPeriodId.value = String(created.id);
    await loadSelectedPeriod();
    success.value = isKhmer.value ? 'បានបង្កើតរយៈពេលពន្ធថ្មី។' : 'Tax period created.';
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  }
}

async function savePeriod() {
  saving.value = true;
  error.value = '';
  success.value = '';

  try {
    const payload = selectedSavedStatus.value === 'draft' ? { ...periodForm } : { status: periodForm.status };
    const updated = await api.updateTaxPeriod(selectedPeriodId.value, payload);
    Object.assign(periodForm, updated);
    periods.value = periods.value.map((p) => (String(p.id) === selectedPeriodId.value ? updated : p));
    await loadPeriodData();
    success.value = isKhmer.value ? 'បានរក្សាទុកការកំណត់រយៈពេល។' : 'Tax period settings saved.';
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  } finally {
    saving.value = false;
  }
}

async function saveRecord() {
  saving.value = true;
  error.value = '';
  success.value = '';

  try {
    const payload = { ...recordForm };

    if (recordKind.value === 'purchases') {
      if (Number(payload.amount_usd) > 0) payload.amount_khr = usdToKhr(payload.amount_usd);
      if (payload.expense_type === 'non_taxable') {
        payload.vat_rate = 0;
        payload.taxable_value_khr = 0;
      } else {
        payload.vat_rate = (Number(payload.vat_rate) || 0) / 100;
      }
    }

    if (recordKind.value === 'sales') {
      if (Number(payload.taxable_amount_usd) > 0) payload.taxable_amount_khr = usdToKhr(payload.taxable_amount_usd);
      payload.vat_rate = ['taxable_person_10', 'local_consumer_10'].includes(payload.sale_type)
        ? (Number(payload.vat_rate) || 10) / 100
        : 0;
    }

    if (recordKind.value === 'salaries') {
      if (Number(payload.basic_salary_usd) > 0) payload.basic_salary_khr = usdToKhr(payload.basic_salary_usd);
      payload.num_spouses = 0;
      payload.num_children = 0;
      payload.fringe_benefit_usd = 0;
      payload.tax_rate = Number(recordForm.tax_rate) || 0;
      payload.tos_amount_khr = calculateSalaryTos(payload.basic_salary_khr, recordForm.tax_rate);
      payload.net_salary_khr = (Number(payload.basic_salary_khr) || 0) + (Number(payload.bonus_khr) || 0) - payload.tos_amount_khr;
    }

    const savedRecord = editingId.value
      ? await api.updateTaxRecord(selectedPeriodId.value, recordKind.value, editingId.value, payload)
      : await api.createTaxRecord(selectedPeriodId.value, recordKind.value, payload);

    await loadPeriodData();

    const targetList = records[recordKind.value];
    const index = targetList.findIndex((r) => String(r.id) === String(savedRecord.id));
    if (index !== -1) targetList.splice(index, 1, savedRecord);

    resetForm();
    success.value = isKhmer.value ? 'បានរក្សាទុកកំណត់ត្រា និងគណនាពន្ធឡើងវិញ។' : 'Entry saved and tax calculations refreshed.';
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  } finally {
    saving.value = false;
  }
}

async function saveSalesRecord({ id, payload }) {
  saving.value = true;
  error.value = '';
  success.value = '';

  try {
    const saved = id
      ? await api.updateTaxRecord(selectedPeriodId.value, 'sales', id, payload)
      : await api.createTaxRecord(selectedPeriodId.value, 'sales', payload);

    await loadPeriodData();
    const index = records.sales.findIndex((r) => String(r.id) === String(saved.id));
    if (index !== -1) records.sales.splice(index, 1, saved);

    salesJournalRef.value?.resetForm();
    success.value = isKhmer.value ? 'បានរក្សាទុកកំណត់ត្រាលក់។' : 'Sales entry saved.';
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  } finally {
    saving.value = false;
  }
}

async function saveWhtItems(items) {
  saving.value = true;
  error.value = '';
  success.value = '';

  try {
    const result = await api.saveMonthlyWhtItems({
      return_id: Number(selectedPeriodId.value),
      items,
      replace: true,
    });
    records.wht = result.items || [];
    summary.value = await api.taxSummary(selectedPeriodId.value);
    success.value = isKhmer.value ? 'បានរក្សាទុកធាតុពន្ធកាត់ទុកទាំងអស់។' : 'WHT items saved and recalculated.';
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function deleteSalesRecord(row) {
  const confirmMsg = isKhmer.value ? 'លុបកំណត់ត្រានេះ?' : 'Delete this sales record?';
  if (!window.confirm(confirmMsg)) return;

  try {
    await api.deleteTaxRecord(selectedPeriodId.value, 'sales', row.id);
    await loadPeriodData();
    if (String(salesJournalRef.value?.editingId) === String(row.id)) salesJournalRef.value?.resetForm();
    success.value = isKhmer.value ? 'បានលុបកំណត់ត្រាលក់។' : 'Sales entry deleted.';
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  }
}

function editRecord(row) {
  editingId.value = row.id;
  Object.assign(recordForm, defaultRecord(recordKind.value), row);

  if (row.vat_rate !== undefined) {
    recordForm.vat_rate = Number((Number(row.vat_rate) * 100).toFixed(2));
  }
  recordForm.tax_rate = row.tax_rate == null ? 0 : Number((Number(row.tax_rate) * 100).toFixed(2));
  recordForm.tos_amount_khr = calculateSalaryTos(recordForm.basic_salary_khr, recordForm.tax_rate);
  recordForm.bonus_khr = Number(row.bonus_khr) || 0;
  recordForm.is_resident = [true, 1, '1'].includes(row.is_resident);

  if (row.invoice_date) {
    recordForm.invoice_date = String(row.invoice_date).slice(0, 10);
  }
}

async function removeRecord(row) {
  const confirmMsg = isKhmer.value ? 'លុបកំណត់ត្រានេះ?' : 'Delete this tax record?';
  if (!window.confirm(confirmMsg)) return;

  try {
    await api.deleteTaxRecord(selectedPeriodId.value, recordKind.value, row.id);
    await loadPeriodData();
    if (String(editingId.value) === String(row.id)) resetForm();
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  }
}

function printDeclaration() {
  activeTab.value = 'summary';
  window.setTimeout(() => window.print(), 100);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onMounted(async () => {
  loading.value = true;
  try {
    await loadPeriods();
  } catch (err) {
    error.value = err?.response?.data?.message || err.message;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
/* Base & Workspace */
.tax-workspace {
  color: #202a35;
}

.eyebrow {
  color: #53748c;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

/* Panels */
.period-panel,
.entry-panel,
.journal-panel,
.return-panel {
  background: #fff;
  border: 1px solid #d9e0e4;
  border-radius: 6px;
}

.period-heading,
.section-heading {
  padding: 1rem 1.15rem;
  border-bottom: 1px solid #e4e8eb;
}

.period-mark {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  color: #146f73;
  background: #e8f3f2;
  border-radius: 5px;
}

.period-select {
  min-width: 210px;
}

.period-fields {
  display: grid;
  grid-template-columns: repeat(5, minmax(145px, 1fr));
  gap: 0.85rem;
  padding: 1rem 1.15rem;
}

.period-save {
  grid-column: span 1;
}

/* Forms */
.entry-form {
  padding: 1rem 1.15rem;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: 0.85rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.form-field > span {
  color: #5d6872;
  font-size: 0.76rem;
  font-weight: 650;
}

.form-field .form-control,
.form-field .form-select {
  min-height: 38px;
  border-color: #d3dbe0;
  border-radius: 4px;
}

.wide-field {
  grid-column: span 2;
}

.checkbox-field {
  align-items: flex-start;
}

.checkbox-field .form-check-input {
  width: 1.15rem;
  height: 1.15rem;
  margin: 0.35rem 0 0;
}

.calculation-preview {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.9rem;
  padding: 0.65rem 0.8rem;
  color: #15585a;
  background: #eef6f4;
  border-left: 3px solid #287e79;
  font-size: 0.85rem;
}

.form-actions {
  margin-top: 1rem;
}

/* Status Badges */
.status-badge {
  text-transform: capitalize;
}

.status-draft {
  color: #725500;
  background: #fff2c2;
}

.status-filed {
  color: #155b45;
  background: #d9f0e5;
}

.status-locked {
  color: #34495e;
  background: #e4e9ed;
}

/* Tabs */
.tax-tabs {
  flex-wrap: nowrap;
  overflow-x: auto;
  border-color: #d6dde1;
  scrollbar-width: thin;
}

.tax-tabs .nav-link {
  flex: 0 0 auto;
  color: #52606b;
  border-radius: 5px 5px 0 0;
  font-size: 0.9rem;
}

.tax-tabs .nav-link.active {
  color: #125f63;
  border-color: #d6dde1 #d6dde1 #fff;
  font-weight: 700;
}

/* Tables */
.journal-table,
.return-table {
  min-width: 760px;
}

.journal-table thead th,
.return-table thead th {
  color: #52606b;
  background: #f4f6f7;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.journal-table td,
.return-table td {
  font-size: 0.86rem;
}

.purchase-record-table {
  min-width: 1100px;
}

.purchase-record-table thead th {
  white-space: nowrap;
}

.purchase-record-table .purchase-amount-cell {
  min-width: 130px;
  white-space: nowrap;
  line-height: 1.35;
}

.purchase-record-table tfoot th,
.purchase-record-table tfoot td {
  border-top: 2px solid #d9e0e4;
  background: #f5f7f8;
  font-weight: 750;
}

.salary-record-table {
  min-width: 1020px;
}

.salary-record-table thead th {
  white-space: nowrap;
}

.salary-record-table tfoot th {
  border-top: 2px solid #d9e0e4;
  background: #f5f7f8;
}

.return-panel {
  padding-bottom: 0.5rem;
}

.return-table-wrap {
  overflow-x: auto;
  padding: 0.25rem 1.15rem 0;
}

.return-table .box-number {
  width: 70px;
  color: #63717c;
  font-weight: 700;
}

.return-table .total-row {
  background: #f5f8f8;
  font-weight: 700;
}

.amount-cell {
  font-variant-numeric: tabular-nums;
  font-weight: 750;
}

.empty-row,
.loading-state,
.empty-state {
  padding: 2rem !important;
  color: #7b858e;
  text-align: center;
}

/* Printable Declaration Paper */
.declaration-paper {
  max-width: 860px;
  margin: 1rem auto;
  padding: 2rem clamp(1rem, 4vw, 3rem);
  color: #131b22;
  background: #fff;
  border: 1px solid #cbd2d7;
  box-shadow: 0 4px 18px rgba(30, 48, 58, 0.07);
}

.paper-company {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: 0.9rem;
}

.paper-company small {
  color: #49555e;
}

.company-symbol {
  display: grid;
  place-items: center;
  width: 48px;
  height: 42px;
  color: #fff;
  background: #167c87;
  border: 3px solid #e6bd36;
  font-size: 0.8rem;
  font-weight: 800;
}

.paper-rule {
  height: 2px;
  margin: 1rem 0 0.8rem;
  background: #17212a;
}

.paper-title {
  text-align: center;
}

.paper-title p {
  margin-bottom: 0.2rem;
  font-size: 0.82rem;
  font-weight: 700;
}

.paper-title h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
}

.paper-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 1rem 0 0.5rem;
  font-size: 0.78rem;
}

.paper-table {
  margin: 0;
  border: 1px solid #202a35;
}

.paper-table td {
  padding: 0.65rem 0.8rem;
  border-color: #c7cdd1;
}

.paper-table td:last-child {
  width: 35%;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.paper-total {
  border-top: 2px solid #17212a;
  font-weight: 800;
}

.paper-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  margin-top: 3.25rem;
  color: #53616b;
  font-size: 0.78rem;
  text-align: center;
}

.paper-signatures span {
  display: block;
  margin-bottom: 0.5rem;
  border-top: 1px solid #53616b;
}

.summary-footer {
  padding: 0.85rem 1.1rem;
  background: #f2f6f5;
  border-radius: 5px;
}

.payable-total {
  color: #153f43;
  font-size: 1.6rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.payable-total small {
  font-size: 0.8rem;
}

/* Responsive Media Queries */
@media (max-width: 1100px) {
  .period-fields {
    grid-template-columns: repeat(3, minmax(140px, 1fr));
  }
  .field-grid {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
}

@media (max-width: 600px) {
  .period-fields {
    grid-template-columns: repeat(2, minmax(125px, 1fr));
    padding: 0.85rem;
  }
  .field-grid {
    grid-template-columns: 1fr;
  }
  .wide-field {
    grid-column: auto;
  }
  .period-select {
    min-width: 180px;
  }
  .paper-signatures {
    gap: 1.25rem;
  }
}

/* Print Stylesheet */
@media print {
  :global(body) {
    background: #fff !important;
  }
  :global(body *) {
    visibility: hidden !important;
  }
  :global(#declaration-print),
  :global(#declaration-print *) {
    visibility: visible !important;
  }
  :global(#declaration-print) {
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
    border: 0;
    box-shadow: none;
  }
  .tax-workspace,
  .return-panel {
    border: 0;
  }
}
</style>