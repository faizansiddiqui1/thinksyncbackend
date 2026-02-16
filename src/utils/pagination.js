// utils/pagination.js
export const normalizePagination = (opts = {}) => {
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const metaFor = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.ceil(total / limit),
});
