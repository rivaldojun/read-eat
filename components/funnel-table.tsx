import { formatMoneyCents } from "@/lib/format";
import type { SourceFunnel } from "@/lib/queries/attribution";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Revenue funnel per source: posted -> clicks -> signups -> trials -> paid -> MRR. */
export function FunnelTable({ rows }: { rows: SourceFunnel[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No posted replies yet — nothing to attribute.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Posted</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">Signups</TableHead>
          <TableHead className="text-right">Trials</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">MRR</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.sourceId}>
            <TableCell className="font-medium">{r.sourceName}</TableCell>
            <TableCell className="text-right">{r.posted}</TableCell>
            <TableCell className="text-right">{r.clicks}</TableCell>
            <TableCell className="text-right">{r.signups}</TableCell>
            <TableCell className="text-right">{r.trials}</TableCell>
            <TableCell className="text-right">{r.paidUsers}</TableCell>
            <TableCell className="text-right font-semibold">
              {formatMoneyCents(r.mrrCents)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
