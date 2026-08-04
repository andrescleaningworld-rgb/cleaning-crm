// Shared banner for both to-do print layouts — kept as its own component
// since PrintTaskSheet and PrintByManager both need the identical
// title/date-generated markup.
export default function PrintHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between border-b-2 border-slate-800 pb-2">
      <h1 className="text-xl font-bold">To-Do List</h1>
      <div className="text-right text-xs text-slate-600">
        <p>Generated {new Date().toLocaleDateString()}</p>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
