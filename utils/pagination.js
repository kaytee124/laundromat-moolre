function parsePagination(query) {
  let page = parseInt(query.page, 10) || 1;
  let pageSize = parseInt(query.page_size, 10) || 20;

  if (pageSize > 50) pageSize = 50;
  if (pageSize < 1) pageSize = 20;
  if (page < 1) page = 1;

  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, limit: pageSize };
}

function paginatedResponse({ count, page, pageSize, results }) {
  return {
    count,
    page,
    page_size: pageSize,
    total_pages: count > 0 ? Math.ceil(count / pageSize) : 0,
    results,
  };
}

module.exports = { parsePagination, paginatedResponse };
