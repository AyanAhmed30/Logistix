"use client";

import type { Employee } from "@/app/actions/employees";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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

interface ViewEmployeeProfileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  isLoading: boolean;
}

function formatNull(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="font-medium break-words">{formatNull(value)}</p>
    </div>
  );
}

export function ViewEmployeeProfile({
  open,
  onOpenChange,
  employee,
  isLoading,
}: ViewEmployeeProfileProps) {
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">Employee Profile</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center text-secondary-muted">
            Loading employee details...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!employee) {
    return null;
  }

  const hasWorkExperience =
    employee.company_name || employee.job_title || employee.duration;

  const hasEducation =
    employee.institute_name ||
    employee.degree_diploma ||
    employee.specialization;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-[900px] p-0 overflow-hidden flex flex-col">
        <div className="flex-shrink-0 border-b bg-white p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl">Employee Profile</DialogTitle>
          </DialogHeader>
          <div>
            <h2 className="text-2xl font-bold">{employee.full_name}</h2>
            <p className="text-slate-600">{employee.employee_id || "—"}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Full Name" value={employee.full_name} />
                  <Field label="Username" value={employee.username} />
                  <Field label="Email Address" value={employee.email} />
                  <Field label="Phone" value={employee.phone} />
                  <Field label="Employee ID" value={employee.employee_id} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Employment Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Department" value={employee.department} />
                  <Field label="Designation" value={employee.designation} />
                  <Field
                    label="Employment Type"
                    value={formatLabel(employee.employment_type)}
                  />
                  <Field
                    label="Employment Status"
                    value={formatLabel(employee.status)}
                  />
                  <Field label="Date of Joining" value={employee.joining_date} />
                </div>
                {employee.job_description ? (
                  <div className="mt-6 border-t border-slate-200 pt-4">
                    <p className="mb-2 text-sm text-slate-500">Job Description</p>
                    <p className="whitespace-pre-wrap break-words font-medium">
                      {employee.job_description}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Shift Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Shift Timing" value={employee.shift_timing} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Reporting Hierarchy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Reporting Manager"
                    value={employee.reporting_manager}
                  />
                  <Field
                    label="Secondary Reporting Manager"
                    value={employee.secondary_reporting_manager}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Personal Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Date of Birth" value={employee.date_of_birth} />
                  <Field label="Age" value={employee.age} />
                  <Field label="Gender" value={formatLabel(employee.gender)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Education</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden">
                {hasEducation ? (
                  <Table className="w-full" style={{ tableLayout: "fixed" }}>
                    <TableHeader>
                      <TableRow>
                        <TableHead style={{ width: "35%" }}>
                          Institute Name
                        </TableHead>
                        <TableHead style={{ width: "30%" }}>
                          Degree / Diploma
                        </TableHead>
                        <TableHead style={{ width: "35%" }}>
                          Specialization
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="align-top break-words whitespace-normal">
                          {formatNull(employee.institute_name)}
                        </TableCell>
                        <TableCell className="align-top break-words whitespace-normal">
                          {formatNull(employee.degree_diploma)}
                        </TableCell>
                        <TableCell className="align-top break-words whitespace-normal">
                          {formatNull(employee.specialization)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-slate-500">No education records available.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Work Experience</CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden">
                {hasWorkExperience ? (
                  <Table className="w-full" style={{ tableLayout: "fixed" }}>
                    <TableHeader>
                      <TableRow>
                        <TableHead style={{ width: "25%" }}>
                          Company Name
                        </TableHead>
                        <TableHead style={{ width: "25%" }}>Job Title</TableHead>
                        <TableHead style={{ width: "15%" }}>Duration</TableHead>
                        <TableHead style={{ width: "35%" }}>
                          Job Description
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="align-top break-words whitespace-normal">
                          {formatNull(employee.company_name)}
                        </TableCell>
                        <TableCell className="align-top break-words whitespace-normal">
                          {formatNull(employee.job_title)}
                        </TableCell>
                        <TableCell className="align-top break-words whitespace-normal">
                          {formatNull(employee.duration)}
                        </TableCell>
                        <TableCell className="align-top break-words whitespace-normal">
                          {formatNull(employee.job_description)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-slate-500">
                    No work experience available.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
