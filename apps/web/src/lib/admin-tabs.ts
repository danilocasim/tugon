export const ADMIN_TABS = {
  staff: "Staff & roles",
  targets: "Targets & routing",
  referrals: "Referral offices",
  sms: "SMS log",
  privacy: "Data privacy",
  audit: "Audit log",
} as const;
export type AdminTab = keyof typeof ADMIN_TABS;
