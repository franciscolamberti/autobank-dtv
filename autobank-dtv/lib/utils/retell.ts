import { Retell } from "retell-sdk";

export function verifyWebhookSignature(
  body: string,
  signature: string | null,
  apiKey: string
): boolean {
  if (!signature) return false;

  try {
    return Retell.verify(body, apiKey, signature);
  } catch (error) {
    console.error("[retell-webhook] Signature verification error:", error);
    return false;
  }
}
