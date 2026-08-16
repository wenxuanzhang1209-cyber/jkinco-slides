import type { RichText, TextStyle } from '@jkinco/scene-schema';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Render rich text as HTML (used by print/PDF export and previews). */
export function richTextToHtml(text: RichText | undefined | null, style: TextStyle = {}): string {
  if (!text) return '';
  const baseFont = style.fontSize ?? 18;
  const baseColor = style.color ?? '#1E293B';
  const baseFamily = style.fontFamily ?? 'inherit';
  const align = style.align ?? 'left';
  const paragraphs = text.paragraphs
    .map((p) => {
      const pAlign = p.align ?? align;
      const runs = p.runs
        .map((r) => {
          const size = r.fontSize ?? baseFont;
          const color = r.color ?? baseColor;
          const family = r.fontFamily ?? baseFamily;
          const tags: string[] = [];
          if (r.bold) tags.push('strong');
          if (r.italic) tags.push('em');
          if (r.underline) tags.push('u');
          let html = escapeHtml(r.text);
          for (const t of [...tags].reverse()) html = `<${t}>${html}</${t}>`;
          return `<span style="font-size:${size}pt;color:${color};font-family:${family}">${html}</span>`;
        })
        .join('');
      const bullet = p.bullet ? `<span style="padding-right:6pt">${escapeHtml(p.bulletChar ?? '•')}</span>` : '';
      const indent = (p.indent ?? 0) * 18 + (p.bullet ? 0 : 0);
      const marginLeft = p.bullet || indent > 0 ? `${(p.bullet ? 0 : 0) + indent}pt` : '0';
      void marginLeft;
      return `<p style="margin:0;text-align:${pAlign};padding-left:${p.bullet ? 18 : indent}pt;text-indent:-${p.bullet ? 18 : 0}pt">${bullet}${runs}</p>`;
    })
    .join('');
  const lineSpacing = style.lineSpacing ?? 1.4;
  return `<div style="font-size:${baseFont}pt;color:${baseColor};line-height:${lineSpacing}">${paragraphs}</div>`;
}

/** Plain-text fallback. */
export function richTextToPlain(text: RichText | undefined | null): string {
  if (!text) return '';
  return text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
}
