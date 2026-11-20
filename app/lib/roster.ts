export const nameKey = (name: string) =>
  name.normalize('NFKC').trim().replace(/^@/, '').trim().replace(/\s+/gu, ' ').toLowerCase();

export function csvNames(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let pos = 0; pos <= source.length; pos++) {
    const char = source[pos];
    if (quoted) {
      if (char === undefined) throw new Error('เครื่องหมายคำพูดในไฟล์ CSV ไม่ครบ');
      if (char !== '"') cell += char;
      else if (source[pos + 1] === '"') { cell += '"'; pos++; }
      else { quoted = false; closed = true; }
    } else if (char === ',' || char === '\r' || char === '\n' || char === undefined) {
      row.push(cell.trim());
      cell = '';
      closed = false;
      if (char !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === '\r' && source[pos + 1] === '\n') pos++;
      }
    } else if (char === '"' && !cell && !closed) {
      quoted = true;
    } else {
      if (char === '"' || closed) throw new Error('รูปแบบไฟล์ CSV ไม่ถูกต้อง');
      cell += char;
    }
  }
  const headers = ['username', 'name', 'participant', 'ชื่อ', 'รายชื่อ'];
  const headerIndex = rows[0]?.findIndex(cell => headers.includes(cell.toLowerCase())) ?? -1;
  const names = (headerIndex < 0 ? rows : rows.slice(1))
    .map(row => row[Math.max(0, headerIndex)] || '').filter(Boolean);
  if (!names.length || names.some(name => name.length > 80 || /[\r\n]/.test(name))) {
    throw new Error('CSV ต้องมีชื่อผู้ร่วมลุ้น 1–80 ตัวอักษรต่อคน');
  }
  return names;
}
