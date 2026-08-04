import type { Agency } from "@/lib/ad-agency-store";

export type { Agency };

export type AgencyFormState = {
  name: string;
  platform: Agency["platform"];
  rebateRate: string;
  rebatePeriod: "月" | "季";
  settlementCurrency: "USD" | "CNY";
  creditTerm: string;
  contact: string;
  phone: string;
  notes: string;
};

export const AGENCY_PLATFORM_OPTIONS: { value: Agency["platform"]; label: string }[] = [
  { value: "FB", label: "Facebook" },
  { value: "Google", label: "Google" },
  { value: "TikTok", label: "TikTok" },
  { value: "其他", label: "其他" },
];

export const initialAgencyFormState: AgencyFormState = {
  name: "",
  platform: "TikTok",
  rebateRate: "",
  rebatePeriod: "月",
  settlementCurrency: "USD",
  creditTerm: "",
  contact: "",
  phone: "",
  notes: "",
};
