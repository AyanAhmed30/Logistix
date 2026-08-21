"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Employee } from "@/app/actions/employees";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on_leave", label: "On Leave" },
  { value: "suspended", label: "Suspended" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
] as const;

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "permanent", label: "Permanent" },
  { value: "probation", label: "Probation" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "part_time", label: "Part Time" },
  { value: "full_time", label: "Full Time" },
  { value: "internee", label: "Internee" },
] as const;

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

type EmployeeProfileFormFieldsProps = {
  idPrefix: string;
  employee?: Employee | null;
  /** `basic` = create-dialog fields for this phase; `full` = complete profile form. */
  variant?: "basic" | "full";
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-900">
      {children}
    </h3>
  );
}

export function EmployeeProfileFormFields({
  idPrefix,
  employee,
  variant = "full",
}: EmployeeProfileFormFieldsProps) {
  const isBasic = variant === "basic";

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <SectionTitle>Personal Information</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-full-name`}>Full Name</Label>
            <Input
              id={`${idPrefix}-full-name`}
              name="fullName"
              placeholder="Ayesha Khan"
              defaultValue={employee?.full_name || ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-username`}>Username</Label>
            <Input
              id={`${idPrefix}-username`}
              name="username"
              placeholder="ayesha"
              defaultValue={employee?.username || ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-email`}>Email</Label>
            <Input
              id={`${idPrefix}-email`}
              name="email"
              type="email"
              placeholder="ayesha@company.com"
              defaultValue={employee?.email || ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-phone`}>Phone</Label>
            <Input
              id={`${idPrefix}-phone`}
              name="phone"
              placeholder="03XX-XXXXXXX"
              defaultValue={employee?.phone || ""}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Employment Information</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-department`}>Department</Label>
            <Input
              id={`${idPrefix}-department`}
              name="department"
              placeholder="Human Resources"
              defaultValue={employee?.department || ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-designation`}>Designation</Label>
            <Input
              id={`${idPrefix}-designation`}
              name="designation"
              placeholder="HR Coordinator"
              defaultValue={employee?.designation || ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-employee-id`}>Employee ID</Label>
            <Input
              id={`${idPrefix}-employee-id`}
              name="employeeId"
              placeholder="EMP-1001"
              defaultValue={employee?.employee_id || ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-status`}>Employment Status</Label>
            <select
              id={`${idPrefix}-status`}
              name="status"
              defaultValue={employee?.status || "active"}
              className={selectClassName}
              required
            >
              {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-employment-type`}>Employment Type</Label>
            <select
              id={`${idPrefix}-employment-type`}
              name="employmentType"
              defaultValue={employee?.employment_type || ""}
              className={selectClassName}
            >
              <option value="">Select employment type</option>
              {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-joining-date`}>Date of Joining</Label>
            <Input
              id={`${idPrefix}-joining-date`}
              name="joiningDate"
              type="date"
              defaultValue={employee?.joining_date || ""}
            />
          </div>
          {!isBasic ? (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${idPrefix}-job-description`}>Job Description</Label>
              <textarea
                id={`${idPrefix}-job-description`}
                name="jobDescription"
                placeholder="Describe the employee's responsibilities and role within the company..."
                defaultValue={employee?.job_description || ""}
                rows={6}
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm overflow-wrap-break-word break-words whitespace-pre-wrap"
                style={{
                  resize: "vertical",
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              />
            </div>
          ) : null}
        </div>
      </section>

      {!isBasic ? (
        <>
          <section className="space-y-4">
            <SectionTitle>Shift Information</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`${idPrefix}-shift-timing`}>Shift Timing</Label>
                <Input
                  id={`${idPrefix}-shift-timing`}
                  name="shiftTiming"
                  placeholder="9:00 AM - 5:00 PM"
                  defaultValue={employee?.shift_timing || ""}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle>Reporting Hierarchy</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-reporting-manager`}>
                  Reporting Manager
                </Label>
                <Input
                  id={`${idPrefix}-reporting-manager`}
                  name="reportingManager"
                  placeholder="Manager name"
                  defaultValue={employee?.reporting_manager || ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-secondary-reporting-manager`}>
                  Secondary Reporting Manager
                </Label>
                <Input
                  id={`${idPrefix}-secondary-reporting-manager`}
                  name="secondaryReportingManager"
                  placeholder="Secondary manager name"
                  defaultValue={employee?.secondary_reporting_manager || ""}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle>Personal Details</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-date-of-birth`}>Date of Birth</Label>
                <Input
                  id={`${idPrefix}-date-of-birth`}
                  name="dateOfBirth"
                  type="date"
                  defaultValue={employee?.date_of_birth || ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-age`}>Age</Label>
                <Input
                  id={`${idPrefix}-age`}
                  name="age"
                  type="number"
                  min={0}
                  placeholder="25"
                  defaultValue={employee?.age ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-gender`}>Gender</Label>
                <select
                  id={`${idPrefix}-gender`}
                  name="gender"
                  defaultValue={employee?.gender || ""}
                  className={selectClassName}
                >
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle>Education</SectionTitle>
            {/* Single record for now — wrap additional entries the same way later. */}
            <div
              data-education-record="0"
              className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`${idPrefix}-institute-name`}>
                    Institute Name
                  </Label>
                  <Input
                    id={`${idPrefix}-institute-name`}
                    name="instituteName"
                    placeholder="University name"
                    defaultValue={employee?.institute_name || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-degree-diploma`}>
                    Degree / Diploma
                  </Label>
                  <Input
                    id={`${idPrefix}-degree-diploma`}
                    name="degreeDiploma"
                    placeholder="Bachelor of Science"
                    defaultValue={employee?.degree_diploma || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-specialization`}>
                    Specialization
                  </Label>
                  <Input
                    id={`${idPrefix}-specialization`}
                    name="specialization"
                    placeholder="Computer Science"
                    defaultValue={employee?.specialization || ""}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle>Work Experience</SectionTitle>
            {/* Single record for now — wrap additional entries the same way later. */}
            <div
              data-experience-record="0"
              className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-company-name`}>Company Name</Label>
                  <Input
                    id={`${idPrefix}-company-name`}
                    name="companyName"
                    placeholder="Previous company"
                    defaultValue={employee?.company_name || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-job-title`}>Job Title</Label>
                  <Input
                    id={`${idPrefix}-job-title`}
                    name="jobTitle"
                    placeholder="Software Engineer"
                    defaultValue={employee?.job_title || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-duration`}>Duration</Label>
                  <Input
                    id={`${idPrefix}-duration`}
                    name="duration"
                    placeholder="2 years"
                    defaultValue={employee?.duration || ""}
                  />
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
