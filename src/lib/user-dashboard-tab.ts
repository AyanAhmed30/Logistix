export const USER_DASHBOARD_TABS = [
  "book",
  "history",
  "tracking",
  "loading",
] as const;

export type UserDashboardTab = (typeof USER_DASHBOARD_TABS)[number];

const LEGACY_TAB_REDIRECT: Record<string, UserDashboardTab> = {
  reinward: "tracking",
  scanned: "tracking",
};

export function isUserDashboardTab(value: string | null | undefined): value is UserDashboardTab {
  return Boolean(value && USER_DASHBOARD_TABS.includes(value as UserDashboardTab));
}

export function parseUserDashboardTab(value: string | null | undefined): UserDashboardTab {
  if (isUserDashboardTab(value)) return value;
  if (value && value in LEGACY_TAB_REDIRECT) {
    return LEGACY_TAB_REDIRECT[value];
  }
  return "book";
}
