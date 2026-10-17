import { api, apiResponse, type Page } from "./api";

export const sections = [
  ["club", "Клуб"],
  ["photos", "Фото"],
  ["halls", "Залы"],
  ["tariffs", "Тарифы"],
  ["menu", "Меню"],
  ["rules", "Правила"],
] as const;
export type Section = (typeof sections)[number][0];
export type ReviewState =
  "IN_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "WITHDRAWN" | "REJECTED";
export type Decision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";
export type Feedback = { field: string; message: string };
export type Review = {
  submissionId: string;
  revision: number;
  checkedSections: Section[];
  feedback: Feedback[];
  updatedBy: string | null;
  updatedAt: string | null;
  readyToApprove: boolean;
};
export type Address = {
  marketId: string;
  addressLine: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
  weeklyHours: {
    dayOfWeek: number;
    opens: string;
    closes: string;
    endDayOffset: number;
  }[];
};
export type Card = {
  submissionId: string;
  clubId: string;
  revision: number;
  state: ReviewState;
  submittedBy: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewerAudience: string | null;
  feedback: Feedback[];
  rejectionReason: string | null;
  clubName: string;
  address: Address;
  hallCount: number;
  coverUrl: string | null;
};
export type Hall = {
  hallId: string;
  bookingUnit: string;
  categoryTitle: string;
  details: {
    categoryId: string;
    name: string;
    description: string;
    equipment: string;
    photoMediaIds: string[];
    capacityPerUnit?: number;
  };
  layout: {
    initialized: boolean;
    columns: number;
    rows: number;
    entranceSide?: string;
    placements: {
      resourceId: string;
      code: string;
      column: number;
      row: number;
      facing: string;
    }[];
  };
  tariffs: Tariff[];
  games: { gameId: string; title: string }[];
};
type Rate = {
  id: string;
  name: string;
  date: string | null;
  days: number[];
  startMinute: number;
  endMinute: number;
  amountMinor: number;
  kind?: string;
  basis?: string;
  durationMinutes?: number;
};
export type Tariff = {
  versionId: string;
  revision: number;
  effectiveFrom: string;
  timezone: string;
  plan: {
    currency: string;
    baseHourlyMinor: number | null;
    rates: Rate[];
    offers: Rate[];
  };
};
export type MenuItem = {
  id: string;
  name: string;
  description: string;
  kind: string;
  state: string;
  pricing: string;
  unit: string;
  amountMinor: number;
  maxQuantity: number;
  mediaId?: string;
  categoryIds: string[];
};
export type Submission = Card & {
  snapshot: {
    profile: {
      name: string;
      description: string;
      phone: string;
      email?: string;
      logoMediaId?: string;
      coverMediaId?: string;
      galleryMediaIds: string[];
    };
    address: Address;
    policies: {
      payOnSite: boolean;
      onlinePayment: boolean;
      visitingRules: string;
    };
    halls: Hall[];
    menu: { catalog: { currency: string; items: MenuItem[] } };
    acceptingBookings: boolean;
  };
  review: Review;
  media: {
    mediaId: string;
    contentType: string;
    sizeBytes: number;
    url: string;
  }[];
};
export type Counts = { total: number; states: Record<ReviewState, number> };
export const submissionPath = (id: string) =>
  `/club-submissions/${encodeURIComponent(id)}`;
export const moderation = {
  queue: (query: URLSearchParams) =>
    api<Page<Card>>(`/club-submissions?${query}`),
  counts: (query: URLSearchParams) =>
    api<Counts>(`/club-submissions/counts?${query}`),
  get: (id: string) => apiResponse<Submission>(submissionPath(id)),
  history: (id: string, page: number) =>
    api<Page<Card>>(`${submissionPath(id)}/history?page=${page}&size=10`),
  save: (
    id: string,
    etag: string,
    body: Pick<Review, "checkedSections" | "feedback">,
    key: string,
  ) =>
    apiResponse<Review>(`${submissionPath(id)}/review`, "PUT", body, etag, key),
  decide: (
    id: string,
    etag: string,
    decision: Decision,
    feedback: Feedback[],
    key: string,
    reason?: string,
  ) =>
    apiResponse<Submission>(
      `${submissionPath(id)}/decision`,
      "POST",
      decision === "REJECT"
        ? { decision, feedback, reason }
        : { decision, feedback },
      etag,
      key,
    ),
};
export function reviewSignature(checked: Section[], feedback: Feedback[]) {
  return JSON.stringify({ checkedSections: [...checked].sort(), feedback });
}
export function money(minor: number | null | undefined, currency = "UZS") {
  return minor == null
    ? "Не задано"
    : new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(minor / 100);
}
