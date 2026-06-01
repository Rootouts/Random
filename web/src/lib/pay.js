// One-time order checkout. (For auto-renew, call /api/subscribe and pass subscription_id instead of order_id.)
export async function checkout({ plan, userId, onDone }) {
  const r = await fetch(`${import.meta.env.VITE_SIGNAL_URL}/api/order`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, userId }),
  });
  const { orderId, amount, keyId } = await r.json();
  new window.Razorpay({
    key: keyId, amount, currency: "INR", order_id: orderId,
    name: "RandomTalk", description: plan === "month" ? "Premium — Monthly" : "Premium — Daily",
    notes: { userId, plan }, theme: { color: "#2563eb" },
    handler: () => onDone?.(),   // server confirms via webhook → flips premium=true
  }).open();
}
