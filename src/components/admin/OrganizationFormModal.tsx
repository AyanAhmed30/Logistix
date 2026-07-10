'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, PlusCircle, Trash2 } from 'lucide-react';
import type { Organization } from '@/app/actions/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type OrganizationBranch = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
};

type OrganizationFormModalProps = {
  mode: 'create' | 'edit';
  organization?: Organization | null;
  status: 'active' | 'inactive';
  onStatusChange: (status: 'active' | 'inactive') => void;
  logoPreview: string | null;
  onLogoPreviewChange: (preview: string | null) => void;
  onLogoFileChange: (file: File | null) => void;
};

function parseBranches(value: unknown): OrganizationBranch[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        name: String(row.name || '').trim(),
        street: String(row.street || '').trim(),
        city: String(row.city || '').trim(),
        state: String(row.state || '').trim(),
        zip: String(row.zip || '').trim(),
        country: String(row.country || '').trim(),
        phone: String(row.phone || '').trim(),
      };
    })
    .filter((item): item is OrganizationBranch => Boolean(item?.name));
}

function emptyBranch(): OrganizationBranch {
  return {
    name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    phone: '',
  };
}

export function OrganizationFormModal({
  mode,
  organization,
  status,
  onStatusChange,
  logoPreview,
  onLogoPreviewChange,
  onLogoFileChange,
}: OrganizationFormModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'branches'>('general');
  const [branches, setBranches] = useState<OrganizationBranch[]>([]);

  useEffect(() => {
    setBranches(parseBranches(organization?.branches));
    setActiveTab('general');
  }, [organization]);

  const logoDisplay = logoPreview || organization?.logo_url || null;

  function handleLogoSelect(file: File | null) {
    onLogoFileChange(file);
    if (!file) {
      onLogoPreviewChange(organization?.logo_url || null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onLogoPreviewChange(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  const branchesJson = useMemo(() => JSON.stringify(branches), [branches]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="h-28 w-28 shrink-0 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 overflow-hidden flex flex-col items-center justify-center text-secondary-muted"
        >
          {logoDisplay ? (
            <Image
              src={logoDisplay}
              alt="Organization logo"
              width={112}
              height={112}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <>
              <Camera className="h-6 w-6 mb-1" />
              <span className="text-xs">Your logo</span>
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
        <div className="flex-1 w-full space-y-2">
          <Label htmlFor="organization_name">Company Name *</Label>
          <Input
            id="organization_name"
            name="organization_name"
            defaultValue={organization?.organization_name ?? ''}
            placeholder="e.g. My Company"
            required
          />
        </div>
      </div>

      <div className="border-b">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={activeTab === 'general' ? 'default' : 'ghost'}
            className="rounded-b-none"
            onClick={() => setActiveTab('general')}
          >
            General Information
          </Button>
          <Button
            type="button"
            variant={activeTab === 'branches' ? 'default' : 'ghost'}
            className="rounded-b-none"
            onClick={() => setActiveTab('branches')}
          >
            Branches
          </Button>
        </div>
      </div>

      {activeTab === 'general' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-primary-dark">Address</Label>
              <div className="space-y-2">
                <Input
                  name="street"
                  defaultValue={organization?.street || organization?.address || ''}
                  placeholder="Street..."
                />
                <Input name="street_2" defaultValue={organization?.street_2 ?? ''} placeholder="Street 2..." />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input name="city" defaultValue={organization?.city ?? ''} placeholder="City" />
                  <Input name="state" defaultValue={organization?.state ?? ''} placeholder="State" />
                  <Input name="zip" defaultValue={organization?.zip ?? ''} placeholder="ZIP" />
                </div>
                <Input name="country" defaultValue={organization?.country ?? ''} placeholder="Country" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" name="phone" defaultValue={organization?.phone ?? ''} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={organization?.email ?? ''}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                defaultValue={organization?.website ?? ''}
                placeholder="e.g. https://www.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={organization?.description ?? ''}
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

      <div className="border-t pt-4 space-y-4">
        <Label className="text-sm font-semibold text-primary-dark">Login Credentials</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              name="username"
              defaultValue={organization?.username ?? ''}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password {mode === 'create' ? '*' : ''}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required={mode === 'create'}
              placeholder={mode === 'edit' ? 'Leave blank to keep current password' : ''}
            />
          </div>
        </div>
        <div className="space-y-2 max-w-xs">
          <Label>Status</Label>
          <Select value={status} onValueChange={(value: 'active' | 'inactive') => onStatusChange(value)}>
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
