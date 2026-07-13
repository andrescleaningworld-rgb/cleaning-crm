type Field = {
  label: string;
  value: string;
};

function PrintField({ label, value }: Field) {
  return (
    <div className="account-packet-print-field">
      <span className="account-packet-print-label">{label}</span>
      <span className="account-packet-print-value">{value || "N/A"}</span>
    </div>
  );
}

// Print-only branded packet — hidden on screen (see .account-packet-print-view
// in globals.css), and the ONLY thing visible when printed. Deliberately
// takes just the fields meant for a Team Leader; internal notes are never
// passed in here (see the caller in page.tsx).
export function AccountPacketPrintView({
  accountName,
  address,
  startDate,
  cleaningSchedule,
  subcontractor,
  monthlySubcontractorPay,
  hasKey,
  alarmInfo,
  scope,
  manager,
}: {
  accountName: string;
  address: string;
  startDate: string;
  cleaningSchedule: string;
  subcontractor: string;
  monthlySubcontractorPay: string;
  hasKey: string;
  alarmInfo: string;
  scope: string;
  manager: string;
}) {
  return (
    <div className="account-packet-print-view">
      <div className="account-packet-print-header">
        <div className="account-packet-print-logo-box">
          {/* eslint-disable-next-line @next/next/no-img-element -- print-only static image, next/image adds no value here */}
          <img src="/cw-logo.jpg" alt="Cleaning World Inc." />
        </div>

        <div className="account-packet-print-title">
          <h1>New Account Packet</h1>
          <p>For Your Team Leader</p>
        </div>
      </div>

      <div className="account-packet-print-body">
        <section>
          <h2>Account Snapshot</h2>
          <div className="account-packet-print-grid">
            <PrintField label="Account Name" value={accountName} />
            <PrintField label="Address" value={address} />
            <PrintField label="Start Date" value={startDate} />
            <PrintField label="Cleaning Schedule" value={cleaningSchedule} />
          </div>
        </section>

        <section>
          <h2>Team Leader Assignment</h2>
          <div className="account-packet-print-grid">
            <PrintField label="Team Leader Name" value={subcontractor} />
            <PrintField label="Monthly Pay" value={monthlySubcontractorPay} />
          </div>
        </section>

        <section>
          <h2>Access</h2>
          <div className="account-packet-print-grid">
            <PrintField label="Has Key" value={hasKey} />
            <PrintField label="Alarm Info" value={alarmInfo} />
          </div>
        </section>

        <section>
          <h2>Scope of Work</h2>
          <p className="account-packet-print-scope">{scope || "N/A"}</p>
        </section>
      </div>

      <div className="account-packet-print-footer">
        <div>
          <p className="account-packet-print-company">Cleaning World Inc.</p>
          <p>90 Burlews Ct, Hackensack, NJ 07601</p>
          <p>201-487-1313</p>
        </div>

        <p className="account-packet-print-note">Questions? Contact your manager: {manager || "N/A"}</p>
      </div>
    </div>
  );
}
