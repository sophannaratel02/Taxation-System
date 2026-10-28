<template>
  <section class="container-fluid p-4 page-canvas po-page">
    <!-- Header -->
    <div class="po-page-header d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <div class="eyebrow text-primary text-uppercase small fw-bold mb-1">
          {{ language.t('vendorPurchase') }}
        </div>
        <h1 class="h3 fw-bold mb-1">
          {{ language.isKhmer ? 'បញ្ជាទិញទំនិញ' : 'Purchase Orders' }}
        </h1>
        <p class="text-muted mb-0">
          {{ language.isKhmer 
            ? 'បង្កើត កែសម្រួល និងគ្រប់គ្រងការបញ្ជាទិញទំនិញពីអ្នកផ្គត់ផ្គង់។' 
            : 'Create, edit and manage multi-product purchase orders.' 
          }}
        </p>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <!-- <button class="btn btn-outline-primary" type="button" @click="openVendorModal">
          <i class="bi bi-person-plus me-2"></i>{{ language.isKhmer ? 'បន្ថែមអ្នកផ្គត់ផ្គង់' : 'Add Vendor' }}
        </button> -->
        <button class="btn btn-primary" type="button" @click="openCreate">
          <i class="bi bi-plus-lg me-2"></i>{{ language.isKhmer ? 'បង្កើតការបញ្ជាទិញថ្មី' : 'New Purchase Order' }}
        </button>
      </div>
    </div>

    <div v-if="vendorSuccess" class="alert alert-success alert-dismissible" role="status">
      {{ vendorSuccess }}
      <button type="button" class="btn-close" :aria-label="language.isKhmer ? 'បិទ' : 'Close'" @click="vendorSuccess = ''"></button>
    </div>

    <!-- Add Vendor Modal -->
    <Transition name="dialog-fade">
      <div v-if="vendorModalOpen" class="po-editor-backdrop vendor-editor-backdrop">
        <form
          class="vendor-editor-modal card border-0 shadow-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendor-editor-title"
          @submit.prevent="submitVendor"
        >
          <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <strong id="vendor-editor-title">
              {{ language.isKhmer ? 'ព័ត៌មានអ្នកផ្គត់ផ្គង់ថ្មី' : 'Add Vendor Information' }}
            </strong>
            <button class="btn-close" type="button" :aria-label="language.isKhmer ? 'បិទ' : 'Close'" :disabled="savingVendor" @click="closeVendorModal"></button>
          </div>
          <div class="card-body">
            <p class="small text-muted mb-3">
              {{ language.isKhmer ? 'សូមបញ្ចូលព័ត៌មានទំនាក់ទំនងអ្នកផ្គត់ផ្គង់។' : 'Enter the company and contact details for this supplier.' }}
            </p>
            <div v-if="vendorError" class="alert alert-danger py-2" role="alert">{{ vendorError }}</div>
            <div class="row g-3">
              <div class="col-12 col-md-6">
                <label for="vendor-company-name" class="form-label fw-semibold">{{ language.isKhmer ? 'ឈ្មោះក្រុមហ៊ុន' : 'Company name' }} <span class="text-danger">*</span></label>
                <input id="vendor-company-name" v-model.trim="vendorForm.name" class="form-control" type="text" maxlength="160" autocomplete="organization" required :disabled="savingVendor">
              </div>
              <div class="col-12 col-md-6">
                <label for="vendor-contact-name" class="form-label fw-semibold">{{ language.isKhmer ? 'ឈ្មោះអ្នកទំនាក់ទំនង' : 'Contact name' }} <span class="text-danger">*</span></label>
                <input id="vendor-contact-name" v-model.trim="vendorForm.contactName" class="form-control" type="text" maxlength="180" autocomplete="name" required :disabled="savingVendor">
              </div>
              <div class="col-12 col-md-6">
                <label for="vendor-tin" class="form-label fw-semibold">{{ language.isKhmer ? 'លេខអត្តសញ្ញាណកម្មសារពើពន្ធ (TIN)' : 'Tax Identification Number (TIN)' }} <span class="text-danger">*</span></label>
                <input id="vendor-tin" v-model.trim="vendorForm.vatTin" class="form-control" type="text" maxlength="50" required :disabled="savingVendor">
              </div>
              <div class="col-12 col-md-6">
                <label for="vendor-email" class="form-label fw-semibold">{{ language.isKhmer ? 'អ៊ីមែល' : 'Email' }} <span class="text-danger">*</span></label>
                <input id="vendor-email" v-model.trim="vendorForm.email" class="form-control" type="email" maxlength="255" autocomplete="email" required :disabled="savingVendor">
              </div>
              <div class="col-12">
                <label for="vendor-address" class="form-label fw-semibold">{{ language.isKhmer ? 'អាសយដ្ឋាន' : 'Address' }} <span class="text-danger">*</span></label>
                <textarea id="vendor-address" v-model.trim="vendorForm.address" class="form-control" rows="2" maxlength="5000" autocomplete="street-address" required :disabled="savingVendor"></textarea>
              </div>
              <div class="col-12 col-md-6">
                <label for="vendor-phone" class="form-label fw-semibold">{{ language.isKhmer ? 'ទូរស័ព្ទ' : 'Telephone' }} <span class="text-danger">*</span></label>
                <input id="vendor-phone" v-model.trim="vendorForm.phone" class="form-control" type="tel" maxlength="60" autocomplete="tel" required :disabled="savingVendor">
              </div>
              <div class="col-12 col-md-6">
                <label for="vendor-alternate-phone" class="form-label fw-semibold">{{ language.isKhmer ? 'ទូរស័ព្ទបន្ថែម' : 'Telephone (alternate)' }}</label>
                <input id="vendor-alternate-phone" v-model.trim="vendorForm.alternatePhone" class="form-control" type="tel" maxlength="60" :disabled="savingVendor">
              </div>
            </div>
          </div>
          <div class="card-footer bg-white d-flex justify-content-end gap-2 py-3">
            <button class="btn btn-light border" type="button" :disabled="savingVendor" @click="closeVendorModal">
              {{ language.t('cancel') }}
            </button>
            <button class="btn btn-primary" type="submit" :disabled="savingVendor">
              <span v-if="savingVendor" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              {{ savingVendor ? language.t('saving') : (language.isKhmer ? 'រក្សាទុកអ្នកផ្គត់ផ្គង់' : 'Save Vendor') }}
            </button>
          </div>
        </form>
      </div>
    </Transition>

    <!-- Purchase Order Form Modal -->
    <Transition name="dialog-fade">
      <div
        v-if="editorOpen"
        class="po-editor-backdrop"
      >
        <form class="po-editor-modal card border-0 shadow-lg" role="dialog" aria-modal="true" aria-labelledby="purchase-editor-title" @submit.prevent="saveOrder">
          <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <strong id="purchase-editor-title">
              {{ editingId
                ? (language.isKhmer ? `កែប្រែ #${editingId}` : `Edit #${editingId}`)
                : (language.isKhmer ? 'បង្កើតការបញ្ជាទិញថ្មី' : 'New Purchase Order')
              }}
            </strong>
            <button class="btn-close" type="button" :aria-label="language.isKhmer ? 'បិទ' : 'Close'" :disabled="saving" @click="closeEditor"></button>
          </div>

          <div class="card-body">
            <!-- Order Metadata -->
            <div class="row g-3 mb-4">
              <div class="col-md-5">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <label class="form-label fw-semibold mb-0">
                    {{ language.isKhmer ? 'អ្នកផ្គត់ផ្គង់' : 'Supplier / Vendor' }}
                  </label>
                  <button class="btn btn-link btn-sm p-0 text-decoration-none" type="button" @click="openVendorModal">
                    <i class="bi bi-plus-lg me-1"></i>{{ language.isKhmer ? 'បន្ថែមអ្នកផ្គត់ផ្គង់' : 'Add Vendor' }}
                  </button>
                </div>
                <select v-model="form.vendorId" class="form-select" required>
                  <option value="">
                    {{ language.isKhmer ? '-- សូមជ្រើសរើសអ្នកផ្គត់ផ្គង់ --' : '-- Select Supplier --' }}
                  </option>
                  <option v-for="vendor in tax.vendors" :key="vendor.id" :value="vendor.id">
                    {{ vendor.name }}
                  </option>
                </select>
              </div>

              <div class="col-md-3">
                <label class="form-label fw-semibold">
                  {{ language.isKhmer ? 'កាលបរិច្ឆេទបញ្ជាទិញ' : 'Order Date' }}
                </label>
                <input v-model="form.orderDate" type="date" class="form-control" required />
              </div>

              <div class="col-md-4">
                <label class="form-label fw-semibold">
                  {{ language.isKhmer ? 'កំណត់ចំណាំ' : 'Note / Remarks' }}
                </label>
                <input
                  v-model.trim="form.note"
                  type="text"
                  class="form-control"
                  :placeholder="language.isKhmer ? 'កំណត់ចំណាំបន្ថែម...' : 'Optional notes or instructions'"
                />
              </div>
            </div>

            <!-- Relevant Costs (Matching Excel Sheet) -->
            <div class="row g-3 mb-4">
              <div class="col-md-4">
                <label class="form-label fw-semibold">
                  {{ language.isKhmer ? 'ថ្លៃដឹកជញ្ជូន/ដោះស្រាយ (Handling)' : 'Handling & Transportation Cost' }}
                </label>
                <div class="input-group">
                  <span class="input-group-text">$</span>
                  <input v-model.number="form.handlingCost" type="number" min="0" step="0.01" class="form-control" />
                </div>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">
                  {{ language.isKhmer ? 'ថ្លៃឯកសារ (Documentation)' : 'Documentation Cost' }}
                </label>
                <div class="input-group">
                  <span class="input-group-text">$</span>
                  <input v-model.number="form.documentationCost" type="number" min="0" step="0.01" class="form-control" />
                </div>
              </div>
              <div class="col-md-4 d-flex align-items-end">
                <small class="text-muted">
                  {{ language.isKhmer
                    ? 'ថ្លៃ Handling និង Documentation ត្រូវបានបែងចែកតាមសមាមាត្រតម្លៃទំនិញសរុប (Merchandise Value Share)។'
                    : 'Handling and documentation costs are allocated by each item line’s share of total merchandise value.'
                  }}
                </small>
              </div>
            </div>

            <!-- Products Header Action -->
            <div class="d-flex justify-content-between align-items-center mb-2">
              <strong>{{ language.t('items') }}</strong>
              <button class="btn btn-outline-primary btn-sm" type="button" @click="addRow">
                <i class="bi bi-plus-lg me-1"></i>{{ language.isKhmer ? 'បន្ថែមទំនិញ' : 'Add Product' }}
              </button>
            </div>

            <!-- Line Item Entry Table -->
            <div class="table-responsive purchase-table">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th style="width: 45px;">#</th>
                    <th>{{ language.t('item') }}</th>
                    <th style="width: 110px;">{{ language.t('quantity') }}</th>
                    <th style="width: 140px;">{{ language.isKhmer ? 'ថ្លៃដើមទំនិញ' : 'Merchandise Cost' }}</th>
                    <th style="width: 150px;">{{ language.isKhmer ? 'កាលបរិច្ឆេទដឹកជញ្ជូន' : 'Delivery Date' }}</th>
                    <th style="width: 130px;" class="text-end">{{ language.t('amount') }}</th>
                    <th style="width: 160px;" class="text-end">{{ language.isKhmer ? 'ថ្លៃ Handling ក្នុងមួយឯកតា' : 'Unit Cost (Handling)' }}</th>
                    <th style="width: 140px;" class="text-end">{{ language.isKhmer ? 'ថ្លៃដើមឯកសារ/ឯកតា' : 'Unit Cost (Doc)' }}</th>
                    <th style="width: 150px;" class="text-end">{{ language.isKhmer ? 'ថ្លៃដើមលក់ (COGS)' : 'Cost of Goods Sold' }}</th>
                    <th style="width: 50px;"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in form.items" :key="item.key">
                    <td class="text-muted">{{ index + 1 }}</td>
                    <td>
                      <select
                        v-model="item.itemId"
                        class="form-select form-select-sm"
                        required
                        @change="setProductName(item)"
                      >
                        <option value="">
                          {{ language.isKhmer ? '-- ជ្រើសរើសពីកាតាឡុក --' : 'Select item catalog' }}
                        </option>
                        <option v-for="product in tax.items" :key="product.id" :value="product.id">
                          {{ getItemDisplayName(product) }}
                        </option>
                      </select>
                      <input
                        v-model.trim="item.productName"
                        class="form-control form-control-sm mt-1"
                        :placeholder="language.isKhmer ? 'ឈ្មោះទំនិញពីកាតាឡុកស្តុក' : 'Product name from inventory catalog'"
                        readonly
                        required
                      />
                    </td>
                    <td>
                      <input
                        v-model.number="item.qty"
                        type="number"
                        min="1"
                        step="1"
                        class="form-control form-control-sm"
                        :aria-label="`${language.isKhmer ? 'បរិមាណសម្រាប់ទំនិញ' : 'Quantity for item'} ${index + 1}`"
                        required
                      />
                    </td>
                    <td>
                      <div class="input-group input-group-sm">
                        <span class="input-group-text">$</span>
                        <input
                          v-model.number="item.unitPrice"
                          type="number"
                          min="0"
                          step="0.0001"
                          class="form-control"
                          :aria-label="`${language.isKhmer ? 'ថ្លៃដើមទំនិញ' : 'Merchandise cost for item'} ${index + 1}`"
                          required
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        v-model="item.deliveryDate"
                        type="date"
                        class="form-control form-control-sm"
                        :aria-label="`${language.isKhmer ? 'កាលបរិច្ឆេទដឹកជញ្ជូនសម្រាប់ទំនិញ' : 'Delivery date for item'} ${index + 1}`"
                        required
                      />
                    </td>
                    <td class="text-end fw-semibold">
                      ${{ formatCurrency(lineAmount(item)) }}
                    </td>
                    <td class="text-end text-muted font-monospace">
                      ${{ formatLandedCost(unitHandlingCost(item)) }}
                    </td>
                    <td class="text-end text-muted font-monospace">
                      ${{ formatLandedCost(unitDocumentationCost(item)) }}
                    </td>
                    <td class="text-end fw-semibold text-primary font-monospace">
                      ${{ formatLandedCost(costOfGoodsSold(item)) }}
                    </td>
                    <td class="text-center">
                      <button
                        class="btn btn-sm btn-outline-danger"
                        type="button"
                        :title="language.isKhmer ? 'លុបចេញ' : 'Remove item'"
                        :disabled="form.items.length === 1"
                        @click="removeRow(index)"
                      >
                        <i class="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tfoot class="table-light">
                  <tr>
                    <td colspan="5" class="text-end fw-semibold">
                      {{ language.isKhmer ? 'តម្លៃទំនិញសរុប (Merchandise Subtotal)' : 'Merchandise Subtotal' }}
                    </td>
                    <td class="text-end fw-semibold">${{ formatCurrency(totals.subtotal) }}</td>
                    <td colspan="2"></td>
                    <td class="text-end fw-bold text-primary font-monospace">${{ formatLandedCost(totals.totalCogs) }}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colspan="5" class="text-end fw-semibold">
                      {{ language.isKhmer ? 'ថ្លៃ Handling សរុប' : 'Total Handling' }}
                    </td>
                    <td class="text-end fw-semibold">${{ formatCurrency(totals.handlingCost) }}</td>
                    <td colspan="4"></td>
                  </tr>
                  <tr>
                    <td colspan="5" class="text-end fw-semibold">
                      {{ language.isKhmer ? 'ថ្លៃ Documentation សរុប' : 'Total Documentation' }}
                    </td>
                    <td class="text-end fw-semibold">${{ formatCurrency(totals.documentationCost) }}</td>
                    <td colspan="4"></td>
                  </tr>
                  <tr>
                    <td colspan="5" class="text-end fw-bold">
                      {{ language.t('grandTotal') }}
                    </td>
                    <td class="text-end fw-bold text-primary fs-5">
                      ${{ formatCurrency(totals.grandTotal) }}
                    </td>
                    <td colspan="4"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <!-- Validation Prompt -->
            <div v-if="validationMessage" class="alert alert-warning py-2 mt-3 mb-0" role="alert">
              <i class="bi bi-exclamation-circle me-1"></i>
              {{ validationMessage }}
            </div>

            <!-- Summary Breakdown -->
            <div class="purchase-tax-summary">
              <div>
                <span>{{ language.isKhmer ? 'តម្លៃទំនិញសរុប' : 'Merchandise Subtotal' }}</span>
                <strong>${{ formatCurrency(totals.subtotal) }}</strong>
              </div>
              <div>
                <span>{{ language.isKhmer ? 'ថ្លៃដោះស្រាយ/ដឹក' : 'Handling & Transport' }}</span>
                <strong>${{ formatCurrency(totals.handlingCost) }}</strong>
              </div>
              <div>
                <span>{{ language.isKhmer ? 'ថ្លៃឯកសារ' : 'Documentation' }}</span>
                <strong>${{ formatCurrency(totals.documentationCost) }}</strong>
              </div>
              <div v-if="vatRate > 0">
                <span>VAT ({{ vatRate }}%)</span>
                <strong>${{ formatCurrency(totals.taxAmount) }}</strong>
              </div>
              <div class="grand">
                <span>{{ language.t('grandTotal') }}</span>
                <strong>${{ formatCurrency(totals.grandTotal) }}</strong>
              </div>
            </div>
          </div>

          <div class="card-footer bg-white d-flex justify-content-end gap-2 py-3">
            <button class="btn btn-light border" type="button" :disabled="saving" @click="closeEditor">
              {{ language.t('cancel') }}
            </button>
            <button class="btn btn-success" type="submit" :disabled="saving">
              <span
                v-if="saving"
                class="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true"
              ></span>
              {{ saving ? language.t('saving') : language.t('save') }}
            </button>
          </div>
        </form>
      </div>
    </Transition>

    <!-- Orders Master Listing -->
    <div class="card purchase-records-card border-0 shadow-sm">
      <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2 py-3 border-bottom">
        <div>
          <strong class="d-block mb-1">{{ language.t('purchaseOrders') }}</strong>
          <small class="text-muted">{{ language.isKhmer ? 'ប្រវត្តិ និងស្ថានភាពការបញ្ជាទិញ' : 'Order history, costs and receiving status' }}</small>
        </div>
        <span class="purchase-record-count">
          <i class="bi bi-receipt-cutoff me-1" aria-hidden="true"></i>
          {{ tax.purchaseOrders?.length || 0 }}
          {{ language.isKhmer ? 'ការបញ្ជាទិញ' : 'orders' }}
        </span>
      </div>
      <div class="table-responsive purchase-records-scroll">
        <table class="table purchase-records-table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>{{ language.isKhmer ? 'លេខបញ្ជាទិញ' : 'Order' }}</th>
              <th>{{ language.isKhmer ? 'កាលបរិច្ឆេទបញ្ជាទិញ' : 'Order Date' }}</th>
              <th>{{ language.isKhmer ? 'អ្នកផ្គត់ផ្គង់' : 'Supplier' }}</th>
              <th class="text-center">{{ language.t('items') }}</th>
              <th class="text-end">{{ language.isKhmer ? 'តម្លៃទំនិញ' : 'Merchandise' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ថ្លៃ Handling' : 'Handling' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ថ្លៃឯកសារ' : 'Documentation' }}</th>
              <th class="text-end">{{ language.t('grandTotal') }}</th>
              <th>{{ language.t('status') }}</th>
              <th class="text-end pe-3">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in tax.purchaseOrders" :key="order.id">
              <td>
                <button
                  class="purchase-order-number purchase-order-number-button"
                  type="button"
                  :aria-label="`${language.isKhmer ? 'មើលព័ត៌មានលម្អិតការបញ្ជាទិញ' : 'View purchase order details'} #${order.id}`"
                  @click="openPurchaseDetails(order)"
                >
                  #{{ order.id }}
                </button>
              </td>
              <td class="text-nowrap">{{ formatOrderDate(order.orderDate || order.order_date) }}</td>
              <td class="purchase-supplier-cell">{{ order.vendor || order.vendorName || '—' }}</td>
              <td class="text-center">
                <span class="purchase-item-count">{{ order.itemCount || order.items?.length || 0 }}</span>
              </td>
              <td class="text-end font-monospace">${{ formatCurrency(order.subtotal) }}</td>
              <td class="text-end font-monospace">${{ formatCurrency(order.handlingCost ?? order.handling_cost) }}</td>
              <td class="text-end font-monospace">${{ formatCurrency(order.documentationCost ?? order.documentation_cost) }}</td>
              <td class="text-end fw-bold text-dark font-monospace">${{ formatCurrency(order.total ?? order.grandTotal) }}</td>
              <td>
                <span class="badge purchase-status-badge" :class="purchaseStatusClass(order.status)">
                  <i class="bi me-1" :class="purchaseStatusIcon(order.status)" aria-hidden="true"></i>
                  {{ purchaseStatusLabel(order.status) }}
                </span>
              </td>
              <td class="text-end text-nowrap pe-3">
                <div class="btn-group btn-group-sm" role="group" :aria-label="`${language.isKhmer ? 'សកម្មភាពសម្រាប់ការបញ្ជាទិញ' : 'Actions for purchase order'} ${order.id}`">
                  <button
                    v-if="(order.status || 'Pending') === 'Pending'"
                    class="btn btn-outline-success"
                    type="button"
                    :title="language.isKhmer ? 'ទទួលទំនិញ' : 'Receive order'"
                    @click="requestOrderAction('receive', order)"
                  >
                    <i class="bi bi-box-seam"></i>
                  </button>
                  <button
                    v-if="(order.status || 'Pending') === 'Pending' && Number(order.paidAmount || 0) === 0"
                    class="btn btn-outline-primary"
                    type="button"
                    :title="language.t('edit')"
                    @click="openEdit(order)"
                  >
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button
                    v-if="(order.status || 'Pending') === 'Pending' && Number(order.paidAmount || 0) === 0"
                    class="btn btn-outline-danger"
                    type="button"
                    :title="language.t('delete')"
                    @click="requestOrderAction('delete', order)"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!tax.purchaseOrders?.length">
              <td colspan="10" class="text-center text-muted py-5">
                <i class="bi bi-receipt fs-3 d-block mb-2 text-secondary"></i>
                <strong class="d-block text-dark mb-1">{{ language.t('noRecords') }}</strong>
                <span>{{ language.isKhmer ? 'ចុច “បង្កើតការបញ្ជាទិញថ្មី” ដើម្បីបន្ថែមការបញ្ជាទិញ។' : 'Create a new purchase order to get started.' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Purchase Order Details -->
    <Transition name="dialog-fade">
      <div
        v-if="detailOpen"
        class="po-detail-backdrop"
        @click.self="closePurchaseDetails"
        @keydown.esc.window="closePurchaseDetails"
      >
        <section
          class="po-detail-modal card border-0 shadow-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-detail-title"
          tabindex="-1"
        >
          <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <div>
              <strong id="purchase-detail-title" class="d-block">
                {{ language.isKhmer ? 'ព័ត៌មានលម្អិតការបញ្ជាទិញ' : 'Purchase Order Details' }}
                <span v-if="purchaseDetail">#{{ purchaseDetail.orderNo || purchaseDetail.order_no || purchaseDetail.id }}</span>
              </strong>
              <small class="text-muted">
                {{ purchaseDetail?.vendor_name || purchaseDetail?.vendorName || purchaseDetail?.vendor || '—' }}
              </small>
            </div>
            <button class="btn-close" type="button" :aria-label="language.isKhmer ? 'បិទ' : 'Close'" :disabled="submittingPurchaseReturn" @click="closePurchaseDetails"></button>
          </div>

          <div class="card-body">
            <div v-if="detailLoading" class="text-center text-muted py-5" role="status">
              <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              {{ language.isKhmer ? 'កំពុងផ្ទុកព័ត៌មាន...' : 'Loading purchase details...' }}
            </div>
            <div v-else-if="detailError" class="alert alert-danger mb-0" role="alert">{{ detailError }}</div>
            <template v-else-if="purchaseDetail">
              <div class="po-detail-facts mb-4">
                <div>
                  <span>{{ language.isKhmer ? 'ស្ថានភាព' : 'Status' }}</span>
                  <strong>{{ purchaseStatusLabel(purchaseDetail.status) }}</strong>
                </div>
                <div>
                  <span>{{ language.isKhmer ? 'កាលបរិច្ឆេទបញ្ជាទិញ' : 'Order date' }}</span>
                  <strong>{{ formatOrderDate(purchaseDetail.orderDate || purchaseDetail.order_date_display || purchaseDetail.order_date) }}</strong>
                </div>
                <div v-if="purchaseDetail.status === 'Received'">
                  <span>{{ language.isKhmer ? 'សាខាទទួល' : 'Receiving branch' }}</span>
                  <strong>{{ purchaseDetail.receivedBranch || purchaseDetail.received_branch || '—' }}</strong>
                </div>
                <div>
                  <span>{{ language.isKhmer ? 'អ្នកផ្គត់ផ្គង់' : 'Supplier' }}</span>
                  <strong>{{ purchaseDetail.vendor_name || purchaseDetail.vendorName || purchaseDetail.vendor || '—' }}</strong>
                </div>
                <div>
                  <span>{{ language.isKhmer ? 'អ្នកបង្កើត' : 'Created by' }}</span>
                  <strong>{{ purchaseDetail.created_by_name || purchaseDetail.createdByName || purchaseDetail.created_by || '—' }}</strong>
                </div>
                <div>
                  <span>{{ language.isKhmer ? 'កាលបរិច្ឆេទរំពឹង' : 'Expected date' }}</span>
                  <strong>{{ formatOrderDate(purchaseDetail.expectedDate || purchaseDetail.expected_date_display || purchaseDetail.expected_date) }}</strong>
                </div>
                <div>
                  <span>{{ language.isKhmer ? 'បានកត់ត្រា' : 'Created at' }}</span>
                  <strong>{{ formatDetailTimestamp(purchaseDetail.created_at) }}</strong>
                </div>
              </div>

              <div class="table-responsive mb-4">
                <table class="table table-sm table-bordered align-middle mb-0">
                  <thead class="table-light">
                    <tr>
                      <th>{{ language.t('item') }}</th>
                      <th class="text-end">{{ language.t('quantity') }}</th>
                      <th class="text-end">{{ language.isKhmer ? 'ថ្លៃទំនិញ/ឯកតា' : 'Merchandise / unit' }}</th>
                      <th class="text-end">{{ language.isKhmer ? 'សរុបទំនិញ' : 'Merchandise total' }}</th>
                      <th class="text-end">{{ language.isKhmer ? 'ថ្លៃដឹកជញ្ជូន' : 'Delivery cost' }}</th>
                      <th>{{ language.isKhmer ? 'ថ្ងៃដឹកជញ្ជូន' : 'Delivery date' }}</th>
                      <th class="text-end">{{ language.isKhmer ? 'Handling/ឯកតា' : 'Handling / unit' }}</th>
                      <th class="text-end">{{ language.isKhmer ? 'ឯកសារ/ឯកតា' : 'Documentation / unit' }}</th>
                      <th class="text-end">{{ language.isKhmer ? 'ថ្លៃដើមសរុប/ឯកតា' : 'Landed cost / unit' }}</th>
                      <th class="text-end">{{ language.isKhmer ? 'សរុបជួរ' : 'Line total' }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, index) in purchaseDetail.items" :key="item.id || `${item.itemId}-${index}`">
                      <td>
                        <strong class="d-block">{{ item.productName || item.product_name || '—' }}</strong>
                        <small class="text-muted">{{ language.isKhmer ? 'លេខសម្គាល់' : 'Item ID' }}: {{ item.itemId || item.item_id || '—' }}</small>
                      </td>
                      <td class="text-end">{{ formatQuantity(item.qty) }}</td>
                      <td class="text-end font-monospace">${{ formatCurrency(item.merchandiseCost ?? item.merchandise_cost ?? item.unitPrice ?? item.unit_price) }}</td>
                      <td class="text-end font-monospace">${{ formatCurrency(toNumber(item.qty) * toNumber(item.merchandiseCost ?? item.merchandise_cost ?? item.unitPrice ?? item.unit_price)) }}</td>
                      <td class="text-end font-monospace">${{ formatCurrency(item.deliveryPrice ?? item.delivery_price) }}</td>
                      <td class="text-nowrap">{{ formatOrderDate(item.deliveryDate || item.delivery_date_display || item.delivery_date) }}</td>
                      <td class="text-end font-monospace">${{ formatLandedCost(detailUnitCost(item, 'handling')) }}</td>
                      <td class="text-end font-monospace">${{ formatLandedCost(detailUnitCost(item, 'documentation')) }}</td>
                      <td class="text-end font-monospace">
                        ${{ formatLandedCost(detailEffectiveUnitCost(item)) }}
                      </td>
                      <td class="text-end fw-semibold font-monospace">${{ formatCurrency(item.itemTotal ?? item.item_total) }}</td>
                    </tr>
                    <tr v-if="!purchaseDetail.items.length">
                      <td colspan="10" class="text-center text-muted py-3">{{ language.t('noRecords') }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <section v-if="purchaseDetail.status === 'Received'" class="card border-0 bg-light mb-4">
                <div class="card-body">
                  <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                    <div>
                      <h3 class="h6 fw-bold mb-1">{{ language.isKhmer ? 'ត្រឡប់ទំនិញទៅអ្នកផ្គត់ផ្គង់' : 'Return items to supplier' }}</h3>
                      <p class="small text-muted mb-0">{{ language.isKhmer ? 'ចំនួនស្តុកនឹងត្រូវដកចេញ និងកត់ត្រាមូលហេតុ។ មិនប្តូរគណនីត្រូវបង់អ្នកផ្គត់ផ្គង់ទេ។' : 'This removes available stock and records the reason. It does not change Accounts Payable.' }}</p>
                    </div>
                    <span v-if="purchaseDetail.returns?.length" class="badge text-bg-secondary">{{ purchaseDetail.returns.length }} {{ language.isKhmer ? 'ការត្រឡប់' : 'previous return(s)' }}</span>
                  </div>

                  <div v-if="purchaseReturnError" class="alert alert-danger py-2" role="alert">{{ purchaseReturnError }}</div>
                  <div v-if="purchaseReturnSuccess" class="alert alert-success py-2" role="status">{{ purchaseReturnSuccess }}</div>

                  <form @submit.prevent="submitPurchaseReturn">
                    <div v-if="purchaseReturnLines.length" class="table-responsive mb-3">
                      <table class="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>{{ language.t('item') }}</th>
                            <th class="text-end">{{ language.isKhmer ? 'បានទទួល' : 'Received' }}</th>
                            <th class="text-end">{{ language.isKhmer ? 'បានត្រឡប់' : 'Returned' }}</th>
                            <th class="text-end">{{ language.isKhmer ? 'នៅសល់តាមបញ្ជាទិញ' : 'Remaining on order' }}</th>
                            <th class="text-end">{{ language.isKhmer ? 'មានក្នុងស្តុក' : 'Available stock' }}</th>
                            <th class="purchase-return-quantity">{{ language.isKhmer ? 'ចំនួនត្រឡប់' : 'Return quantity' }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="item in purchaseReturnLines" :key="item.id">
                            <td>{{ item.productName || item.product_name || '—' }}</td>
                            <td class="text-end">{{ formatQuantity(item.qty) }}</td>
                            <td class="text-end">{{ formatQuantity(item.returnedQuantity) }}</td>
                            <td class="text-end">{{ formatQuantity(item.returnableQuantity) }}</td>
                            <td class="text-end">{{ formatQuantity(item.availableStock) }}</td>
                            <td>
                              <input
                                v-model.number="purchaseReturnQuantities[item.id]"
                                class="form-control form-control-sm"
                                type="number"
                                min="0"
                                :max="Math.min(Number(item.returnableQuantity), Number(item.availableStock))"
                                step="1"
                                :aria-label="`${language.isKhmer ? 'ចំនួនត្រឡប់' : 'Return quantity'} ${item.productName}`"
                                :disabled="submittingPurchaseReturn"
                              >
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p v-else class="text-muted small mb-3">{{ language.isKhmer ? 'មិនមានបរិមាណស្តុកដែលអាចត្រឡប់បានទេ។' : 'There is no remaining received stock quantity to return.' }}</p>

                    <div class="row g-3 align-items-end">
                      <div class="col-12 col-lg-8">
                        <label for="purchase-return-reason" class="form-label">{{ language.isKhmer ? 'មូលហេតុត្រឡប់' : 'Reason for return' }} <span class="text-danger">*</span></label>
                        <textarea
                          id="purchase-return-reason"
                          v-model="purchaseReturnReason"
                          class="form-control"
                          rows="2"
                          maxlength="500"
                          required
                          :disabled="submittingPurchaseReturn || !purchaseReturnLines.length"
                        ></textarea>
                      </div>
                      <div class="col-12 col-lg-4 d-flex justify-content-lg-end">
                        <button
                          type="submit"
                          class="btn btn-warning"
                          :disabled="submittingPurchaseReturn || !purchaseReturnLines.length || !hasPurchaseReturnQuantity"
                        >
                          <span v-if="submittingPurchaseReturn" class="spinner-border spinner-border-sm me-2" role="status"></span>
                          <i v-else class="bi bi-box-arrow-up me-2"></i>
                          {{ submittingPurchaseReturn ? (language.isKhmer ? 'កំពុងរក្សាទុក...' : 'Processing...') : (language.isKhmer ? 'បញ្ជាក់ការត្រឡប់' : 'Return to supplier') }}
                        </button>
                      </div>
                    </div>
                  </form>

                  <div v-if="purchaseDetail.returns?.length" class="border-top mt-4 pt-3">
                    <h4 class="h6 mb-3">{{ language.isKhmer ? 'ប្រវត្តិត្រឡប់' : 'Return history' }}</h4>
                    <div v-for="record in purchaseDetail.returns" :key="record.returnNo" class="purchase-return-history border rounded p-3 mb-2">
                      <div class="d-flex flex-wrap justify-content-between gap-2 mb-1">
                        <strong>{{ record.returnNo }}</strong>
                        <span class="small text-muted">{{ formatDetailTimestamp(record.createdAt) }}<span v-if="record.createdBy"> · {{ record.createdBy }}</span></span>
                      </div>
                      <div>{{ record.reason }}</div>
                      <div class="small text-muted mt-1">{{ record.items.map((returned) => `${purchaseLineName(returned.purchaseOrderItemId)}: ${formatQuantity(returned.quantity)}`).join(', ') }}</div>
                    </div>
                  </div>
                </div>
              </section>

              <div class="row g-3">
                <div class="col-lg-6">
                  <h3 class="h6 fw-bold">{{ language.isKhmer ? 'សេចក្តីសង្ខេបថ្លៃដើម' : 'Cost Summary' }}</h3>
                  <div class="po-detail-totals">
                    <div><span>{{ language.isKhmer ? 'តម្លៃទំនិញ' : 'Merchandise subtotal' }}</span><strong>${{ formatCurrency(purchaseDetail.subtotal) }}</strong></div>
                    <div><span>{{ language.isKhmer ? 'ថ្លៃដឹកជញ្ជូន' : 'Delivery total' }}</span><strong>${{ formatCurrency(purchaseDetail.deliveryTotal ?? purchaseDetail.delivery_total) }}</strong></div>
                    <div><span>{{ language.isKhmer ? 'Handling និងដឹកជញ្ជូន' : 'Handling & transportation' }}</span><strong>${{ formatCurrency(purchaseDetail.handlingCost ?? purchaseDetail.handling_cost) }}</strong></div>
                    <div><span>{{ language.isKhmer ? 'ថ្លៃឯកសារ' : 'Documentation cost' }}</span><strong>${{ formatCurrency(purchaseDetail.documentationCost ?? purchaseDetail.documentation_cost) }}</strong></div>
                    <div><span>VAT ({{ formatCurrency(purchaseDetail.taxRate ?? purchaseDetail.tax_rate) }}%)</span><strong>${{ formatCurrency(purchaseDetail.taxAmount ?? purchaseDetail.tax_amount) }}</strong></div>
                    <div class="po-detail-total"><span>{{ language.t('grandTotal') }}</span><strong>${{ formatCurrency(purchaseDetail.grandTotal ?? purchaseDetail.grand_total ?? purchaseDetail.total) }}</strong></div>
                    <div><span>{{ language.isKhmer ? 'បានបង់' : 'Paid' }}</span><strong>${{ formatCurrency(purchaseDetail.paidAmount ?? purchaseDetail.paid_amount) }}</strong></div>
                    <div><span>{{ language.isKhmer ? 'នៅសល់' : 'Balance due' }}</span><strong>${{ formatCurrency(purchaseDetail.balance) }}</strong></div>
                  </div>
                </div>
                <div class="col-lg-6">
                  <h3 class="h6 fw-bold">{{ language.isKhmer ? 'ប្រវត្តិការទូទាត់' : 'Payment History' }}</h3>
                  <div v-if="purchaseDetail.payments.length" class="table-responsive">
                    <table class="table table-sm table-bordered align-middle mb-0">
                      <thead class="table-light">
                        <tr>
                          <th>{{ language.isKhmer ? 'កាលបរិច្ឆេទ' : 'Date' }}</th>
                          <th>{{ language.isKhmer ? 'វិធីសាស្ត្រ' : 'Method' }}</th>
                          <th>{{ language.isKhmer ? 'យោង' : 'Reference' }}</th>
                          <th>{{ language.isKhmer ? 'កត់ត្រាដោយ' : 'Recorded by' }}</th>
                          <th class="text-end">{{ language.isKhmer ? 'ចំនួនទឹកប្រាក់' : 'Amount' }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="payment in purchaseDetail.payments" :key="payment.id">
                          <td>{{ formatDetailTimestamp(payment.paidAt || payment.created_at) }}</td>
                          <td>{{ formatPaymentMethod(payment.paymentMethod || payment.payment_method) }}</td>
                          <td>{{ payment.reference || '—' }}</td>
                          <td>{{ payment.paidBy || payment.paid_by_name || '—' }}</td>
                          <td class="text-end font-monospace">${{ formatCurrency(payment.amount) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p v-else class="text-muted small">{{ language.isKhmer ? 'មិនទាន់មានការទូទាត់ទេ។' : 'No payments recorded for this order.' }}</p>
                </div>
              </div>

              <div v-if="purchaseDetail.note" class="alert alert-light border mt-3 mb-0">
                <strong>{{ language.isKhmer ? 'កំណត់ចំណាំ' : 'Note' }}:</strong>
                {{ purchaseDetail.note }}
              </div>
            </template>
          </div>

          <div class="card-footer bg-white d-flex justify-content-end py-3">
            <button class="btn btn-secondary" type="button" :disabled="submittingPurchaseReturn" @click="closePurchaseDetails">
              {{ language.isKhmer ? 'បិទ' : 'Close' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>

    <!-- Confirmation Dialog -->
    <Transition name="dialog-fade">
      <div
        v-if="dialog"
        class="po-dialog-backdrop"
        @click.self="closeDialog"
        @keydown.esc.window="closeDialog"
      >
        <section
          class="po-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-dialog-title"
          tabindex="-1"
        >
          <div class="po-dialog-icon" :class="`tone-${dialog.tone}`">
            <i class="bi" :class="dialog.icon" aria-hidden="true"></i>
          </div>
          <h2 id="purchase-dialog-title" class="po-dialog-title">{{ dialog.title }}</h2>
          <p class="po-dialog-message">{{ dialog.message }}</p>

          <div v-if="dialog.order" class="po-dialog-summary">
            <span>{{ language.isKhmer ? 'លេខបញ្ជាទិញ' : 'Purchase order' }}</span>
            <strong>#{{ dialog.order.id }}</strong>
            <span>{{ language.isKhmer ? 'អ្នកផ្គត់ផ្គង់' : 'Supplier' }}</span>
            <strong>{{ dialog.order.vendor || dialog.order.vendorName }}</strong>
          </div>

          <div class="po-dialog-actions">
            <button
              v-if="dialog.mode === 'confirm'"
              class="btn btn-light border"
              type="button"
              :disabled="dialogBusy"
              @click="closeDialog"
            >
              {{ language.t('cancel') }}
            </button>
            <button
              class="btn"
              :class="dialog.action === 'delete' ? 'btn-danger' : dialog.tone === 'success' ? 'btn-success' : 'btn-primary'"
              type="button"
              :disabled="dialogBusy"
              @click="dialog.mode === 'confirm' ? runDialogAction() : closeDialog()"
            >
              <span v-if="dialogBusy" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              <i v-else-if="dialog.mode === 'confirm'" class="bi me-2" :class="dialog.action === 'delete' ? 'bi-trash3' : 'bi-box-seam'" aria-hidden="true"></i>
              {{ dialog.mode === 'confirm' ? dialog.confirmLabel : (language.isKhmer ? 'បិទ' : 'Close') }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '@/services/api';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();

const editorOpen = ref(false);
const editingId = ref('');
const saving = ref(false);
const vendorModalOpen = ref(false);
const savingVendor = ref(false);
const vendorError = ref('');
const vendorSuccess = ref('');
const dialog = ref(null);
const dialogBusy = ref(false);
const validationMessage = ref('');
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const purchaseDetail = ref(null);
const purchaseReturnQuantities = ref({});
const purchaseReturnReason = ref('');
const purchaseReturnError = ref('');
const purchaseReturnSuccess = ref('');
const submittingPurchaseReturn = ref(false);
let detailRequestSequence = 0;
let rowKey = 0;

const vatRate = computed(() => {
  const configuredRate = Number(tax.settings?.vatRate);
  return Number.isFinite(configuredRate) ? configuredRate : 0;
});
const purchaseReturnLines = computed(() => (purchaseDetail.value?.items || [])
  .filter((item) => Number(item.returnableQuantity || 0) > 0 && Number(item.availableStock || 0) > 0));
const hasPurchaseReturnQuantity = computed(() => isValidPurchaseReturnSelection());

function getItemDisplayName(product) {
  if (language.isKhmer && (product.nameKh || product.nameKm)) {
    return product.nameKh || product.nameKm;
  }
  return product.nameEn || product.name || 'Item';
}

function createBlankRow() {
  return {
    key: `po-row-${rowKey++}`,
    itemId: '',
    productName: '',
    qty: 1,
    unitPrice: 0,
    deliveryDate: new Date().toISOString().slice(0, 10),
    deliveryPrice: 0
  };
}

const form = reactive({
  vendorId: '',
  orderDate: new Date().toISOString().slice(0, 10),
  note: '',
  handlingCost: 0,
  documentationCost: 0,
  items: [createBlankRow()]
});

const vendorForm = reactive({
  name: '',
  contactName: '',
  vatTin: '',
  address: '',
  phone: '',
  alternatePhone: '',
  email: '',
});

function openVendorModal() {
  Object.assign(vendorForm, {
    name: '',
    contactName: '',
    vatTin: '',
    address: '',
    phone: '',
    alternatePhone: '',
    email: '',
  });
  vendorError.value = '';
  vendorSuccess.value = '';
  vendorModalOpen.value = true;
}

function closeVendorModal() {
  if (savingVendor.value) return;
  vendorModalOpen.value = false;
}

async function submitVendor() {
  vendorError.value = '';
  savingVendor.value = true;
  try {
    const vendor = await tax.saveVendor({ ...vendorForm });
    if (editorOpen.value) form.vendorId = vendor.id;
    vendorModalOpen.value = false;
    vendorSuccess.value = language.isKhmer
      ? `បានបន្ថែមអ្នកផ្គត់ផ្គង់ "${vendor.name}" ដោយជោគជ័យ។`
      : `Vendor "${vendor.name}" was added successfully.`;
  } catch (error) {
    vendorError.value = error?.message || (language.isKhmer ? 'មិនអាចរក្សាទុកអ្នកផ្គត់ផ្គង់បានទេ។' : 'Could not save vendor.');
  } finally {
    savingVendor.value = false;
  }
}

function formatCurrency(val) {
  return toNumber(val).toFixed(2);
}

function formatLandedCost(val) {
  return toNumber(val).toFixed(2);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatQuantity(value) {
  return toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function detailLineMerchandise(item) {
  const quantity = toNumber(item.qty);
  const unitCost = toNumber(item.merchandiseCost ?? item.merchandise_cost ?? item.unitPrice ?? item.unit_price);
  return quantity * unitCost;
}

function detailUnitCost(item, costType) {
  const storedCost = costType === 'handling'
    ? toNumber(item.unitHandlingCost ?? item.unit_handling_cost)
    : toNumber(item.unitDocumentationCost ?? item.unit_doc_cost);
  if (storedCost > 0) return storedCost;

  const quantity = toNumber(item.qty);
  if (quantity <= 0 || !purchaseDetail.value) return 0;

  const items = Array.isArray(purchaseDetail.value.items) ? purchaseDetail.value.items : [];
  const merchandiseTotal = items.reduce((total, line) => total + detailLineMerchandise(line), 0);
  const totalQuantity = items.reduce((total, line) => total + toNumber(line.qty), 0);
  const lineValue = detailLineMerchandise(item);
  const weight = merchandiseTotal > 0
    ? lineValue / merchandiseTotal
    : totalQuantity > 0
      ? quantity / totalQuantity
      : 0;
  const allocatedPool = costType === 'handling'
    ? toNumber(purchaseDetail.value.handlingCost ?? purchaseDetail.value.handling_cost)
      + items.reduce((total, line) => total + toNumber(line.deliveryPrice ?? line.delivery_price), 0)
    : toNumber(purchaseDetail.value.documentationCost ?? purchaseDetail.value.documentation_cost);

  return toNumber(Number(((allocatedPool * weight) / quantity).toFixed(6)));
}

function detailEffectiveUnitCost(item) {
  const storedCost = toNumber(item.effectiveUnitCost ?? item.effective_unit_cost);
  if (storedCost > 0) return storedCost;
  return toNumber(
    toNumber(item.merchandiseCost ?? item.merchandise_cost ?? item.unitPrice ?? item.unit_price)
    + detailUnitCost(item, 'handling')
    + detailUnitCost(item, 'documentation')
  );
}

function formatDetailTimestamp(value) {
  if (!value) return '—';
  const parsed = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(language.isKhmer ? 'km-KH' : 'en-GB');
}

function formatOrderDate(value) {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) return '—';
  return new Intl.DateTimeFormat(language.isKhmer ? 'km-KH' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function purchaseStatusClass(status) {
  if (status === 'Received') return 'status-received';
  if (status === 'Cancelled') return 'status-cancelled';
  return 'status-pending';
}

function purchaseStatusIcon(status) {
  if (status === 'Received') return 'bi-check-circle-fill';
  if (status === 'Cancelled') return 'bi-x-circle-fill';
  return 'bi-hourglass-split';
}

function purchaseStatusLabel(status) {
  const value = status || 'Pending';
  if (!language.isKhmer) return value;
  if (value === 'Received') return 'បានទទួល';
  if (value === 'Cancelled') return 'បានលុបចោល';
  return 'កំពុងរង់ចាំ';
}

function formatPaymentMethod(value) {
  if (!value) return '—';
  const method = String(value).toLowerCase();
  if (method === 'cash') return language.t('cash');
  if (method === 'bank') return language.t('bank');
  if (['card', 'qr', 'khqr'].includes(method)) return language.t('cardQr');
  if (method === 'customer_account') return language.t('account');
  return String(value).replaceAll('_', ' ');
}

function dateForInput(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) {
    const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

// Line calculations matching Excel formulas
function lineAmount(item) {
  return Number(item.qty || 0) * Number(item.unitPrice || 0);
}

const merchandiseSubtotal = computed(() => {
  return form.items.reduce((sum, item) => sum + lineAmount(item), 0);
});

// Allocate handling and per-line delivery costs by merchandise value, matching receiving.
function unitHandlingCost(item) {
  const subtotal = merchandiseSubtotal.value;
  const qty = Number(item.qty || 0);
  if (subtotal <= 0 || qty <= 0) return 0;
  const handlingAndDelivery = Number(form.handlingCost || 0) + form.items.reduce((sum, line) => sum + Number(line.deliveryPrice || 0), 0);
  return Number((((lineAmount(item) / subtotal) * handlingAndDelivery) / qty).toFixed(2));
}

function unitDocumentationCost(item) {
  const subtotal = merchandiseSubtotal.value;
  const qty = Number(item.qty || 0);
  if (subtotal <= 0 || qty <= 0) return 0;
  return Number((((lineAmount(item) / subtotal) * Number(form.documentationCost || 0)) / qty).toFixed(2));
}

function costOfGoodsSold(item) {
  return Number((Number(item.unitPrice || 0) + unitHandlingCost(item) + unitDocumentationCost(item)).toFixed(2));
}

const totals = computed(() => {
  const subtotal = merchandiseSubtotal.value;
  const handlingCost = Number(form.handlingCost || 0);
  const documentationCost = Number(form.documentationCost || 0);
  const totalCogs = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * costOfGoodsSold(item), 0);
  const deliveryTotal = form.items.reduce((sum, item) => sum + Number(item.deliveryPrice || 0), 0);
  const taxableBase = subtotal + deliveryTotal + handlingCost + documentationCost;
  const taxAmount = vatRate.value > 0 ? Number((taxableBase * (vatRate.value / 100)).toFixed(2)) : 0;
  const grandTotal = Number((taxableBase + taxAmount).toFixed(2));

  return {
    subtotal,
    deliveryTotal,
    handlingCost,
    documentationCost,
    totalCogs,
    taxAmount,
    grandTotal
  };
});

function resetForm() {
  editingId.value = '';
  form.vendorId = '';
  form.orderDate = new Date().toISOString().slice(0, 10);
  form.note = '';
  form.handlingCost = 0;
  form.documentationCost = 0;
  form.items = [createBlankRow()];
  validationMessage.value = '';
}

function showNotice(tone, title, message) {
  const icons = { success: 'bi-check-lg', danger: 'bi-exclamation-lg', warning: 'bi-exclamation-triangle' };
  dialog.value = { mode: 'notice', tone, title, message, icon: icons[tone] || icons.warning };
}

function closeDialog() {
  if (!dialogBusy.value) dialog.value = null;
}

function openCreate() {
  resetForm();
  editorOpen.value = true;
}

function closeEditor() {
  if (saving.value) return;
  editorOpen.value = false;
}

function addRow() {
  form.items.push(createBlankRow());
}

function removeRow(index) {
  if (form.items.length > 1) {
    form.items.splice(index, 1);
  }
}

function setProductName(item) {
  const product = tax.items.find((entry) => Number(entry.id) === Number(item.itemId));
  if (product) {
    item.productName = getItemDisplayName(product);
    item.unitPrice = Number(product.purchaseCost || product.cost || 0);
  }
}

async function fetchOrder(id) {
  return api.purchaseOrder(id);
}

async function openPurchaseDetails(order, preserveReturnStatus = false) {
  const sequence = ++detailRequestSequence;
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  purchaseDetail.value = null;
  if (!preserveReturnStatus) {
    purchaseReturnQuantities.value = {};
    purchaseReturnReason.value = '';
    purchaseReturnError.value = '';
    purchaseReturnSuccess.value = '';
  }

  try {
    const result = await fetchOrder(order.orderId || order.id);
    if (sequence !== detailRequestSequence) return;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error(language.isKhmer ? 'ទិន្នន័យលម្អិតមិនត្រឹមត្រូវទេ។' : 'The purchase detail response was invalid.');
    }
    purchaseDetail.value = {
      ...result,
      items: Array.isArray(result.items) ? result.items.filter((item) => item && typeof item === 'object') : [],
      payments: Array.isArray(result.payments) ? result.payments.filter((payment) => payment && typeof payment === 'object') : [],
      returns: Array.isArray(result.returns)
        ? result.returns.filter((record) => record && typeof record === 'object').map((record) => ({
          ...record,
          items: Array.isArray(record.items) ? record.items.filter((item) => item && typeof item === 'object') : [],
        }))
        : [],
      paidAmount: toNumber(result.paidAmount ?? result.paid_amount ?? order.paidAmount),
      balance: toNumber(result.balance, Math.max(0, toNumber(result.grandTotal ?? result.grand_total ?? result.total) - toNumber(result.paidAmount ?? result.paid_amount ?? order.paidAmount))),
    };
  } catch (requestError) {
    if (sequence === detailRequestSequence) {
      detailError.value = requestError?.message || (language.isKhmer ? 'មិនអាចផ្ទុកព័ត៌មានការបញ្ជាទិញបានទេ។' : 'Could not load purchase order details.');
    }
  } finally {
    if (sequence === detailRequestSequence) detailLoading.value = false;
  }
}

function closePurchaseDetails() {
  if (submittingPurchaseReturn.value) return;
  detailRequestSequence += 1;
  detailOpen.value = false;
  detailLoading.value = false;
  detailError.value = '';
  purchaseDetail.value = null;
  purchaseReturnQuantities.value = {};
  purchaseReturnReason.value = '';
  purchaseReturnError.value = '';
  purchaseReturnSuccess.value = '';
}

function purchaseLineName(purchaseOrderItemId) {
  return purchaseDetail.value?.items?.find((item) => Number(item.id) === Number(purchaseOrderItemId))?.productName || 'Item';
}

function isValidPurchaseReturnSelection(lines = purchaseReturnLines.value
  .map((item) => ({
    purchaseOrderItemId: item.id,
    quantity: Number(purchaseReturnQuantities.value[item.id] || 0),
  }))
  .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0)) {
  if (!lines.length) return false;

  const quantityByItem = new Map();
  for (const line of lines) {
    const item = purchaseReturnLines.value.find((entry) => Number(entry.id) === Number(line.purchaseOrderItemId));
    if (!item || line.quantity > Number(item.returnableQuantity)) return false;
    const itemId = Number(item.itemId ?? item.item_id);
    quantityByItem.set(itemId, Number(quantityByItem.get(itemId) || 0) + line.quantity);
  }

  return Array.from(quantityByItem.entries()).every(([itemId, quantity]) => {
    const matchingLine = purchaseReturnLines.value.find((item) => Number(item.itemId ?? item.item_id) === itemId);
    return matchingLine && quantity <= Number(matchingLine.availableStock);
  });
}

async function submitPurchaseReturn() {
  purchaseReturnError.value = '';
  purchaseReturnSuccess.value = '';
  const lines = purchaseReturnLines.value
    .map((item) => ({
      purchaseOrderItemId: item.id,
      quantity: Number(purchaseReturnQuantities.value[item.id] || 0),
    }))
    .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);

  if (!lines.length) {
    purchaseReturnError.value = language.isKhmer ? 'សូមបញ្ចូលចំនួនទំនិញដែលត្រូវត្រឡប់។' : 'Enter a quantity for at least one item.';
    return;
  }
  if (!purchaseReturnReason.value.trim()) {
    purchaseReturnError.value = language.isKhmer ? 'សូមបញ្ចូលមូលហេតុត្រឡប់។' : 'Enter a reason for the return.';
    return;
  }
  if (!isValidPurchaseReturnSelection(lines)) {
    purchaseReturnError.value = language.isKhmer
      ? 'ចំនួនត្រឡប់លើសពីស្តុកដែលអាចប្រើបាន។'
      : 'A return quantity exceeds the available stock or remaining received quantity.';
    return;
  }

  const orderId = purchaseDetail.value.id;
  submittingPurchaseReturn.value = true;
  try {
    const response = await api.returnPurchaseOrder(orderId, {
      reason: purchaseReturnReason.value.trim(),
      lines,
    });
    purchaseReturnSuccess.value = response.message
      || (language.isKhmer ? 'បានដកទំនិញចេញពីស្តុក និងកត់ត្រាការត្រឡប់។' : 'Items were removed from stock and the return was recorded.');
    purchaseReturnQuantities.value = {};
    purchaseReturnReason.value = '';
    await openPurchaseDetails({ id: orderId }, true);
    try {
      await tax.initialize();
    } catch (refreshError) {
      purchaseReturnSuccess.value = `${purchaseReturnSuccess.value} ${language.isKhmer ? 'សូមផ្ទុកទិន្នន័យស្តុកឡើងវិញ។' : 'Refresh inventory data before the next stock operation.'}`;
      console.error('Purchase return succeeded, but refreshing the inventory store failed', refreshError);
    }
  } catch (requestError) {
    purchaseReturnError.value = requestError.message || 'Unable to process this supplier return';
  } finally {
    submittingPurchaseReturn.value = false;
  }
}

async function openEdit(order) {
  try {
    const detail = await fetchOrder(order.id);
    editingId.value = order.id;
    form.vendorId = String(detail.vendor_id || detail.vendorId || '');
    form.orderDate = dateForInput(detail.orderDate || detail.order_date || detail.created_at);
    form.note = detail.note || '';
    form.handlingCost = Number(detail.handling_cost ?? detail.handlingCost ?? 0);
    form.documentationCost = Number(detail.documentation_cost ?? detail.documentationCost ?? 0);
    form.items = (detail.items || []).map((item) => ({
      ...item,
      key: `po-row-${rowKey++}`,
      itemId: item.itemId ? String(item.itemId) : '',
      unitPrice: Number(item.unitPrice ?? item.cost ?? item.merchandiseCost ?? 0),
      deliveryDate: dateForInput(item.deliveryDate || detail.orderDate),
      deliveryPrice: Number(item.deliveryPrice ?? 0)
    }));
    editorOpen.value = true;
    validationMessage.value = '';
  } catch (requestError) {
    showNotice('danger', language.isKhmer ? 'មិនអាចបើកការបញ្ជាទិញបានទេ' : 'Could not open purchase order', requestError.message);
  }
}

function validate() {
  if (!form.vendorId) {
    return language.isKhmer ? 'សូមជ្រើសរើសអ្នកផ្គត់ផ្គង់។' : 'Supplier is required.';
  }
  if (!form.items.length) {
    return language.isKhmer ? 'សូមបន្ថែមទំនិញយ៉ាងហោចណាស់ ១ មុខ។' : 'Add at least one product row.';
  }
  if (![form.handlingCost, form.documentationCost].every((cost) => Number.isFinite(Number(cost)) && Number(cost) >= 0)) {
    return language.isKhmer ? 'ថ្លៃដោះស្រាយ និងឯកសារត្រូវតែជាចំនួនមិនអវិជ្ជមាន។' : 'Handling and documentation costs must be non-negative amounts.';
  }
  if ([form.handlingCost, form.documentationCost].some((cost) => Math.abs(Number(cost) * 100 - Math.round(Number(cost) * 100)) > 0.000001)) {
    return language.isKhmer ? 'ថ្លៃដោះស្រាយ និងឯកសារអាចមានខ្ទង់ទសភាគអតិបរមា ២។' : 'Handling and documentation costs cannot exceed two decimal places.';
  }

  for (let index = 0; index < form.items.length; index += 1) {
    const item = form.items[index];
    const rowNum = index + 1;

    if (!item.itemId) {
      return language.isKhmer
        ? `សូមជ្រើសរើសទំនិញពីកាតាឡុកស្តុកសម្រាប់ជួរទី ${rowNum}។`
        : `Select an inventory catalog item for row ${rowNum}.`;
    }
    if (!item.productName?.trim()) {
      return language.isKhmer
        ? `សូមបញ្ចូលឈ្មោះទំនិញសម្រាប់ជួរទី ${rowNum}។`
        : `Product name is required for row ${rowNum}.`;
    }
    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) {
      return language.isKhmer
        ? `បរិមាណត្រូវតែធំជាង 0 សម្រាប់ជួរទី ${rowNum}។`
        : `Qty must be greater than 0 for row ${rowNum}.`;
    }
    if (!Number.isSafeInteger(Number(item.qty))) {
      return language.isKhmer
        ? `បរិមាណត្រូវតែជាចំនួនគត់សម្រាប់ជួរទី ${rowNum}។`
        : `Qty must be a whole number for row ${rowNum}.`;
    }
    if (item.unitPrice === '' || item.unitPrice === null || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) {
      return language.isKhmer
        ? `ថ្លៃទិញត្រូវតែជាចំនួនមិនអវិជ្ជមានសម្រាប់ជួរទី ${rowNum}។`
        : `Unit cost must be non-negative for row ${rowNum}.`;
    }
    if (Math.abs(Number(item.unitPrice) * 10000 - Math.round(Number(item.unitPrice) * 10000)) > 0.000001) {
      return language.isKhmer
        ? `ថ្លៃទិញអាចមានខ្ទង់ទសភាគអតិបរមា ៤ សម្រាប់ជួរទី ${rowNum}។`
        : `Unit cost cannot exceed four decimal places for row ${rowNum}.`;
    }
    const deliveryDate = String(item.deliveryDate || '');
    const parsedDeliveryDate = new Date(`${deliveryDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(parsedDeliveryDate.getTime()) || parsedDeliveryDate.toISOString().slice(0, 10) !== deliveryDate) {
      return language.isKhmer
        ? `សូមបញ្ចូលកាលបរិច្ឆេទដឹកជញ្ជូនត្រឹមត្រូវសម្រាប់ជួរទី ${rowNum}។`
        : `A valid delivery date is required for row ${rowNum}.`;
    }
  }
  return '';
}

async function saveOrder() {
  validationMessage.value = validate();
  if (validationMessage.value) return;

  saving.value = true;

  try {
    const vendor = tax.vendors.find((item) => Number(item.id) === Number(form.vendorId));

    const payload = {
      vendorId: Number(form.vendorId),
      vendorName: vendor?.name || '',
      branch: tax.settings?.branch,
      orderDate: form.orderDate,
      note: form.note,
      handlingCost: Number(form.handlingCost || 0),
      documentationCost: Number(form.documentationCost || 0),
      subtotal: totals.value.subtotal,
      total: totals.value.grandTotal,
      items: form.items.map(({ key, ...item }) => ({
        ...item,
        itemId: item.itemId ? Number(item.itemId) : null,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        amount: lineAmount(item),
        unitHandlingCost: unitHandlingCost(item),
        unitDocumentationCost: unitDocumentationCost(item),
        cogs: costOfGoodsSold(item)
      }))
    };

    if (editingId.value) {
      await tax.updatePurchaseOrder(editingId.value, payload);
    } else {
      await tax.savePurchaseOrder(payload);
    }

    editorOpen.value = false;
    resetForm();
    showNotice(
      'success',
      language.isKhmer ? 'រក្សាទុកបានជោគជ័យ' : 'Purchase order saved',
      language.isKhmer ? 'ការបញ្ជាទិញត្រូវបានរក្សាទុក។' : 'The purchase order was saved successfully.'
    );
  } catch (requestError) {
    showNotice('danger', language.isKhmer ? 'មិនអាចរក្សាទុកបានទេ' : 'Could not save purchase order', requestError.message);
  } finally {
    saving.value = false;
  }
}

function requestOrderAction(action, order) {
  const isKhmer = language.isKhmer;
  const isReceive = action === 'receive';
  dialog.value = {
    mode: 'confirm',
    action,
    order,
    tone: isReceive ? 'success' : 'danger',
    icon: isReceive ? 'bi-box-seam' : 'bi-trash3',
    title: isKhmer
      ? (isReceive ? 'ទទួលទំនិញចូលស្តុក?' : 'លុបការបញ្ជាទិញ?')
      : (isReceive ? 'Receive into inventory?' : 'Delete purchase order?'),
    message: isKhmer
      ? (isReceive ? 'បរិមាណទំនិញនឹងត្រូវបន្ថែមទៅស្តុក ហើយមិនអាចទទួលការបញ្ជាទិញនេះម្តងទៀតបានទេ។' : 'ការបញ្ជាទិញដែលមិនទាន់ទទួលនឹងត្រូវលុបជាអចិន្ត្រៃយ៍។')
      : (isReceive ? 'The ordered quantities will be added to on-hand stock and this order cannot be received again.' : 'This pending purchase order will be permanently deleted.'),
    confirmLabel: isKhmer ? (isReceive ? 'ទទួលទំនិញ' : 'លុបការបញ្ជាទិញ') : (isReceive ? 'Receive order' : 'Delete order')
  };
}

async function runDialogAction() {
  const action = dialog.value;
  if (!action || action.mode !== 'confirm' || dialogBusy.value) return;
  dialogBusy.value = true;
  try {
    if (action.action === 'receive') {
      await api.receivePurchaseOrder(action.order.id, { branch: tax.settings?.branch });
      await tax.initialize();
      showNotice(
        'success',
        language.isKhmer ? 'ទទួលទំនិញបានជោគជ័យ' : 'Inventory updated',
        language.isKhmer ? `ទំនិញពីការបញ្ជាទិញ #${action.order.id} ត្រូវបានបន្ថែមទៅស្តុក។` : `Items from purchase order #${action.order.id} were added to inventory.`
      );
    } else {
      await tax.deletePurchaseOrder(action.order.id);
      showNotice(
        'success',
        language.isKhmer ? 'លុបបានជោគជ័យ' : 'Purchase order deleted',
        language.isKhmer ? `ការបញ្ជាទិញ #${action.order.id} ត្រូវបានលុប។` : `Purchase order #${action.order.id} was deleted.`
      );
    }
  } catch (requestError) {
    showNotice('danger', language.isKhmer ? 'សកម្មភាពបរាជ័យ' : 'Action could not be completed', requestError.message);
  } finally {
    dialogBusy.value = false;
  }
}

onMounted(() => {
  if (typeof tax.initialize === 'function') {
    tax.initialize();
  }
});
</script>

<style scoped>
.po-page {
  width: min(100%, 1760px);
  margin-inline: auto;
  padding: clamp(1rem, 2vw, 2rem) !important;
}

.po-page-header {
  padding: clamp(1.15rem, 2.4vw, 1.8rem);
  border: 1px solid #e7edf3;
  border-radius: 14px;
  background: linear-gradient(135deg, #fff 0%, #f8fbff 100%);
  box-shadow: 0 6px 22px rgb(15 35 55 / 5%);
}

.po-page-header h1 {
  color: #172b4d;
  font-size: clamp(1.45rem, 2vw, 1.85rem);
  letter-spacing: -0.025em;
}

.po-page-header p {
  max-width: 48rem;
  line-height: 1.55;
}

.po-page-header > .btn {
  min-height: 44px;
  padding-inline: 1rem;
  border-radius: 8px;
  font-weight: 600;
  white-space: nowrap;
}

.purchase-table {
  overflow-x: auto;
}

.purchase-table table {
  min-width: 1420px;
}

.purchase-table th {
  white-space: nowrap;
  font-size: 0.78rem;
  text-transform: uppercase;
  color: #6b7a90;
}

.purchase-table td {
  min-width: 120px;
}

.purchase-records-table {
  width: 100%;
  min-width: 1120px;
  table-layout: fixed;
}

.purchase-records-card {
  overflow: hidden;
  border: 1px solid #e6ebf1 !important;
  border-radius: 14px;
  box-shadow: 0 8px 28px rgb(15 35 55 / 6%) !important;
}

.purchase-records-card > .card-header {
  min-height: 78px;
  padding-inline: 1.25rem;
}

.purchase-records-card > .card-header strong {
  color: #172b4d;
  font-size: 1rem;
}

.purchase-records-scroll {
  scrollbar-color: #b8c5d3 #f1f5f9;
  scrollbar-width: thin;
}

.purchase-records-table th {
  padding: 0.85rem 0.65rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f5f8fb;
  color: #65758b;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.035em;
  line-height: 1.35;
  text-transform: uppercase;
  vertical-align: middle;
}

.purchase-records-table td {
  padding: 0.9rem 0.65rem;
  border-color: #edf1f5;
  vertical-align: middle;
  font-size: 0.84rem;
}

.purchase-records-table th:nth-child(1),
.purchase-records-table td:nth-child(1) {
  width: 9%;
}

.purchase-records-table th:nth-child(2),
.purchase-records-table td:nth-child(2) {
  width: 11%;
}

.purchase-records-table th:nth-child(3),
.purchase-records-table td:nth-child(3) {
  width: 15%;
}

.purchase-records-table th:nth-child(4),
.purchase-records-table td:nth-child(4) {
  width: 6%;
}

.purchase-records-table th:nth-child(5),
.purchase-records-table td:nth-child(5) {
  width: 11%;
}

.purchase-records-table th:nth-child(6),
.purchase-records-table td:nth-child(6),
.purchase-records-table th:nth-child(7),
.purchase-records-table td:nth-child(7) {
  width: 9%;
}

.purchase-records-table th:nth-child(8),
.purchase-records-table td:nth-child(8) {
  width: 11%;
}

.purchase-records-table th:nth-child(9),
.purchase-records-table td:nth-child(9) {
  width: 9%;
}

.purchase-records-table th:nth-child(10),
.purchase-records-table td:nth-child(10) {
  width: 10%;
}

.purchase-records-table tbody tr {
  transition: background-color 140ms ease, box-shadow 140ms ease;
}

.purchase-records-table tbody tr:hover {
  background-color: #f8fafc;
}

.purchase-records-table .font-monospace {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.purchase-records-table .btn-group .btn {
  min-width: 32px;
  padding-inline: 0.45rem;
}

.purchase-order-number {
  display: inline-block;
  padding: 0.25rem 0.42rem;
  border: 1px solid #dbeafe;
  border-radius: 6px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.purchase-supplier-cell {
  color: #26384b;
  font-weight: 600;
}

.purchase-item-count {
  display: inline-grid;
  min-width: 1.65rem;
  height: 1.65rem;
  place-items: center;
  padding-inline: 0.35rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.82rem;
  font-weight: 700;
}

.purchase-order-number-button {
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.purchase-order-number-button:hover,
.purchase-order-number-button:focus-visible {
  color: #0a58ca;
  text-decoration: underline;
}

.purchase-status-badge {
  padding: 0.35rem 0.45rem;
  font-size: 0.76rem;
  font-weight: 600;
  white-space: nowrap;
}

.purchase-status-badge.status-received {
  background: #e8f7ef;
  color: #167347;
}

.purchase-status-badge.status-pending {
  background: #fff5dc;
  color: #8a5a00;
}

.purchase-status-badge.status-cancelled {
  background: #fff0f0;
  color: #ae2e35;
}

.purchase-record-count {
  padding: 0.35rem 0.6rem;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
}

.purchase-tax-summary {
  display: flex;
  justify-content: flex-end;
  gap: 1.5rem;
  flex-wrap: wrap;
  margin-top: 1.25rem;
  padding: 1rem 1.25rem;
  border: 1px solid #e5eaf1;
  border-radius: 10px;
  background: #f8fafc;
}

.purchase-tax-summary div {
  display: flex;
  flex-direction: column;
  min-width: 120px;
  text-align: right;
}

.purchase-tax-summary span {
  color: #6b7a90;
  font-size: 0.78rem;
}

.purchase-tax-summary strong {
  color: #172b4d;
  font-size: 1.05rem;
}

.purchase-tax-summary .grand {
  border-left: 1px solid #dce3ec;
  padding-left: 1.5rem;
}

.purchase-tax-summary .grand strong {
  color: #0d6efd;
  font-size: 1.25rem;
}

.po-editor-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1070;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(16 27 42 / 55%);
  backdrop-filter: blur(3px);
}

.po-editor-modal {
  width: min(100%, 1240px);
  max-height: min(92vh, 960px);
  overflow: auto;
  border-radius: 14px;
}

.vendor-editor-backdrop {
  z-index: 1090;
}

.vendor-editor-modal {
  width: min(100%, 760px);
  max-height: min(92vh, 760px);
  overflow: auto;
  border-radius: 14px;
}

.po-editor-modal .card-header,
.po-editor-modal .card-footer,
.vendor-editor-modal .card-header,
.vendor-editor-modal .card-footer {
  position: sticky;
  z-index: 1;
}

.po-editor-modal .card-header,
.vendor-editor-modal .card-header {
  top: 0;
}

.po-editor-modal .card-footer,
.vendor-editor-modal .card-footer {
  bottom: 0;
}

.po-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1080;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(16 27 42 / 55%);
  backdrop-filter: blur(3px);
}

.po-detail-modal {
  width: min(100%, 1440px);
  max-height: 94vh;
  overflow: auto;
  border-radius: 14px;
}

.po-detail-modal .card-header,
.po-detail-modal .card-footer {
  position: sticky;
  z-index: 1;
}

.po-detail-modal .card-header {
  top: 0;
}

.po-detail-modal .card-footer {
  bottom: 0;
}

.po-detail-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}

.po-detail-facts > div,
.po-detail-totals {
  padding: 0.8rem 0.95rem;
  border: 1px solid #e6ebef;
  border-radius: 8px;
  background: #f8fafc;
}

.po-detail-facts span,
.po-detail-facts strong {
  display: block;
}

.po-detail-facts span,
.po-detail-totals span {
  color: #687783;
  font-size: 0.8rem;
}

.po-detail-facts strong {
  margin-top: 0.2rem;
  overflow-wrap: anywhere;
  color: #263d4d;
  font-size: 0.9rem;
}

.po-detail-totals > div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.32rem 0;
}

.po-detail-totals strong {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.po-detail-totals .po-detail-total {
  margin-top: 0.35rem;
  padding-top: 0.6rem;
  border-top: 1px solid #d6dee5;
  color: #0d6efd;
  font-weight: 700;
}

.purchase-return-quantity {
  width: 150px;
}

.purchase-return-history {
  background: #fff;
}

.po-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1090;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(16 27 42 / 48%);
  backdrop-filter: blur(4px);
}

.po-dialog {
  width: min(100%, 430px);
  padding: 2rem;
  border: 1px solid rgb(255 255 255 / 55%);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 24px 70px rgb(12 25 41 / 24%);
  text-align: center;
}

.po-dialog-icon {
  display: grid;
  width: 52px;
  aspect-ratio: 1;
  place-items: center;
  margin: 0 auto 1rem;
  border-radius: 50%;
  font-size: 1.35rem;
}

.po-dialog-icon.tone-success {
  color: #147a53;
  background: #e5f5ed;
}

.po-dialog-icon.tone-danger {
  color: #b42332;
  background: #ffeaec;
}

.po-dialog-icon.tone-warning {
  color: #986700;
  background: #fff4d6;
}

.po-dialog-title {
  margin: 0;
  color: #172b3a;
  font-size: 1.25rem;
  font-weight: 700;
}

.po-dialog-message {
  margin: 0.65rem 0 1.25rem;
  color: #5f6d79;
  line-height: 1.55;
}

.po-dialog-summary {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.55rem 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid #e6ebef;
  border-radius: 8px;
  background: #f7f9fa;
  text-align: left;
}

.po-dialog-summary span {
  color: #687783;
  font-size: 0.82rem;
}

.po-dialog-summary strong {
  max-width: 210px;
  overflow-wrap: anywhere;
  color: #263d4d;
  font-size: 0.88rem;
  text-align: right;
}

.po-dialog-actions {
  display: flex;
  justify-content: center;
  gap: 0.65rem;
  margin-top: 1.5rem;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-from .po-dialog,
.dialog-fade-leave-to .po-dialog {
  transform: translateY(8px) scale(0.98);
}

@media (max-width: 480px) {
  .po-page {
    padding: 0.85rem !important;
  }

  .po-page-header {
    align-items: stretch !important;
    border-radius: 11px;
  }

  .po-page-header > .btn {
    width: 100%;
  }

  .purchase-records-card {
    border-radius: 11px;
  }

  .purchase-records-card > .card-header {
    padding-inline: 0.9rem;
  }

  .po-editor-backdrop {
    padding: 0;
    align-items: end;
  }

  .po-editor-modal {
    max-height: 96vh;
    border-radius: 14px 14px 0 0;
  }

  .vendor-editor-modal {
    max-height: 96vh;
    border-radius: 14px 14px 0 0;
  }

  .po-detail-backdrop {
    padding: 0;
    align-items: end;
  }

  .po-detail-modal {
    max-height: 96vh;
    border-radius: 14px 14px 0 0;
  }

  .po-dialog {
    padding: 1.5rem 1.25rem;
  }

  .po-dialog-actions {
    flex-direction: column-reverse;
  }

  .po-dialog-actions .btn {
    width: 100%;
  }
}
</style>