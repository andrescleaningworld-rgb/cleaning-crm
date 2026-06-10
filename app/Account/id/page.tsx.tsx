async function getAccounts() {
  const res = await fetch(
    "https://script.google.com/macros/s/AKfycbxScdZai2c5UzioFsaN-xYLOVEgqQGPEsQP1yqijnU7ie9lJYfy3kCWRroiViDLTxkT/exec",
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error("Failed to load data");
  }

  return res.json();
}

export default async function AccountPage({
  params,
}: {
  params: { id: string };
}) {
  const accounts = await getAccounts();
  const account = accounts[Number(params.id)];

  if (!account) {
    return <main className="p-6">Account not found</main>;
  }

  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold mb-6">
        {account.Account || account.Name || "Account Detail"}
      </h1>

      <div className="grid gap-3">
        {Object.entries(account).map(([key, value]) => (
          <div key={key} className="border rounded-lg p-3">
            <div className="text-sm text-gray-500">{key}</div>
            <div className="text-lg">{String(value)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}