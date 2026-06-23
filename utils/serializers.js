function formatUser(user) {
  if (!user) return null;
  const data = user.toSafeJSON ? user.toSafeJSON() : { ...user.get?.() || user };
  delete data.password_hash;
  return data;
}

function getStatus(user) {
  return user.is_active ? 'active' : 'inactive';
}

function getUserName(user) {
  if (!user) return null;
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return name || user.username;
}

function formatUserListItem(user) {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    status: getStatus(user),
  };
}

function formatClientListItem(user, customer) {
  const profile = customer || user.customer_profile;
  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    status: getStatus(user),
    phone_number: profile?.phone_number || null,
    whatsapp_number: profile?.whatsapp_number || null,
    address: profile?.address || null,
    preferred_contact_method: profile?.preferred_contact_method || null,
    notes: profile?.notes ? profile.notes : 'no note',
    total_orders: profile?.total_orders ?? 0,
    total_spent: profile ? String(profile.total_spent) : '0.00',
    last_order_date: profile?.last_order_date ? profile.last_order_date.toISOString() : null,
    customer: profile ? { id: profile.id } : null,
  };
}

function formatUserProfile(user, customer) {
  const profile = customer || user.customer_profile;
  const base = {
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    status: getStatus(user),
    updated_by_name: user.updater ? getUserName(user.updater) : null,
    phone_number: null,
    whatsapp_number: null,
    address: null,
    preferred_contact_method: null,
    notes: null,
    total_orders: 0,
    total_spent: '0.00',
    last_order_date: null,
    customer_created_by_name: null,
    customer_updated_by_name: null,
  };

  if (user.role === 'client' && profile) {
    base.phone_number = profile.phone_number;
    base.whatsapp_number = profile.whatsapp_number;
    base.address = profile.address;
    base.preferred_contact_method = profile.preferred_contact_method;
    base.notes = profile.notes ? profile.notes : 'no note';
    base.total_orders = profile.total_orders;
    base.total_spent = String(profile.total_spent);
    base.last_order_date = profile.last_order_date ? profile.last_order_date.toISOString() : null;
    base.customer_created_by_name = profile.creator ? getUserName(profile.creator) : null;
    base.customer_updated_by_name = profile.customerUpdater ? getUserName(profile.customerUpdater) : null;
  }

  return base;
}

function formatStaffUserDetail(user, customer) {
  const profile = customer || user.customer_profile;
  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    role: user.role,
    status: getStatus(user),
    is_active: user.is_active,
    is_staff: user.is_staff,
    phone_number: profile?.phone_number || null,
    whatsapp_number: profile?.whatsapp_number || null,
    address: profile?.address || null,
    preferred_contact_method: profile?.preferred_contact_method || null,
    notes: profile?.notes ? profile.notes : 'no note',
    total_orders: profile?.total_orders ?? 0,
    total_spent: profile ? String(profile.total_spent) : '0.00',
    last_order_date: profile?.last_order_date ? profile.last_order_date.toISOString() : null,
    customer: profile ? { id: profile.id } : null,
  };
}

function formatSuperadminUserDetail(user, customer) {
  const profile = customer || user.customer_profile;
  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    role: user.role,
    status: getStatus(user),
    is_active: user.is_active,
    is_staff: user.is_staff,
    is_superuser: user.is_superuser,
    phone_number: profile?.phone_number || null,
    whatsapp_number: profile?.whatsapp_number || null,
    address: profile?.address || null,
    preferred_contact_method: profile?.preferred_contact_method || null,
    notes: profile?.notes || null,
    total_orders: profile?.total_orders ?? 0,
    total_spent: profile ? String(profile.total_spent) : '0.00',
    last_order_date: profile?.last_order_date ? profile.last_order_date.toISOString() : null,
    customer: profile ? { id: profile.id } : null,
  };
}

function formatOrder(order) {
  const customer = order.customer;
  const customerUser = customer?.user;
  return {
    id: order.id,
    order_number: order.order_number,
    customer_id: order.customer_id,
    customer: order.customer_id,
    customer_username: customerUser?.username || null,
    customer_name: customerUser
      ? `${customerUser.first_name} ${customerUser.last_name}`.trim()
      : null,
    assigned_to: order.assigned_to,
    assigned_to_username: order.assignee?.username || null,
    order_status: order.order_status,
    payment_status: order.payment_status,
    total_amount: String(order.total_amount),
    amount_paid: String(order.amount_paid),
    discount_amount: String(order.discount_amount),
    delivery_notes: order.delivery_notes,
    special_instructions: order.special_instructions,
    pickup_date: order.pickup_date,
    delivery_date: order.delivery_date,
    estimated_completion_date: order.estimated_completion_date,
    completed_at: order.completed_at,
    created_by: order.created_by,
    created_by_username: order.creator?.username || null,
    created_at: order.created_at,
    updated_at: order.updated_at,
    updated_by: order.updated_by,
    order_items: (order.order_items || []).map(formatOrderItem),
  };
}

function formatOrderItem(item) {
  return {
    id: item.id,
    service_id: item.service_id,
    service_name: item.service?.name || null,
    item_name: item.item_name,
    description: item.description,
    quantity: item.quantity,
    unit_price: String(item.unit_price),
    subtotal: String(item.subtotal),
    notes: item.notes,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function formatService(service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    price: String(service.price),
    unit: service.unit,
    category: service.category,
    estimated_days: service.estimated_days,
    is_active: service.is_active,
  };
}

module.exports = {
  formatUser,
  formatUserListItem,
  formatClientListItem,
  formatUserProfile,
  formatStaffUserDetail,
  formatSuperadminUserDetail,
  formatOrder,
  formatService,
};
