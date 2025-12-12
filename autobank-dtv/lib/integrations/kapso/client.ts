import axios from "axios";

const apiKey = process.env.KAPSO_API_KEY;

if (!apiKey) {
  throw new Error("KAPSO_API_KEY environment variable not set");
}

export const kapsoClient = axios.create({
  baseURL: "https://api.kapso.ai",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  },
});
