import { baseEs } from "./base";
import { clientEs } from "./client";
import { adminAEs } from "./adminA";
import { adminBEs } from "./adminB";

export const es = { ...baseEs, ...clientEs, ...adminAEs, ...adminBEs };
