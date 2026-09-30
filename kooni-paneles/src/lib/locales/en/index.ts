import { es } from "../es";
import { baseEn } from "./base";
import { clientEn } from "./client";
import { adminAEn } from "./adminA";
import { adminBEn } from "./adminB";
import { landingEn } from "./landing";

export const en: Record<keyof typeof es, string> = {
  ...baseEn,
  ...clientEn,
  ...adminAEn,
  ...adminBEn,
  ...landingEn,
};
