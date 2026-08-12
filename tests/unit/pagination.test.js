const { parsePagination } = require('../../utils/pagination');

describe('parsePagination', () => {
  it('defaults to page 1 and page_size 20', () => {
    expect(parsePagination({})).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
      limit: 20,
    });
  });

  it('accepts page_size up to 200', () => {
    expect(parsePagination({ page: '1', page_size: '200' })).toEqual({
      page: 1,
      pageSize: 200,
      offset: 0,
      limit: 200,
    });
  });

  it('caps page_size above 200', () => {
    expect(parsePagination({ page_size: '500' }).pageSize).toBe(200);
    expect(parsePagination({ page_size: '500' }).limit).toBe(200);
  });
});
