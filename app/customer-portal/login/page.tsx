"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export default function CustomerLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "getAccount",
          customerId: digits,
          phone: digits,
        }),
      });

      const data = await res.json();
      const account =
        data.account ||
        (Array.isArray(data.accounts) && data.accounts[0]) ||
        null;

      if (!account) {
        setError(
          "We couldn't find an account with that phone number. Please double-check the number or contact Cleaning World directly."
        );
        return;
      }

      const acc = account as Record<string, unknown>;
      const accountName = String(acc.accountName || acc.name || "Your Account");

      localStorage.setItem("cwCustomerId", digits);
      localStorage.setItem("cwCustomerName", accountName);
      localStorage.setItem("cwRole", "customer");

      router.push("/customer-portal");
    } catch {
      setError("Something went wrong. Please try again or contact us directly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ui-screen">
      <div className="ui-stack">
        <div className="ui-card ui-stack">
          <div>
            <div className="ui-portal-mark">
              <span className="ui-strong">CW</span>
            </div>
            <p className="ui-strong">
              Cleaning World
            </p>
            <h1 className="ui-screen-title">
              Customer Portal
            </h1>
            <p className="ui-muted">
              Enter the phone number on your Cleaning World account to access
              your portal.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="ui-stack">
            <div>
              <label
                htmlFor="phone"
                className="ui-label"
              >
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
                autoComplete="tel"
                className="ui-input w-full"
                placeholder="(555) 555-5555"
              />
            </div>

            {error && (
              <div className="ui-field-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-main w-full"
            >
              {loading ? "Looking up your account..." : "Access My Account"}
            </button>
          </form>

          <p className="ui-muted">
            Having trouble? Contact Cleaning World and we&apos;ll help you right
            away.
          </p>
        </div>
      </div>
    </div>
  );
}
