"use client";

import { useEffect, useMemo, useState } from "react";
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
  getPayroll,
  createPayroll,
  updatePayroll,
  deletePayroll,
  type PayrollRecord,
} from "@/app/actions/payroll";
import {
  calculateNetSalary,
  calculateNetSalaryFromParts,
  formatCurrency,
  isWithinLastTwoMonths,
} from "@/lib/payroll-utils";
import {
  downloadPdfAttachment,
  getPdfAttachment,
  revokePdfAttachment,
  storePdfAttachment,
  validatePayrollDocumentFile,
  type PdfAttachmentMeta,
} from "@/lib/hr-pdf-attachment";

type EmployeeOption = {
  id: string;
  fullName: string;
};

type PayrollFormState = {
  employeeId: string;
  paymentDate: string;
  salary: string;
  hardshipAllowance: string;
  deductions: string;
  paymentStatus: PayrollRecord["payment_status"];
  notes: string;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const PAYROLL_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EMPTY_FORM: PayrollFormState = {
  employeeId: "",
  paymentDate: "",
  salary: "",
  hardshipAllowance: "0",
  deductions: "0",
  paymentStatus: "paid",
  notes: "",
};

function toNumber(value: string) {
  const parsed = Number.parseFloat(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusBadgeClass(status: PayrollRecord["payment_status"]) {
  switch (status) {
    case "paid":
      return "border-transparent bg-emerald-100 text-emerald-700";
    case "failed":
      return "border-transparent bg-red-100 text-red-700";
    case "pending":
    default:
      return "border-transparent bg-amber-100 text-amber-700";
  }
}

function statusLabel(status: PayrollRecord["payment_status"]) {
  switch (status) {
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    case "pending":
    default:
      return "Pending";
  }
}

export function PayrollManagement() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [payrollForm, setPayrollForm] = useState<PayrollFormState>(EMPTY_FORM);
  const [payrollFile, setPayrollFile] = useState<PdfAttachmentMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<PayrollRecord | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null);
  const [editForm, setEditForm] = useState<PayrollFormState>(EMPTY_FORM);
  const [editFile, setEditFile] = useState<PdfAttachmentMeta | null>(null);
  const [editFileChanged, setEditFileChanged] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PayrollRecord | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [employeeResult, payrollResult] = await Promise.all([
          getAllEmployees(),
          getPayroll(),
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

        if (!("error" in payrollResult)) {
          setPayrollRecords(payrollResult.payrollRecords || []);
        } else {
          toast.error(payrollResult.error);
        }
      } catch (err) {
        toast.error(String(err || "Failed to load data"));
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const recentPayrollRecords = useMemo(
    () =>
      payrollRecords.filter((record) =>
        isWithinLastTwoMonths(record.payment_date || record.created_at),
      ),
    [payrollRecords],
  );

  const createNetSalary = calculateNetSalaryFromParts(
    toNumber(payrollForm.salary),
    toNumber(payrollForm.hardshipAllowance),
    toNumber(payrollForm.deductions),
  );

  const editNetSalary = calculateNetSalaryFromParts(
    toNumber(editForm.salary),
    toNumber(editForm.hardshipAllowance),
    toNumber(editForm.deductions),
  );

  function employeeName(employeeId: string) {
    return (
      employees.find((employee) => employee.id === employeeId)?.fullName ||
      "Unknown employee"
    );
  }

  async function refreshPayroll() {
    const refreshed = await getPayroll();
    if (!("error" in refreshed)) {
      setPayrollRecords(refreshed.payrollRecords || []);
    }
  }

  function appendPayrollFormData(
    formData: FormData,
    form: PayrollFormState,
    fileName: string,
    existingPath = "",
  ) {
    formData.append("employee_id", form.employeeId);
    formData.append("payment_date", form.paymentDate);
    formData.append("salary", form.salary);
    formData.append("hardship_allowance", form.hardshipAllowance || "0");
    formData.append("deductions", form.deductions || "0");
    formData.append("payment_status", "paid");
    formData.append("notes", form.notes);
    formData.append("pdf_name", fileName);
    formData.append("pdf_path", existingPath);
  }

  function validateClientForm(form: PayrollFormState) {
    if (!form.employeeId || !form.paymentDate || !form.salary) {
      return "Employee, Payroll Date, and Basic Salary are required.";
    }

    const salary = toNumber(form.salary);
    const hardship = toNumber(form.hardshipAllowance);
    const deductions = toNumber(form.deductions);

    if (salary < 0 || hardship < 0 || deductions < 0) {
      return "Salary values cannot be negative.";
    }

    if (deductions > salary + hardship) {
      return "Deductions cannot exceed total earnings (Basic Salary + Hardship Allowance).";
    }

    return null;
  }

  async function handlePayrollSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateClientForm(payrollForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const formData = new FormData();
    appendPayrollFormData(formData, payrollForm, payrollFile?.fileName || "");

    try {
      const result = await createPayroll(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (payrollFile && result.payrollRecord) {
        storePdfAttachment(result.payrollRecord.id, payrollFile);
      }

      toast.success("Payroll record added");
      setPayrollForm(EMPTY_FORM);
      setPayrollFile(null);
      await refreshPayroll();
    } catch (err) {
      toast.error(String(err || "Failed to create payroll record"));
    }
  }

  function openView(record: PayrollRecord) {
    setViewingRecord(record);
    setViewOpen(true);
  }

  function openEdit(record: PayrollRecord) {
    setEditingRecord(record);
    setEditForm({
      employeeId: record.employee_id,
      paymentDate: record.payment_date || "",
      salary: String(record.salary ?? ""),
      hardshipAllowance: String(record.hardship_allowance ?? 0),
      deductions: String(record.deductions ?? 0),
      paymentStatus: record.payment_status,
      notes: record.notes || "",
    });
    setEditFile(getPdfAttachment(record.id));
    setEditFileChanged(false);
    setEditOpen(true);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRecord) return;

    const validationError = validateClientForm(editForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const nextFileName = editFileChanged
      ? editFile?.fileName || ""
      : editFile?.fileName || editingRecord.pdf_name || "";

    const formData = new FormData();
    formData.append("id", editingRecord.id);
    appendPayrollFormData(
      formData,
      editForm,
      nextFileName,
      editingRecord.pdf_path || "",
    );

    try {
      const result = await updatePayroll(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (editFileChanged) {
        if (editFile) {
          storePdfAttachment(editingRecord.id, editFile);
        } else {
          revokePdfAttachment(editingRecord.id);
        }
      }

      toast.success("Payroll record updated");
      setEditOpen(false);
      setEditingRecord(null);
      setEditFile(null);
      setEditFileChanged(false);
      await refreshPayroll();
    } catch (err) {
      toast.error(String(err || "Failed to update payroll record"));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      const formData = new FormData();
      formData.append("id", deleteTarget.id);
      const result = await deletePayroll(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      revokePdfAttachment(deleteTarget.id);
      toast.success("Payroll record deleted");
      setDeleteTarget(null);
      await refreshPayroll();
    } catch (err) {
      toast.error(String(err || "Failed to delete payroll record"));
    }
  }

  function handleDownload(recordId: string) {
    const downloaded = downloadPdfAttachment(recordId);
    if (!downloaded) {
      toast.error("File is no longer available in this session.");
    }
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-secondary-muted">
        Loading payroll data...
      </div>
    );
  }

  const viewingAttachment = viewingRecord
    ? getPdfAttachment(viewingRecord.id)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Payroll Management
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Create and manage employee payroll records.
        </p>
      </div>

      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#0f766e]">Payroll Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Add Payroll Record
              </h3>
              <p className="text-sm text-slate-500">
                Track salary components and payment status.
              </p>
            </div>

            <form onSubmit={handlePayrollSubmit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payroll-employee">Employee</Label>
                  <select
                    id="payroll-employee"
                    value={payrollForm.employeeId}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        employeeId: event.target.value,
                      }))
                    }
                    className={selectClassName}
                    required
                  >
                    <option value="">Select Employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payroll-date">Payroll Date</Label>
                  <Input
                    id="payroll-date"
                    type="date"
                    value={payrollForm.paymentDate}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        paymentDate: event.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payroll-salary">Basic Salary</Label>
                  <Input
                    id="payroll-salary"
                    type="number"
                    min={0}
                    step="0.01"
                    value={payrollForm.salary}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        salary: event.target.value,
                      }))
                    }
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payroll-hardship">Hardship Allowance</Label>
                  <Input
                    id="payroll-hardship"
                    type="number"
                    min={0}
                    step="0.01"
                    value={payrollForm.hardshipAllowance}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        hardshipAllowance: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payroll-deductions">Deductions</Label>
                  <Input
                    id="payroll-deductions"
                    type="number"
                    min={0}
                    step="0.01"
                    value={payrollForm.deductions}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        deductions: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Net Salary</Label>
                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                    {formatCurrency(createNetSalary)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payroll-notes">Notes</Label>
                <Textarea
                  id="payroll-notes"
                  value={payrollForm.notes}
                  onChange={(event) =>
                    setPayrollForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Notes"
                  rows={5}
                />
              </div>

              <PdfAttachmentInput
                label="Attach Payroll Document"
                description="PDF, DOC, or DOCX. Maximum size 10 MB."
                chooseLabel="Choose File"
                accept={PAYROLL_ACCEPT}
                validateFile={validatePayrollDocumentFile}
                value={payrollFile}
                onChange={setPayrollFile}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  Add Payroll Record
                </Button>
              </div>
            </form>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">
              Payroll Records
            </h3>

            {recentPayrollRecords.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No payroll records found for the last two months.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Payroll Date</TableHead>
                      <TableHead>Basic Salary</TableHead>
                      <TableHead>Hardship Allowance</TableHead>
                      <TableHead>Deductions</TableHead>
                      <TableHead>Net Salary</TableHead>
                      <TableHead>Payment Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentPayrollRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          {employeeName(record.employee_id)}
                        </TableCell>
                        <TableCell>
                          {record.payment_date || "—"}
                        </TableCell>
                        <TableCell>{formatCurrency(record.salary)}</TableCell>
                        <TableCell>
                          {formatCurrency(record.hardship_allowance || 0)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(record.deductions || 0)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(calculateNetSalary(record))}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(record.payment_status)}
                          >
                            {statusLabel(record.payment_status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-1 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openView(record)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(record)}
                          >
                            <Edit className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(record.id)}
                          >
                            <Download className="mr-1 h-4 w-4" />
                            Download
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(record)}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Payroll Details</DialogTitle>
            <DialogDescription>
              Review the selected payroll record.
            </DialogDescription>
          </DialogHeader>
          {viewingRecord ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-slate-500">Employee Name</p>
                  <p className="font-medium">
                    {employeeName(viewingRecord.employee_id)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Payroll Date</p>
                  <p className="font-medium">
                    {viewingRecord.payment_date || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Basic Salary</p>
                  <p className="font-medium">
                    {formatCurrency(viewingRecord.salary)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Hardship Allowance</p>
                  <p className="font-medium">
                    {formatCurrency(viewingRecord.hardship_allowance || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Deductions</p>
                  <p className="font-medium">
                    {formatCurrency(viewingRecord.deductions || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Net Salary</p>
                  <p className="font-medium">
                    {formatCurrency(calculateNetSalary(viewingRecord))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Payment Status</p>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(viewingRecord.payment_status)}
                  >
                    {statusLabel(viewingRecord.payment_status)}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-slate-500">Notes</p>
                <p className="whitespace-pre-wrap font-medium">
                  {viewingRecord.notes || "—"}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-slate-500">Attached Payroll Document</p>
                {viewingAttachment || viewingRecord.pdf_name ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-3">
                    <span className="font-medium">
                      {viewingAttachment?.fileName || viewingRecord.pdf_name}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(viewingRecord.id)}
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
            setEditingRecord(null);
            setEditFile(null);
            setEditFileChanged(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Edit Payroll Record</DialogTitle>
            <DialogDescription>
              Update payroll details and recalculate net salary.
            </DialogDescription>
          </DialogHeader>
          {editingRecord ? (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-payroll-employee">Employee</Label>
                  <select
                    id="edit-payroll-employee"
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
                    <option value="">Select Employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-payroll-date">Payroll Date</Label>
                  <Input
                    id="edit-payroll-date"
                    type="date"
                    value={editForm.paymentDate}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        paymentDate: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-payroll-salary">Basic Salary</Label>
                  <Input
                    id="edit-payroll-salary"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.salary}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        salary: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-payroll-hardship">
                    Hardship Allowance
                  </Label>
                  <Input
                    id="edit-payroll-hardship"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.hardshipAllowance}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        hardshipAllowance: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-payroll-deductions">Deductions</Label>
                  <Input
                    id="edit-payroll-deductions"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.deductions}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        deductions: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Net Salary</Label>
                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                    {formatCurrency(editNetSalary)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-payroll-notes">Notes</Label>
                <Textarea
                  id="edit-payroll-notes"
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
                label="Attach Payroll Document"
                description="PDF, DOC, or DOCX. Maximum size 10 MB."
                chooseLabel="Choose File"
                accept={PAYROLL_ACCEPT}
                validateFile={validatePayrollDocumentFile}
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
            <DialogTitle>Delete Payroll Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payroll record for{" "}
              {deleteTarget
                ? employeeName(deleteTarget.employee_id)
                : "this employee"}
              ? This action cannot be undone.
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
