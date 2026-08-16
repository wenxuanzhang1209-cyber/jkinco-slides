import {
  SLIDE_H,
  SLIDE_W,
  createImage,
  createShape,
  createSlide,
  createText,
  textFromLines,
  type Slide,
  type Theme,
} from '@jkinco/scene-schema';

/**
 * Cover slide (§10 grammar): gradient background, large title, muted subtitle,
 * optional accent bar / footer / logo.
 */
export function buildCoverSlide(
  title: string,
  subtitle: string,
  theme: Theme,
  opts: { footer?: string; logo?: string } = {},
): Slide {
  const elements = [];
  let z = 0;

  if (theme.cover.accentBar) {
    elements.push(
      createShape('rect', 80, 150, 80, 6, {
        fill: { type: 'solid', color: theme.cover.accentBarColor, opacity: 1 },
        stroke: { color: theme.cover.accentBarColor, width: 0, style: 'solid' },
        zIndex: z++,
      }),
    );
  }

  elements.push(
    createText(80, 176, 800, 100, title, {
      role: 'title',
      style: {
        fontSize: theme.cover.titleFontSize,
        color: theme.title.color,
        bold: theme.title.bold,
        align: theme.title.align,
      },
      zIndex: z++,
    }),
  );

  elements.push(
    createText(80, 290, 800, 60, subtitle, {
      role: 'subtitle',
      style: { fontSize: theme.subtitle.fontSize, color: theme.subtitle.color },
      zIndex: z++,
    }),
  );

  if (opts.footer) {
    elements.push(
      createText(SLIDE_W - 400, SLIDE_H - 44, 360, 28, opts.footer, {
        role: 'footnote',
        style: { fontSize: theme.footer.fontSize, color: theme.footer.color, align: 'right' },
        zIndex: z++,
      }),
    );
  }

  if (opts.logo) {
    elements.push(
      createImage(40, SLIDE_H - 88, 128, 44, opts.logo, {
        role: 'logo',
        objectFit: 'contain',
        zIndex: z++,
      }),
    );
  }

  return createSlide({
    purpose: 'cover',
    elements,
    background: {
      type: 'gradient',
      from: '#FFFFFF',
      to: theme.colors.primaryLight ?? theme.colors.primary,
      angle: 135,
    },
  });
}

/**
 * Section divider slide (§10 grammar): solid primary background, white label,
 * optional marker bar or big number, white title.
 */
export function buildSectionSlide(
  label: string,
  title: string,
  theme: Theme,
  opts: { marker?: 'number' | 'bar' | 'none' } = {},
): Slide {
  const marker = opts.marker ?? 'bar';
  const elements = [];
  let z = 0;

  if (marker === 'bar') {
    elements.push(
      createShape('rect', 80, 140, 80, 6, {
        fill: { type: 'solid', color: '#FFFFFF', opacity: 1 },
        stroke: { color: '#FFFFFF', width: 0, style: 'solid' },
        zIndex: z++,
      }),
    );
  } else if (marker === 'number') {
    const number = /(\d+)/.exec(label)?.[1] ?? '01';
    elements.push(
      createText(80, 60, 200, 130, number, {
        style: { fontSize: 96, color: '#FFFFFF', bold: true },
        zIndex: z++,
      }),
    );
  }

  elements.push(
    createText(80, 200, 800, 50, label, {
      role: 'section_label',
      style: { fontSize: 24, color: '#FFFFFF', bold: true, align: 'left' },
      zIndex: z++,
    }),
  );

  elements.push(
    createText(80, 262, 800, 90, title, {
      role: 'title',
      style: { fontSize: theme.cover.titleFontSize, color: '#FFFFFF', bold: true, align: 'left' },
      zIndex: z++,
    }),
  );

  return createSlide({
    purpose: 'section',
    elements,
    background: { type: 'solid', color: theme.colors.primary },
  });
}

/**
 * Summary slide (§10 grammar): title, bullet list, key message.
 */
export function buildSummarySlide(
  points: string[],
  theme: Theme,
  opts: { title?: string } = {},
): Slide {
  const elements = [];
  let z = 0;

  elements.push(
    createText(80, 56, 800, 70, opts.title ?? '总结', {
      role: 'title',
      style: {
        fontSize: theme.title.fontSize,
        color: theme.title.color,
        bold: theme.title.bold,
        align: theme.title.align,
      },
      zIndex: z++,
    }),
  );

  const bullets = textFromLines(points.map((p) => `- ${p}`), { align: 'left' });
  elements.push(
    createText(80, 150, 800, 300, bullets, {
      role: 'bullet',
      style: {
        fontSize: theme.body.fontSize,
        color: theme.body.color,
        lineSpacing: theme.body.lineSpacing,
      },
      zIndex: z++,
    }),
  );

  if (points.length > 0) {
    elements.push(
      createText(80, 470, 800, 50, points[points.length - 1]!, {
        role: 'key_message',
        style: { fontSize: 20, bold: true, color: theme.colors.primary },
        zIndex: z++,
      }),
    );
  }

  return createSlide({
    purpose: 'summary',
    elements,
    background: { type: 'solid', color: '#FFFFFF' },
  });
}
