import type { ReactNode } from "react";
import { Card, CardBody } from "../../components/ui/Card";

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <p className="text-xs text-ink-faint">Last updated: {updated}</p>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-6">{children}</CardBody>
      </Card>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold text-ink">{heading}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-muted [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-4 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </div>
    </section>
  );
}
