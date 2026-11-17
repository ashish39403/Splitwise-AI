import { getAccessToken } from "./auth";

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export type HealthResponse = {
  status: "ok";
  service: string;
};

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "service" in value &&
    value.status === "ok" &&
    typeof value.service === "string"
  );
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/api/health/`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch {
    throw new ApiError("Could not reach the Django API.");
  }

  if (!response.ok) {
    throw new ApiError(`The Django API returned ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!isHealthResponse(payload)) {
    throw new ApiError(
      "The Django API returned an unexpected health response.",
    );
  }

  return payload;
}

export type Profile = {
  id: string;
  neon_auth_user_id: string;
  display_name: string;
  email: string;
};

export type GroupSummary = {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  current_membership: {
    profile_id: string;
    role: "admin" | "member";
    status: "active" | "invited" | "left";
  };
};

export type GroupMember = {
  id: string;
  display_name: string;
  email: string;
  role: "admin" | "member";
  status: "active" | "invited" | "left";
  joined_at: string;
};

export type GroupDetail = GroupSummary & { members: GroupMember[] };

export type ExpenseParticipant = {
  profile_id: string;
  display_name: string;
  share_amount_minor: number;
  percentage: string | null;
};

export type Expense = {
  id: string;
  group_id: string;
  description: string;
  amount_minor: number;
  currency: string;
  payer: { id: string; display_name: string };
  split_method: "equal" | "custom" | "percentage";
  expense_date: string;
  source: "manual" | "ai_quick_add";
  created_by: string;
  created_at: string;
  updated_at: string;
  participants: ExpenseParticipant[];
};

export type ExpenseInput = {
  description: string;
  amount_minor: number;
  currency: "INR";
  payer_id: string;
  split_method: "equal" | "custom" | "percentage";
  expense_date: string;
  source?: "manual" | "ai_quick_add";
  participants: Array<{
    profile_id: string;
    share_amount_minor?: number;
    percentage?: string;
  }>;
};

export type AIQuickAddDraft = {
  description: string;
  amount_minor: number;
  currency: string;
  payer: { id: string; display_name: string };
  split_method: "equal" | "custom" | "percentage";
  expense_date: string;
  participants: Array<{
    profile_id: string;
    display_name: string;
    share_amount_minor: number;
    percentage: string | null;
  }>;
  warnings: string[];
  source: "ai_quick_add";
};

export type GroupBalance = {
  profile_id: string;
  display_name: string;
  net_balance_minor: number;
};

export type SettlementRecommendation = {
  payer_id: string;
  payer_name: string;
  receiver_id: string;
  receiver_name: string;
  amount_minor: number;
};

export type BalancesResponse = {
  members: GroupBalance[];
  recommendations: SettlementRecommendation[];
};

export type Settlement = {
  id: string;
  group_id: string;
  payer: { id: string; display_name: string };
  receiver: { id: string; display_name: string };
  amount_minor: number;
  currency: string;
  settled_on: string;
  status: "recorded" | "confirmed" | "cancelled";
  note: string;
  created_by: string;
  created_at: string;
};

async function authorizedFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
  allowRefresh = true,
): Promise<Response> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status !== 401 || !allowRefresh) return response;

  const refreshedToken = await getAccessToken({ forceRefresh: true });
  if (!refreshedToken) return response;

  if (import.meta.env.DEV && refreshedToken === accessToken) {
    // A "force refresh" that returns the identical token cannot fix a 401.
    // Logging this (without the token value) distinguishes a no-op SDK refresh
    // from a genuinely new JWT in the browser console.
    console.warn(`[api] 401 on ${path}: force refresh returned the same token.`);
    return response;
  }

  return authorizedFetch(path, refreshedToken, options, false);
}

export async function getMe(accessToken: string): Promise<Profile> {
  const response = await authorizedFetch("/api/me/", accessToken);
  if (!response.ok)
    throw new ApiError(
      response.status === 401
        ? "Your session has expired."
        : "Could not load your profile.",
    );
  return response.json() as Promise<Profile>;
}

async function groupRequest<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authorizedFetch(path, accessToken, options);
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null
        ? Object.values(payload as Record<string, unknown>)
            .flat()
            .join(" ")
        : "";
    throw new ApiError(detail || `Request failed (${response.status}).`);
  }
  return payload as T;
}

export function getGroups(accessToken: string) {
  return groupRequest<GroupSummary[]>("/api/groups/", accessToken);
}

export function createGroup(
  accessToken: string,
  input: { name: string; description: string },
) {
  return groupRequest<GroupSummary>("/api/groups/", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createDemoWorkspace(accessToken: string) {
  return groupRequest<GroupSummary>("/api/demo/workspace/", accessToken, {
    method: "POST",
  });
}

export function getGroup(accessToken: string, groupId: string) {
  return groupRequest<GroupDetail>(`/api/groups/${groupId}/`, accessToken);
}

export function addGroupMember(
  accessToken: string,
  groupId: string,
  email: string,
) {
  return groupRequest<GroupMember>(
    `/api/groups/${groupId}/members/`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export function removeGroupMember(
  accessToken: string,
  groupId: string,
  profileId: string,
) {
  return groupRequest<void>(
    `/api/groups/${groupId}/members/${profileId}/`,
    accessToken,
    {
      method: "DELETE",
    },
  );
}

export function getGroupExpenses(accessToken: string, groupId: string) {
  return groupRequest<Expense[]>(
    `/api/groups/${groupId}/expenses/`,
    accessToken,
  );
}

export function getExpense(
  accessToken: string,
  groupId: string,
  expenseId: string,
) {
  return groupRequest<Expense>(
    `/api/groups/${groupId}/expenses/${expenseId}/`,
    accessToken,
  );
}

export function createExpense(
  accessToken: string,
  groupId: string,
  input: ExpenseInput,
) {
  return groupRequest<Expense>(
    `/api/groups/${groupId}/expenses/`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateExpense(
  accessToken: string,
  groupId: string,
  expenseId: string,
  input: ExpenseInput,
) {
  return groupRequest<Expense>(
    `/api/groups/${groupId}/expenses/${expenseId}/`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function deleteExpense(
  accessToken: string,
  groupId: string,
  expenseId: string,
) {
  return groupRequest<void>(
    `/api/groups/${groupId}/expenses/${expenseId}/`,
    accessToken,
    {
      method: "DELETE",
    },
  );
}

export function getGroupBalances(accessToken: string, groupId: string) {
  return groupRequest<BalancesResponse>(
    `/api/groups/${groupId}/balances/`,
    accessToken,
  );
}

export function getGroupSettlements(accessToken: string, groupId: string) {
  return groupRequest<Settlement[]>(
    `/api/groups/${groupId}/settlements/`,
    accessToken,
  );
}

export function createSettlement(
  accessToken: string,
  groupId: string,
  input: {
    payer_id: string;
    receiver_id: string;
    amount_minor: number;
    settled_on: string;
    note: string;
  },
) {
  return groupRequest<Settlement>(
    `/api/groups/${groupId}/settlements/`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateSettlementStatus(
  accessToken: string,
  groupId: string,
  settlementId: string,
  status: "confirmed" | "cancelled",
) {
  return groupRequest<Settlement>(
    `/api/groups/${groupId}/settlements/${settlementId}/`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
}

export async function quickAddExpense(
  accessToken: string,
  groupId: string,
  text: string,
): Promise<AIQuickAddDraft> {
  try {
    return await groupRequest<AIQuickAddDraft>(
      `/api/groups/${groupId}/ai/quick-add/`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(25_000),
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError(
        "AI Quick Add timed out. Please try again or add the expense manually.",
      );
    }
    throw error;
  }
}
