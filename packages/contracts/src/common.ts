export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiContract = {
  method: ApiMethod;
  path: string;
  summary: string;
  auth: "public" | "user" | "admin";
};

export type Money = {
  amount: string;
  currency: "USD" | "INR";
};

export type Pagination = {
  page: number;
  pageSize: number;
};
