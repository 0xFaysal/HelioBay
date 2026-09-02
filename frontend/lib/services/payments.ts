"use client";
import { getOwnerData } from "@/store/demo-store";

export const paymentService = {
  list: () => getOwnerData().payments,
  get: (id: string) => getOwnerData().payments.find(p => p.id === id)
};
