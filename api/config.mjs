import { getPublicConfig } from "../lib/catalog.mjs";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json(getPublicConfig());
}
