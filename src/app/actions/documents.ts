"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  assertHrAccess,
  assertHrChildPermission,
} from "@/lib/hr-auth";

export type EmployeeDocument = {
  id: string;
  employee_id: string;
  title: string;
  category:
    | "contract"
    | "id_card"
    | "certification"
    | "tax_form"
    | "EOBI_registration"
    | "Medical_Insurance"
    | "degree"
    | "experience_certificate"
    | "undertaking"
    | "other";
  expiry_date: string | null;
  status: "active" | "expired" | "revoked";
  pdf_name: string | null;
  pdf_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function createDocument(formData: FormData) {
  await assertHrChildPermission("document_management");

  const employeeId = String(formData.get("employeeId") || formData.get("employee_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const expiryDate = String(formData.get("expiryDate") || formData.get("expiry_date") || "").trim();
  const status = String(formData.get("status") || "active").trim();
  const pdfName = String(formData.get("pdfName") || formData.get("pdf_name") || "").trim();
  const pdfPath = String(formData.get("pdfPath") || formData.get("pdf_path") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!employeeId) {
    return { error: "Employee ID is required" };
  }

  if (!title) {
    return { error: "Title is required" };
  }

  if (!category) {
    return { error: "Category is required" };
  }

  const validCategories = [
    "contract",
    "id_card",
    "certification",
    "tax_form",
    "other",
    "EOBI_registration",
    "Medical_Insurance",
    "degree",
    "experience_certificate",
    "undertaking",
  ];
  if (!validCategories.includes(category)) {
    return { error: "Invalid category" };
  }

  const validStatuses = ["active", "expired", "revoked"];
  if (!validStatuses.includes(status)) {
    return { error: "Invalid status" };
  }

  const supabase = await createAdminClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError) {
    return { error: employeeError.message };
  }

  if (!employee) {
    return { error: "Employee not found" };
  }

  const { data: document, error } = await supabase
    .from("employee_documents")
    .insert([
      {
        employee_id: employeeId,
        title,
        category,
        expiry_date: emptyToNull(expiryDate),
        status,
        pdf_name: emptyToNull(pdfName),
        pdf_path: emptyToNull(pdfPath),
        notes: emptyToNull(notes),
      },
    ])
    .select("*")
    .single();

  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("relation") || error.code === "42P01") {
      return {
        error: "Employee documents table does not exist. Please run the SQL migration in Supabase.",
      };
    }
    return { error: error.message || "Failed to create document" };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/documents");
  revalidatePath("/hr/dashboard");
  return { success: true, document: document as EmployeeDocument };
}

export async function getDocuments(employeeId?: string) {
  await assertHrAccess();

  const supabase = await createAdminClient();

  let query = supabase.from("employee_documents").select("*");

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("relation") || error.code === "42P01") {
      return { documents: [] as EmployeeDocument[] };
    }
    return { error: error.message };
  }

  return { documents: (data || []) as EmployeeDocument[] };
}

export async function updateDocument(formData: FormData) {
  await assertHrChildPermission("document_management");

  const id = String(formData.get("id") || "").trim();
  const employeeId = String(formData.get("employeeId") || formData.get("employee_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const expiryDate = String(formData.get("expiryDate") || formData.get("expiry_date") || "").trim();
  const status = String(formData.get("status") || "active").trim();
  const pdfName = String(formData.get("pdfName") || formData.get("pdf_name") || "").trim();
  const pdfPath = String(formData.get("pdfPath") || formData.get("pdf_path") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!id) {
    return { error: "Document ID is required" };
  }

  if (!employeeId || !title || !category) {
    return { error: "Employee ID, title, and category are required" };
  }

  const validCategories = [
    "contract",
    "id_card",
    "certification",
    "tax_form",
    "other",
    "EOBI_registration",
    "Medical_Insurance",
    "degree",
    "experience_certificate",
    "undertaking",
  ];
  if (!validCategories.includes(category)) {
    return { error: "Invalid category" };
  }

  const validStatuses = ["active", "expired", "revoked"];
  if (!validStatuses.includes(status)) {
    return { error: "Invalid status" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("employee_documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Document not found" };
  }

  const { data: document, error } = await supabase
    .from("employee_documents")
    .update({
      employee_id: employeeId,
      title,
      category,
      expiry_date: emptyToNull(expiryDate),
      status,
      pdf_name: emptyToNull(pdfName),
      pdf_path: emptyToNull(pdfPath),
      notes: emptyToNull(notes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/documents");
  revalidatePath("/hr/dashboard");
  return { success: true, document: document as EmployeeDocument };
}

export async function deleteDocument(formData: FormData) {
  await assertHrChildPermission("document_management");

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Document ID is required" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("employee_documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Document not found" };
  }

  const { error } = await supabase.from("employee_documents").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/documents");
  revalidatePath("/hr/dashboard");
  return { success: true };
}
