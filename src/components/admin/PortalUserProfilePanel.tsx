"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  getPortalUserProfile,
  updatePortalUserPassword,
  updatePortalUserPhone,
} from "@/app/actions/user";
import { useDashboardAccess } from "@/contexts/DashboardAccessContext";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

export function PortalUserProfilePanel() {
  const access = useDashboardAccess();
  const { organizationName, switchVersion } = useAdminOrganization();
  const [orgUserCount, setOrgUserCount] = useState<number | null>(null);
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [draftPhone, setDraftPhone] = useState("");
  const [editingPhone, setEditingPhone] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isPhonePending, startPhoneTransition] = useTransition();

  useEffect(() => {
    void getPortalUserProfile().then((result) => {
      if ("error" in result && result.error) return;
      if ("profile" in result && result.profile) {
        setOrgUserCount(result.profile.organization_user_count);
        const phone = result.profile.phone?.trim() || null;
        setSavedPhone(phone);
        setDraftPhone(phone || "");
        setEditingPhone(!phone);
      }
    });
  }, [organizationName, switchVersion]);

  function handlePasswordChange(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    startTransition(async () => {
      const result = await updatePortalUserPassword(password);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Password updated");
      setPassword("");
      setConfirmPassword("");
    });
  }

  function handlePhoneSave(event: React.FormEvent) {
    event.preventDefault();
    if (isPhonePending) return;
    startPhoneTransition(async () => {
      const result = await updatePortalUserPhone(draftPhone);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("phone" in result) {
        const phone = result.phone ?? null;
        setSavedPhone(phone);
        setDraftPhone(phone || "");
        setEditingPhone(false);
        toast.success("Phone number saved");
      }
    });
  }

  function handlePhoneCancel() {
    setDraftPhone(savedPhone || "");
    setEditingPhone(!savedPhone);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
          <CardDescription>Your account information for the current organization.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-secondary-muted">Username</Label>
            <p className="mt-1 font-medium text-primary-dark">{access.username}</p>
          </div>
          <div>
            <Label className="text-secondary-muted">Full Name</Label>
            <p className="mt-1 font-medium text-primary-dark">{access.fullName || "—"}</p>
          </div>
          <div>
            <Label className="text-secondary-muted">Organization</Label>
            <p className="mt-1 font-medium text-primary-dark">{organizationName || "—"}</p>
          </div>
          <div>
            <Label className="text-secondary-muted">Users in Organization</Label>
            <p className="mt-1 font-medium text-primary-dark">
              {orgUserCount === null ? "…" : orgUserCount}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phone Number</CardTitle>
          <CardDescription>
            {savedPhone && !editingPhone
              ? "Your saved contact number."
              : "Enter your phone number"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {savedPhone && !editingPhone ? (
            <div className="flex flex-wrap items-center justify-between gap-3 max-w-md">
              <p className="font-medium text-primary-dark">{savedPhone}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraftPhone(savedPhone);
                  setEditingPhone(true);
                }}
              >
                Edit
              </Button>
            </div>
          ) : (
            <form onSubmit={handlePhoneSave} className="grid gap-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Phone Number</Label>
                <Input
                  id="profile-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={draftPhone}
                  onChange={(e) => setDraftPhone(e.target.value)}
                  placeholder="+92XXXXXXXXXX"
                  disabled={isPhonePending}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isPhonePending}>
                  {isPhonePending ? "Saving..." : "Save"}
                </Button>
                {savedPhone ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPhonePending}
                    onClick={handlePhoneCancel}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your login password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="grid gap-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
