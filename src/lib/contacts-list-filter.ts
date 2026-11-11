/**
 * Which contacts the Contacts list shows: top-level contacts and individual
 * people (child company addresses are left out). Shared so every count of
 * "contacts" agrees with the Contacts page.
 */
export const CONTACTS_LIST_OR_FILTER = 'parent_id.is.null,company_type.eq.person';
