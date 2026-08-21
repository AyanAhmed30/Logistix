"use client";

import { useEffect, useState } from "react";
import { Download, Edit, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PdfAttachmentInput } from "@/components/hr/PdfAttachmentInput";
import { getAllEmployees, type Employee } from "@/app/actions/employees";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  type EmployeeDocument,
} from "@/app/actions/documents";
import {
  downloadPdfAttachment,
  getPdfAttachment,
  isImageAttachment,
  isPdfAttachment,
  revokePdfAttachment,
  storePdfAttachment,
  validateHrDocumentFile,
  type PdfAttachmentMeta,
} from "@/lib/hr-pdf-attachment";

type EmployeeOption = {
  id: string;
  fullName: string;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const DOCUMENT_ACCEPT =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";

const CATEGORY_OPTIONS: Array<{
  value: EmployeeDocument["category"];
  label: string;
}> = [
  { value: "id_card", label: "ID Card" },
  { value: "contract", label: "Contract" },
  { value: "certification", label: "Certification" },
  { value: "tax_form", label: "Tax Form" },
  { value: "EOBI_registration", label: "EOBI Registration" },
  { value: "Medical_Insurance", label: "Medical Insurance" },
  { value: "degree", label: "Degree" },
  { value: "experience_certificate", label: "Experience Certificate" },
  { value: "undertaking", label: "Undertaking" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: Array<{
  value: EmployeeDocument["status"];
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

type DocumentFormState = {
  employeeId: string;
  title: string;
  category: EmployeeDocument["category"];
  expiryDate: string;
  status: EmployeeDocument["status"];
  notes: string;
};

const EMPTY_FORM: DocumentFormState = {
  employeeId: "",
  title: "",
  category: "id_card",
  expiryDate: "",
  status: "active",
  notes: "",
};

function categoryLabel(category: EmployeeDocument["category"]) {
  return (
    CATEGORY_OPTIONS.find((option) => option.value === category)?.label ||
    category
  );
}

function statusBadgeClass(status: EmployeeDocument["status"]) {
  switch (status) {
    case "active":
      return "border-transparent bg-emerald-100 text-emerald-700";
    case "expired":
      return "border-transparent bg-amber-100 text-amber-700";
    case "revoked":
      return "border-transparent bg-red-100 text-red-700";
    default:
      return "border-transparent bg-slate-100 text-slate-700";
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function DocumentManagement() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [documentForm, setDocumentForm] =
    useState<DocumentFormState>(EMPTY_FORM);
  const [documentFile, setDocumentFile] = useState<PdfAttachmentMeta | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewingDocument, setViewingDocument] =
    useState<EmployeeDocument | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingDocument, setEditingDocument] =
    useState<EmployeeDocument | null>(null);
  const [editForm, setEditForm] = useState<DocumentFormState>(EMPTY_FORM);
  const [editFile, setEditFile] = useState<PdfAttachmentMeta | null>(null);
  const [editFileChanged, setEditFileChanged] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<EmployeeDocument | null>(
    null,
  );

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [employeeResult, documentsResult] = await Promise.all([
          getAllEmployees(),
          getDocuments(),
        ]);

        if (!("error" in employeeResult)) {
          setEmployees(
            (employeeResult.employees || []).map((row: Employee) => ({
              id: row.id,
              fullName: row.full_name,
            })),
          );
        } else {
          toast.error(employeeResult.error);
        }

        if (!("error" in documentsResult)) {
          setDocuments(documentsResult.documents || []);
        } else {
          toast.error(documentsResult.error);
        }
      } catch (err) {
        toast.error(String(err || "Failed to load data"));
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  function employeeName(employeeId: string) {
    return (
      employees.find((employee) => employee.id === employeeId)?.fullName ||
      "Unknown employee"
    );
  }

  async function refreshDocuments() {
    const refreshed = await getDocuments();
    if (!("error" in refreshed)) {
      setDocuments(refreshed.documents || []);
    }
  }

  async function handleDocumentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !documentForm.employeeId ||
      !documentForm.title.trim() ||
      !documentForm.category ||
      !documentForm.status
    ) {
      toast.error(
        "Employee, Document Title, Document Type, and Document Status are required.",
      );
      return;
    }

    const formData = new FormData();
    formData.append("employee_id", documentForm.employeeId);
    formData.append("title", documentForm.title.trim());
    formData.append("category", documentForm.category);
    formData.append("expiry_date", documentForm.expiryDate);
    formData.append("status", documentForm.status);
    formData.append("notes", documentForm.notes);
    formData.append("pdf_name", documentFile?.fileName || "");
    formData.append("pdf_path", "");

    try {
      const result = await createDocument(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (documentFile && result.document) {
        storePdfAttachment(result.document.id, documentFile);
      }

      toast.success("Document added");
      setDocumentForm(EMPTY_FORM);
      setDocumentFile(null);
      await refreshDocuments();
    } catch (err) {
      toast.error(String(err || "Failed to create document"));
    }
  }

  function openView(document: EmployeeDocument) {
    setViewingDocument(document);
    setViewOpen(true);
  }

  function openEdit(document: EmployeeDocument) {
    setEditingDocument(document);
    setEditForm({
      employeeId: document.employee_id,
      title: document.title,
      category: document.category,
      expiryDate: document.expiry_date || "",
      status: document.status,
      notes: document.notes || "",
    });
    setEditFile(getPdfAttachment(document.id));
    setEditFileChanged(false);
    setEditOpen(true);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDocument) return;

    if (
      !editForm.employeeId ||
      !editForm.title.trim() ||
      !editForm.category ||
      !editForm.status
    ) {
      toast.error(
        "Employee, Document Title, Document Type, and Document Status are required.",
      );
      return;
    }

    const existingAttachment = getPdfAttachment(editingDocument.id);
    const nextFileName = editFileChanged
      ? editFile?.fileName || ""
      : editFile?.fileName || editingDocument.pdf_name || "";

    const formData = new FormData();
    formData.append("id", editingDocument.id);
    formData.append("employee_id", editForm.employeeId);
    formData.append("title", editForm.title.trim());
    formData.append("category", editForm.category);
    formData.append("expiry_date", editForm.expiryDate);
    formData.append("status", editForm.status);
    formData.append("notes", editForm.notes);
    formData.append("pdf_name", nextFileName);
    formData.append("pdf_path", editingDocument.pdf_path || "");

    try {
      const result = await updateDocument(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (editFileChanged) {
        if (editFile) {
          storePdfAttachment(editingDocument.id, editFile);
        } else if (existingAttachment) {
          revokePdfAttachment(editingDocument.id);
        }
      }

      toast.success("Document updated");
      setEditOpen(false);
      setEditingDocument(null);
      setEditFile(null);
      setEditFileChanged(false);
      await refreshDocuments();
    } catch (err) {
      toast.error(String(err || "Failed to update document"));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      const formData = new FormData();
      formData.append("id", deleteTarget.id);
      const result = await deleteDocument(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      revokePdfAttachment(deleteTarget.id);
      toast.success("Document deleted");
      setDeleteTarget(null);
      await refreshDocuments();
    } catch (err) {
      toast.error(String(err || "Failed to delete document"));
    }
  }

  function handleDownload(documentId: string) {
    const downloaded = downloadPdfAttachment(documentId);
    if (!downloaded) {
      toast.error("File is no longer available in this session.");
    }
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-secondary-muted">
        Loading documents...
      </div>
    );
  }

  const viewingAttachment = viewingDocument
    ? getPdfAttachment(viewingDocument.id)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Document Management
        </h2>
      </div>

      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#0f766e]">Document Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Add Document
              </h3>
              <p className="text-sm text-slate-500">
                Track contracts, certificates, and other HR documents.
              </p>
            </div>

            <form onSubmit={handleDocumentSubmit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doc-employee">Employee</Label>
                  <select
                    id="doc-employee"
                    value={documentForm.employeeId}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        employeeId: event.target.value,
                      }))
                    }
                    className={selectClassName}
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-title">Document Title</Label>
                  <Input
                    id="doc-title"
                    value={documentForm.title}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Document title"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-type">Document Type</Label>
                  <select
                    id="doc-type"
                    value={documentForm.category}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        category: event.target
                          .value as EmployeeDocument["category"],
                      }))
                    }
                    className={selectClassName}
                    required
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-expiry">Expiry Date</Label>
                  <Input
                    id="doc-expiry"
                    type="date"
                    value={documentForm.expiryDate}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        expiryDate: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc-notes">Notes</Label>
                <Textarea
                  id="doc-notes"
                  value={documentForm.notes}
                  onChange={(event) =>
                    setDocumentForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Notes"
                  rows={5}
                />
              </div>

              <PdfAttachmentInput
                label="Attach Document"
                description="PDF, DOC, DOCX, JPG, JPEG, or PNG. Maximum size 10 MB."
                chooseLabel="Choose File"
                accept={DOCUMENT_ACCEPT}
                validateFile={validateHrDocumentFile}
                value={documentFile}
                onChange={setDocumentFile}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  Add Document
                </Button>
                <select
                  value={documentForm.status}
                  onChange={(event) =>
                    setDocumentForm((current) => ({
                      ...current,
                      status: event.target
                        .value as EmployeeDocument["status"],
                    }))
                  }
                  className={selectClassName}
                  style={{ width: "auto", minWidth: "8rem" }}
                  required
                  aria-label="Document Status"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">
              Document List
            </h3>

            {documents.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <p>No documents yet.</p>
                <p>Add the first document to get started.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Document Title</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Uploaded Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((document) => (
                      <TableRow key={document.id}>
                        <TableCell>
                          {employeeName(document.employee_id)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {document.title}
                        </TableCell>
                        <TableCell>
                          {categoryLabel(document.category)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(document.status)}
                          >
                            {STATUS_OPTIONS.find(
                              (option) => option.value === document.status,
                            )?.label || document.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDate(document.expiry_date)}
                        </TableCell>
                        <TableCell>
                          {formatDate(document.created_at)}
                        </TableCell>
                        <TableCell className="space-x-1 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openView(document)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(document.id)}
                          >
                            <Download className="mr-1 h-4 w-4" />
                            Download
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(document)}
                          >
                            <Edit className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(document)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Document Details</DialogTitle>
            <DialogDescription>
              Review the selected employee document.
            </DialogDescription>
          </DialogHeader>
          {viewingDocument ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-slate-500">Employee</p>
                  <p className="font-medium">
                    {employeeName(viewingDocument.employee_id)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Document Title</p>
                  <p className="font-medium">{viewingDocument.title}</p>
                </div>
                <div>
                  <p className="text-slate-500">Document Type</p>
                  <p className="font-medium">
                    {categoryLabel(viewingDocument.category)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Status</p>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(viewingDocument.status)}
                  >
                    {STATUS_OPTIONS.find(
                      (option) => option.value === viewingDocument.status,
                    )?.label || viewingDocument.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-slate-500">Expiry Date</p>
                  <p className="font-medium">
                    {formatDate(viewingDocument.expiry_date)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Uploaded Date</p>
                  <p className="font-medium">
                    {formatDate(viewingDocument.created_at)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-slate-500">Notes</p>
                <p className="whitespace-pre-wrap font-medium">
                  {viewingDocument.notes || "—"}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-slate-500">Attached File</p>
                {viewingAttachment || viewingDocument.pdf_name ? (
                  <div className="space-y-3 rounded-md border border-slate-200 p-3">
                    <p className="font-medium">
                      {viewingAttachment?.fileName ||
                        viewingDocument.pdf_name}
                    </p>
                    {viewingAttachment && isPdfAttachment(viewingAttachment) ? (
                      <iframe
                        title="Document preview"
                        src={viewingAttachment.objectUrl}
                        className="h-80 w-full rounded-md border border-slate-200"
                      />
                    ) : null}
                    {viewingAttachment &&
                    isImageAttachment(viewingAttachment) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={viewingAttachment.objectUrl}
                        alt={viewingAttachment.fileName}
                        className="max-h-80 rounded-md border border-slate-200 object-contain"
                      />
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(viewingDocument.id)}
                    >
                      <Download className="mr-1 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                ) : (
                  <p className="text-slate-500">No file attached.</p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingDocument(null);
            setEditFile(null);
            setEditFileChanged(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update document details and attachment.
            </DialogDescription>
          </DialogHeader>
          {editingDocument ? (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-doc-employee">Employee</Label>
                  <select
                    id="edit-doc-employee"
                    value={editForm.employeeId}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        employeeId: event.target.value,
                      }))
                    }
                    className={selectClassName}
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-doc-title">Document Title</Label>
                  <Input
                    id="edit-doc-title"
                    value={editForm.title}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-doc-type">Document Type</Label>
                  <select
                    id="edit-doc-type"
                    value={editForm.category}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        category: event.target
                          .value as EmployeeDocument["category"],
                      }))
                    }
                    className={selectClassName}
                    required
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-doc-expiry">Expiry Date</Label>
                  <Input
                    id="edit-doc-expiry"
                    type="date"
                    value={editForm.expiryDate}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        expiryDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-doc-status">Document Status</Label>
                  <select
                    id="edit-doc-status"
                    value={editForm.status}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        status: event.target
                          .value as EmployeeDocument["status"],
                      }))
                    }
                    className={selectClassName}
                    required
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-doc-notes">Notes</Label>
                <Textarea
                  id="edit-doc-notes"
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={5}
                />
              </div>

              <PdfAttachmentInput
                label="Attach Document"
                description="PDF, DOC, DOCX, JPG, JPEG, or PNG. Maximum size 10 MB."
                chooseLabel="Choose File"
                accept={DOCUMENT_ACCEPT}
                validateFile={validateHrDocumentFile}
                value={editFile}
                onChange={(attachment) => {
                  setEditFile(attachment);
                  setEditFileChanged(true);
                }}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              {deleteTarget?.title || "this document"}? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
