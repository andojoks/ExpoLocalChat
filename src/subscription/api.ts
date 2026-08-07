import { apiJson } from '@/api/http';

export type PackCourse = {
  id: string;
  code: string;
  name: string;
  categoryId?: string;
};

export type LearnerPackSummary = {
  id: string;
  examCategoryId: string;
  category: {
    id: string;
    code: string;
    name: string;
    maxSelectableCourses: number;
  };
  selectedCourseIds: string[];
  courses: PackCourse[];
  activeSubscription: {
    id: string;
    status: string;
    startsAt: string;
    expiresAt: string | null;
    entitlementPackId: string;
  } | null;
  subscriptions: Array<{
    id: string;
    status: string;
    startsAt: string;
    expiresAt: string | null;
    entitlementPackId: string;
    createdAt: string;
    payment: {
      id: string;
      provider: string;
      status: string;
      amountCents: number;
      phone: string | null;
      externalRef: string;
      createdAt: string;
      completedAt: string | null;
    } | null;
  }>;
  events: Array<{ id: string; type: string; payload: unknown; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
};

export type BuilderCategory = {
  id: string;
  code: string;
  name: string;
  descriptionMd: string;
  maxSelectableCourses: number;
  courses: PackCourse[];
  sku: {
    id: string;
    name: string;
    priceCents: number;
    durationDays: number;
    maxCoursesPerPack: number;
  } | null;
};

export type MomoProvider = 'MTN_MOMO' | 'ORANGE_MOMO';

export type PaymentHistoryItem = {
  id: string;
  provider: string;
  amountCents: number;
  phone: string | null;
  externalRef: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  pack: {
    id: string;
    category: { id: string; code: string; name: string };
    selectedCourseIds: string[];
    courses: PackCourse[];
  };
  sku: { id: string; name: string; durationDays: number };
  subscription: {
    id: string;
    status: string;
    startsAt: string;
    expiresAt: string | null;
  } | null;
};

export function listMyPacks() {
  return apiJson<{ packs: LearnerPackSummary[] }>('/api/mobile/packs/mine');
}

export function fetchBuilderCatalog() {
  return apiJson<{ categories: BuilderCategory[] }>('/api/mobile/packs/catalog');
}

export function getLearnerPack(id: string) {
  return apiJson<LearnerPackSummary>(`/api/mobile/packs/${encodeURIComponent(id)}`);
}

export function saveLearnerPack(examCategoryId: string, selectedCourseIds: string[]) {
  return apiJson<LearnerPackSummary>('/api/mobile/packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examCategoryId, selectedCourseIds }),
  });
}

export function updateLearnerPackCourses(packId: string, selectedCourseIds: string[]) {
  return apiJson<LearnerPackSummary>(`/api/mobile/packs/${encodeURIComponent(packId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedCourseIds }),
  });
}

export function addCoursesToPack(packId: string, courseIds: string[]) {
  return apiJson<LearnerPackSummary>(
    `/api/mobile/packs/${encodeURIComponent(packId)}/courses`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseIds }),
    },
  );
}

export function prepareSubscribe(packId: string, entitlementPackId?: string) {
  return apiJson<{
    ready: boolean;
    requiresPayment: boolean;
    durationDays: number;
    amountCents: number;
    entitlementPackId: string;
    providers: MomoProvider[];
    pack: LearnerPackSummary;
  }>(`/api/mobile/packs/${encodeURIComponent(packId)}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entitlementPackId ? { entitlementPackId } : {}),
  });
}

export function initiateMomoPayment(input: {
  learnerPackId: string;
  provider: MomoProvider;
  phone?: string;
}) {
  return apiJson<{
    paymentId: string;
    externalRef: string;
    status: string;
    provider: string;
    amountCents: number;
    mockAutoComplete: boolean;
    durationDays: number;
    pack: LearnerPackSummary | null;
  }>('/api/mobile/payments/momo/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function listPaymentHistory() {
  return apiJson<{ payments: PaymentHistoryItem[] }>('/api/mobile/payments/history');
}
