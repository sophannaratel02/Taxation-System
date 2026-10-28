function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function resolveReportDateRange(fromValue, toValue, today = new Date()) {
  const todayDate = formatLocalDate(today);
  const startOfMonth = `${todayDate.slice(0, 7)}-01`;
  const from = String(fromValue || startOfMonth);
  const to = String(toValue || todayDate);

  if (!isIsoCalendarDate(from) || !isIsoCalendarDate(to)) {
    return { error: 'from and to must be valid dates in YYYY-MM-DD format' };
  }
  if (from > to) return { error: 'from must be on or before to' };
  return { from, to };
}

module.exports = { resolveReportDateRange };
