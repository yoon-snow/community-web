import { createHmac, timingSafeEqual } from "node:crypto";
export function receiptProof(id: string) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update("spotlight-support-application:" + id)
    .digest("hex");
}
export function validReceipt(id: string, proof: string) {
  return (
    /^[a-f0-9]{64}$/.test(proof) &&
    timingSafeEqual(Buffer.from(receiptProof(id)), Buffer.from(proof))
  );
}
