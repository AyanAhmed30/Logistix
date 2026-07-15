"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, PlusCircle, Trash2 } from "lucide-react";
import type { Organization } from "@/app/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OrganizationBranch = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
};

type OrganizationCompanyFormProps = {
  mode: "create" | "edit";
  organization?: Organization | null;
  status: "active" | "inactive";
  onStatusChange: (status: "active" | "inactive") => void;
  logoPreview: string | null;
  onLogoPreviewChange: (preview: string | null) => void;
  onLogoFileChange: (file: File | null) => void;
  /** Full-page create uses a slightly larger logo/header treatment */
  layout?: "page" | "compact";
};

function parseBranches(value: unknown): OrganizationBranch[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        name: String(row.name || "").trim(),
        street: String(row.street || "").trim(),
        city: String(row.city || "").trim(),
        state: String(row.state || "").trim(),
        zip: String(row.zip || "").trim(),
        country: String(row.country || "").trim(),
        phone: String(row.phone || "").trim(),
      };
    })
    .filter((item): item is OrganizationBranch => Boolean(item?.name));
}

function emptyBranch(): OrganizationBranch {
  return {
    name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "",
    phone: "",
  };
}

export function OrganizationCompanyForm({
  mode,
  organization,
  status,
  onStatusChange,
  logoPreview,
  onLogoPreviewChange,
  onLogoFileChange,
  layout = "compact",
}: OrganizationCompanyFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"general" | "branches">("general");
  const [branches, setBranches] = useState<OrganizationBranch[]>(() =>
    parseBranches(organization?.branches)
  );
  const [companyColor, setCompanyColor] = useState("#218C94");
  const [currency, setCurrency] = useState("PKR");

  const logoDisplay = logoPreview || organization?.logo_url || null;
  const isPage = layout === "page";
  const logoSize = isPage ? "h-36 w-36 md:h-40 md:w-40" : "h-28 w-28";

  function handleLogoSelect(file: File | null) {
    onLogoFileChange(file);
    if (!file) {
      onLogoPreviewChange(organization?.logo_url || null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onLogoPreviewChange(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  const branchesJson = useMemo(() => JSON.stringify(branches), [branches]);

  return (
    <div className={isPage ? "space-y-8" : "space-y-5"}>
      {/* Odoo-style header: logo left, company name right */}
      <div className={`flex flex-col gap-5 ${isPage ? "sm:flex-row sm:items-start" : "sm:flex-row sm:items-start"}`}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`${logoSize} shrink-0 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 overflow-hidden flex flex-col items-center justify-center text-secondary-muted transition-colors`}
          title="Upload company logo"
        >
          {logoDisplay ? (
            <Image
              src={logoDisplay}
              alt="Organization logo"
              width={160}
              height={160}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <>
              <Camera className={`mb-1 ${isPage ? "h-8 w-8" : "h-6 w-6"}`} />
              <span className="text-xs font-medium">Company Logo</span>
              <span className="text-[10px] mt-0.5 px-2 text-center">Binary / Image Upload</span>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleLogoSelect(event.target.files?.[0] || null)}
        />
        <div className="flex-1 w-full space-y-2 pt-1">
          <Label htmlFor="organization_name" className="text-secondary-muted text-xs uppercase tracking-wide">
            Company Name *
          </Label>
          <Input
            id="organization_name"
            name="organization_name"
            defaultValue={organization?.organization_name ?? ""}
            placeholder="e.g. My Company"
            required
            className={
              isPage
                ? "h-12 text-xl md:text-2xl font-semibold border-0 border-b border-slate-200 rounded-none px-0 shadow-none focus-visible:ring-0 focus-visible:border-primary-accent"
                : undefined
            }
          />
        </div>
      </div>

      {/* Notebook-style tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          <Button
            type="button"
            variant={activeTab === "general" ? "default" : "ghost"}
            className="rounded-b-none shrink-0"
            onClick={() => setActiveTab("general")}
          >
            General Information
          </Button>
          <Button
            type="button"
            variant={activeTab === "branches" ? "default" : "ghost"}
            className="rounded-b-none shrink-0"
            onClick={() => setActiveTab("branches")}
          >
            Branches
          </Button>
        </div>
      </div>

      {activeTab === "general" ? (
        <div className={`grid grid-cols-1 gap-8 ${isPage ? "lg:grid-cols-2 lg:gap-10" : "lg:grid-cols-2 gap-6"}`}>
          {/* Left column — Address */}
          <div className="space-y-5">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-primary-dark">Address</Label>
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="street" className="text-xs text-secondary-muted">
                    Street
                  </Label>
                  <Input
                    id="street"
                    name="street"
                    defaultValue={organization?.street || organization?.address || ""}
                    placeholder="Street..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="street_2" className="text-xs text-secondary-muted">
                    Street 2
                  </Label>
                  <Input
                    id="street_2"
                    name="street_2"
                    defaultValue={organization?.street_2 ?? ""}
                    placeholder="Street 2..."
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-xs text-secondary-muted">
                      City
                    </Label>
                    <Input id="city" name="city" defaultValue={organization?.city ?? ""} placeholder="City" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-xs text-secondary-muted">
                      State
                    </Label>
                    <Input id="state" name="state" defaultValue={organization?.state ?? ""} placeholder="State" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zip" className="text-xs text-secondary-muted">
                      ZIP
                    </Label>
                    <Input id="zip" name="zip" defaultValue={organization?.zip ?? ""} placeholder="ZIP" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country" className="text-xs text-secondary-muted">
                    Country
                  </Label>
                  <Input
                    id="country"
                    name="country"
                    defaultValue={organization?.country ?? ""}
                    placeholder="Country"
                  />
                </div>
              </div>
            </div>

            {isPage ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold text-primary-dark">Branches</Label>
                    <p className="text-xs text-secondary-muted mt-0.5">
                      Manage branch locations from the Branches tab.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("branches")}>
                    Open Branches
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Right column — contact / company meta */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ntn">NTN</Label>
              <Input id="ntn" name="ntn" placeholder="National Tax Number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={currency}
                onValueChange={(value) => setCurrency(value)}
              >
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PKR">PKR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="currency" value={currency} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" name="phone" defaultValue={organization?.phone ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={organization?.email ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                defaultValue={organization?.website ?? ""}
                placeholder="e.g. https://www.odoo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_domain">Email Domain</Label>
              <Input
                id="email_domain"
                name="email_domain"
                placeholder="netpulse.odoo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="color"
                  name="color"
                  type="color"
                  value={companyColor}
                  onChange={(e) => setCompanyColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white p-1"
                />
                <Input
                  value={companyColor}
                  onChange={(e) => setCompanyColor(e.target.value)}
                  className="max-w-[140px] font-mono text-sm"
                  aria-label="Color hex value"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={organization?.description ?? ""}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-primary-dark">Branches</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBranches((prev) => [...prev, emptyBranch()])}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Branch
            </Button>
          </div>

          {branches.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-secondary-muted">
              No branches added yet.
            </div>
          ) : (
            <div className="space-y-4">
              {branches.map((branch, index) => (
                <div key={`branch-${index}`} className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Branch {index + 1}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setBranches((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    value={branch.name}
                    onChange={(e) =>
                      setBranches((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, name: e.target.value } : item))
                      )
                    }
                    placeholder="Branch name"
                  />
                  <Input
                    value={branch.street}
                    onChange={(e) =>
                      setBranches((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, street: e.target.value } : item))
                      )
                    }
                    placeholder="Street"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input
                      value={branch.city}
                      onChange={(e) =>
                        setBranches((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, city: e.target.value } : item))
                        )
                      }
                      placeholder="City"
                    />
                    <Input
                      value={branch.state}
                      onChange={(e) =>
                        setBranches((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, state: e.target.value } : item))
                        )
                      }
                      placeholder="State"
                    />
                    <Input
                      value={branch.zip}
                      onChange={(e) =>
                        setBranches((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, zip: e.target.value } : item))
                        )
                      }
                      placeholder="ZIP"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      value={branch.country}
                      onChange={(e) =>
                        setBranches((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, country: e.target.value } : item))
                        )
                      }
                      placeholder="Country"
                    />
                    <Input
                      value={branch.phone}
                      onChange={(e) =>
                        setBranches((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, phone: e.target.value } : item))
                        )
                      }
                      placeholder="Phone"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <input type="hidden" name="branches_json" value={branchesJson} />
      {organization?.logo_url ? (
        <input type="hidden" name="existing_logo_url" value={organization.logo_url} />
      ) : null}

      {/* Username / Password — preserved exactly as existing implementation */}
      <div className="border-t border-slate-200 pt-4 space-y-4">
        <Label className="text-sm font-semibold text-primary-dark">Login Credentials</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              name="username"
              defaultValue={organization?.username ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password {mode === "create" ? "*" : ""}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required={mode === "create"}
              placeholder={mode === "edit" ? "Leave blank to keep current password" : ""}
            />
          </div>
        </div>
        <div className="space-y-2 max-w-xs">
          <Label>Status</Label>
          <Select value={status} onValueChange={(value: "active" | "inactive") => onStatusChange(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer OrganizationCompanyForm — kept as alias for existing imports */
export const OrganizationFormModal = OrganizationCompanyForm;
