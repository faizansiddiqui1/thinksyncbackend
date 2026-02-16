import dayjs from 'dayjs';

/* =========================
   Check Date Overlap
========================= */
export const isDateOverlap = (start1, end1, start2, end2) => {
  const s1 = dayjs(start1);
  const e1 = dayjs(end1);
  const s2 = dayjs(start2);
  const e2 = dayjs(end2);

  return s1.isBefore(e2) && s2.isBefore(e1);
};

/* =========================
   Calculate Duration
========================= */
export const calculateDuration = (startDate, endDate, unit = 'day') => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  return end.diff(start, unit);
};

/* =========================
   Format Date
========================= */
export const formatDate = (date, format = 'YYYY-MM-DD') => {
  return dayjs(date).format(format);
};

/* =========================
   Validate Date Range
========================= */
export const isValidDateRange = (startDate, endDate) => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  return start.isBefore(end);
};

/* =========================
   Add Days
========================= */
export const addDays = (date, days) => {
  return dayjs(date).add(days, 'day').toDate();
};

/* =========================
   Subtract Days
========================= */
export const subtractDays = (date, days) => {
  return dayjs(date).subtract(days, 'day').toDate();
};
