export type ProformaInvoiceLineItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxes: string;
  amount: string;
};

export type ProformaInvoiceFormData = {
  companyName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  source: string;
  lineItems: ProformaInvoiceLineItem[];
  untaxedAmount: string;
  total: string;
  paymentCommunication: string;
  bankAccount: string;
};

export function createEmptyProformaInvoiceLineItem(): ProformaInvoiceLineItem {
  return {
    description: "",
    quantity: "",
    unitPrice: "",
    taxes: "",
    amount: "",
  };
}

export function createEmptyProformaInvoiceForm(): ProformaInvoiceFormData {
  return {
    companyName: "",
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: "",
    source: "",
    lineItems: [createEmptyProformaInvoiceLineItem()],
    untaxedAmount: "",
    total: "",
    paymentCommunication: "",
    bankAccount: "",
  };
}

export function formatProformaInvoiceDate(value: string): string {
  if (!value) return "";
  if (value.includes("/")) return value;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}
