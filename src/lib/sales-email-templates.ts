export type SalesEmailTemplateVars = {
  quotation_number?: string;
  customer_name?: string;
  company_name?: string;
  salesperson_name?: string;
  total_amount?: string;
  expiration_date?: string;
};

/** Pure template renderer — keep outside `'use server'` (sync helpers cannot be Server Actions). */
export function renderSalesEmailTemplate(
  template: { subject: string; body: string },
  vars: SalesEmailTemplateVars
) {
  const replace = (text: string) =>
    text
      .replace(/\{\{quotation_number\}\}/g, vars.quotation_number || '')
      .replace(/\{\{customer_name\}\}/g, vars.customer_name || '')
      .replace(/\{\{company_name\}\}/g, vars.company_name || 'Company')
      .replace(/\{\{salesperson_name\}\}/g, vars.salesperson_name || '')
      .replace(/\{\{total_amount\}\}/g, vars.total_amount || '')
      .replace(/\{\{expiration_date\}\}/g, vars.expiration_date || '');

  return {
    subject: replace(template.subject),
    body: replace(template.body),
  };
}
