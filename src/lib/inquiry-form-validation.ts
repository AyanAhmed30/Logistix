export type InquiryProductFields = {
  product_name: string;
  total_weight: string;
  cbm: string;
  quantity: string;
};

export type InquiryProductFieldKey = keyof InquiryProductFields;

export type InquiryProductFieldErrors = Partial<Record<InquiryProductFieldKey, string>>;

export function isIntegerString(value: string) {
  return /^\d+$/.test(value.trim());
}

export function isDecimalString(value: string) {
  if (!value.trim()) return false;
  return /^(?:\d+|\d+\.\d+|\d*\.\d+)$/.test(value.trim());
}

export function isOptionalDecimalString(value: string) {
  if (!value.trim()) return true;
  return isDecimalString(value);
}

/** Validation for saving a draft — product name required; other fields optional but format-checked when present. */
export function validateInquiryProductInfoForDraft(fields: InquiryProductFields): {
  valid: boolean;
  errors: InquiryProductFieldErrors;
} {
  const errors: InquiryProductFieldErrors = {};

  if (!fields.product_name.trim()) {
    errors.product_name = "Product name is required.";
  }
  if (fields.total_weight.trim() && !isIntegerString(fields.total_weight)) {
    errors.total_weight = "Total Weight must be a whole number (kg).";
  }
  if (fields.cbm.trim() && !isDecimalString(fields.cbm)) {
    errors.cbm = "CBM must be a valid number (e.g. 12.5).";
  }
  if (fields.quantity.trim() && !isIntegerString(fields.quantity)) {
    errors.quantity = "Quantity must be a whole number.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Validation before sending an inquiry — all product information fields are required. */
export function validateInquiryProductInfoForSend(fields: InquiryProductFields): {
  valid: boolean;
  errors: InquiryProductFieldErrors;
} {
  const errors: InquiryProductFieldErrors = {};

  if (!fields.product_name.trim()) {
    errors.product_name = "Product name is required.";
  }
  if (!fields.total_weight.trim()) {
    errors.total_weight = "Total Weight is required.";
  } else if (!isIntegerString(fields.total_weight)) {
    errors.total_weight = "Total Weight must be a whole number (kg).";
  }
  if (!fields.cbm.trim()) {
    errors.cbm = "Total CBM is required.";
  } else if (!isDecimalString(fields.cbm)) {
    errors.cbm = "CBM must be a valid number (e.g. 12.5).";
  }
  if (!fields.quantity.trim()) {
    errors.quantity = "Quantity is required.";
  } else if (!isIntegerString(fields.quantity)) {
    errors.quantity = "Quantity must be a whole number.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function inquiryProductFieldsFromForm(input: {
  productName: string;
  totalWeight: string;
  cbm: string;
  quantity: string;
}): InquiryProductFields {
  return {
    product_name: input.productName,
    total_weight: input.totalWeight,
    cbm: input.cbm,
    quantity: input.quantity,
  };
}
