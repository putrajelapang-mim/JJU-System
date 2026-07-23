const DOC_PREFIXES: Record<string, string> = { quotation: 'Q', invoice: 'INV', resit: 'RCT' };

export async function nextDocNumber(
  db: D1Database,
  companyId: string,
  docType: 'quotation' | 'invoice' | 'resit'
): Promise<string> {
  const updated = await db
    .prepare(
      'UPDATE doc_sequences SET last_number = last_number + 1 WHERE company_id = ? AND doc_type = ? RETURNING last_number'
    )
    .bind(companyId, docType)
    .first<{ last_number: number }>();

  let number: number;
  if (updated) {
    number = updated.last_number;
  } else {
    await db
      .prepare('INSERT INTO doc_sequences (company_id, doc_type, last_number) VALUES (?, ?, 1)')
      .bind(companyId, docType)
      .run();
    number = 1;
  }

  return `${DOC_PREFIXES[docType]}-${String(number).padStart(4, '0')}`;
}
