import { supabase } from "./supabase";
export async function checkout({ plan, onDone }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const r = await fetch(`${import.meta.env.VITE_SIGNAL_URL}/api/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ plan }),
  });
  const { orderId, amount, keyId } = await r.json();
  new window.Razorpay({
    key: keyId, amount, currency: "INR", order_id: orderId,
    name: "RandomTalk", description: plan === "month" ? "Premium — Monthly" : "Premium — Daily",
    theme: { color: "#2563eb" }, handler: () => onDone?.(),
  }).open();
}
