import type { APIRoute } from 'astro';
import type { LedgerEntry } from '../../lib/ledger';

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export const GET: APIRoute = async ({ locals, redirect }) => {
  if (!locals.studio?.canLedger) {
    return redirect('/team?error=forbidden');
  }

  const { data } = await locals.supabase
    .from('ledger_entries')
    .select('*')
    .order('occurred_on', { ascending: false });

  const rows = (data ?? []) as LedgerEntry[];
  const header = ['Date', 'Kind', 'Amount', 'Currency', 'Category', 'Notes', 'Project ID'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        csvCell(row.occurred_on),
        csvCell(row.kind),
        csvCell(String(row.amount)),
        csvCell(row.currency),
        csvCell(row.category ?? ''),
        csvCell(row.notes ?? ''),
        csvCell(row.project_id ?? ''),
      ].join(','),
    ),
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ledger.csv"',
      'Cache-Control': 'no-store',
    },
  });
};
