import crypto from "crypto";

export function verifyKapsoWebhook(
  payload: string,
  signature: string | null,
  secret: string | undefined
) {
  if (!signature || !secret) {
    throw new Error("Missing signature or secret");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  const verified = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!verified) throw new Error("Invalid webhook signature");

  return verified;
}
